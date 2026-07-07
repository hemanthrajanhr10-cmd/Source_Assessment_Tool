"""
Fabric workspace assessment routes.

Auth flow  (device-code):
  POST /fabric/auth/start               → {auth_id, user_code, verification_url, expires_at}
  GET  /fabric/auth/{id}/status         → {status: 'pending'|'ready'|'error'|'not_found'}
  GET  /fabric/auth/{id}/workspaces     → FabricWorkspaceInfo[]
  POST /fabric/auth/{id}/workspace-items→ FabricWorkspaceItems[]

Session flow:
  POST /fabric/sessions                 → {fabric_session_id, status}  (202, async)
  GET  /fabric/sessions                 → FabricSessionRecord[]
  GET  /fabric/sessions/{id}            → FabricSessionRecord
  POST /fabric/sessions/{id}/cancel     → {ok: true}
  GET  /fabric/sessions/{id}/export/excel → Excel blob

Additional endpoints (for standalone use):
  POST /api/auth/token                  → {token_acquired, expires_at}
  POST /api/extract                     → {job_id, status}
  GET  /api/extract/{job_id}/status     → {status, progress_pct, error?}
  GET  /api/extract/{job_id}/result     → AssessmentResult payload
"""

import asyncio
import functools
import io
import json
import threading
import time
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi.responses import Response, StreamingResponse

from app.services import fabric_progress as _progress_store
from app.utils.rate_limiter import fabric_rate_limiter
from pydantic import BaseModel

from app.config import settings
from app.core.dependencies import get_current_user
from app.core.logging import get_logger
from app.db import azure_store
from app.fabric_assessment import dataflow_parser, report_parser, tmdl_parser
from app.services import fabric_client

logger = get_logger(__name__)
router = APIRouter()


# ── In-memory auth sessions ───────────────────────────────────────────────────
# Keyed by auth_id (UUID string).
# status: 'starting' | 'pending' | 'ready' | 'error'

_AUTH: dict[str, dict[str, Any]] = {}
_AUTH_LOCK = threading.Lock()

# In-memory extraction job store (for /api/extract endpoints)
_JOBS: dict[str, dict[str, Any]] = {}


# ── Request / response models ─────────────────────────────────────────────────

class ServicePrincipalAuthRequest(BaseModel):
    tenant_id: str
    client_id: str
    client_secret: str


class WorkspaceItemsRequest(BaseModel):
    workspace_ids: list[str]


class CreateSessionRequest(BaseModel):
    auth_id: str
    label: str | None = None
    workspace_ids: list[str] = []
    dataset_ids: list[str] = []
    report_ids: list[str] = []
    dataflow_ids: list[str] = []
    unified_session_id: str | None = None


class ExtractRequest(BaseModel):
    workspace_id: str
    model_id: str
    report_id: str
    format: str = "TMDL"


class FabricTokenRequest(BaseModel):
    workspace_id: str | None = None
    model_id: str | None = None
    report_id: str | None = None


# ── Device-code auth helpers ──────────────────────────────────────────────────

# Fallback public client ID (Azure CLI) used when FABRIC_CLIENT_ID is not set.
_FALLBACK_CLIENT_ID = "04b07795-8ddb-461a-bbee-02f9e1bf7b46"


def _run_device_code_auth(auth_id: str) -> None:
    """
    Blocking function run in a background thread.
    Uses azure-identity DeviceCodeCredential to acquire a Fabric token.
    """
    try:
        from azure.identity import DeviceCodeCredential

        def _prompt(uri: str, code: str, expires_on):
            with _AUTH_LOCK:
                _AUTH[auth_id].update({
                    "user_code": code,
                    "verification_url": uri,
                    "expires_at": expires_on.isoformat() if hasattr(expires_on, "isoformat") else str(expires_on),
                    "status": "pending",
                })

        credential = DeviceCodeCredential(
            client_id=settings.fabric_client_id or _FALLBACK_CLIENT_ID,
            tenant_id=settings.fabric_tenant_id,
            prompt_callback=_prompt,
        )
        token_obj = credential.get_token("https://api.fabric.microsoft.com/.default")
        with _AUTH_LOCK:
            _AUTH[auth_id]["token"] = token_obj.token
            _AUTH[auth_id]["status"] = "ready"
        logger.info("Fabric device-code auth completed for session %s", auth_id)

    except Exception as exc:
        logger.error("Fabric auth failed (%s): %s", auth_id, exc)
        with _AUTH_LOCK:
            if auth_id in _AUTH:
                _AUTH[auth_id]["status"] = "error"
                _AUTH[auth_id]["error"] = str(exc)


def _get_token(auth_id: str) -> str:
    """Return token for auth_id or raise 401."""
    with _AUTH_LOCK:
        session = _AUTH.get(auth_id)
    if not session:
        raise HTTPException(status_code=404, detail="Auth session not found")
    if session.get("status") != "ready":
        raise HTTPException(status_code=401, detail="token_expired")
    return session["token"]


# ── Auth endpoints ─────────────────────────────────────────────────────────────

@router.post("/auth/start")
async def fabric_auth_start(_: Any = Depends(get_current_user)):
    """Initiate device-code flow. Returns user_code + verification_url."""
    auth_id = str(uuid.uuid4())
    with _AUTH_LOCK:
        _AUTH[auth_id] = {"status": "starting", "token": None, "error": None}

    # Fire auth in a real background thread (DeviceCodeCredential.get_token blocks)
    t = threading.Thread(target=_run_device_code_auth, args=(auth_id,), daemon=True)
    t.start()

    # Wait up to 8 s for the prompt callback to fire so we can return user_code
    for _ in range(16):
        await asyncio.sleep(0.5)
        with _AUTH_LOCK:
            sess = _AUTH.get(auth_id, {})
        if sess.get("status") != "starting":
            break

    with _AUTH_LOCK:
        sess = _AUTH.get(auth_id, {})

    if sess.get("status") == "error":
        raise HTTPException(status_code=503, detail=sess.get("error", "Auth failed"))

    return {
        "auth_id": auth_id,
        "user_code": sess.get("user_code", ""),
        "verification_url": sess.get("verification_url", "https://microsoft.com/devicelogin"),
        "expires_at": sess.get("expires_at", ""),
    }


@router.post("/auth/service-principal")
async def fabric_auth_service_principal(
    body: ServicePrincipalAuthRequest,
    _: Any = Depends(get_current_user),
):
    """
    Acquire a Fabric token via Service Principal (client credentials flow).
    Synchronous — no polling needed. Returns auth_id immediately with status 'ready'.

    The client_secret is used only to construct the credential in-memory;
    it is never logged, stored, or included in any response.
    This endpoint must only be exposed over HTTPS in production.
    """
    tenant_id     = body.tenant_id.strip()
    client_id     = body.client_id.strip()
    # Keep client_secret in a local variable only for the duration of this call;
    # we reference body.client_secret once and then let it fall out of scope.
    client_secret = body.client_secret  # not stripped — secrets may have whitespace

    if not tenant_id or not client_id or not client_secret:
        raise HTTPException(status_code=422, detail="tenant_id, client_id, and client_secret are all required.")

    try:
        from azure.identity import ClientSecretCredential

        credential = ClientSecretCredential(
            tenant_id=tenant_id,
            client_id=client_id,
            client_secret=client_secret,
        )
        token_obj = credential.get_token("https://api.fabric.microsoft.com/.default")

        # Drop the secret reference — it is no longer needed after this point.
        del client_secret

    except Exception as exc:
        # Drop secret even on failure path.
        try:
            del client_secret
        except NameError:
            pass

        err_str = str(exc)
        # Map well-known Azure AD error codes to actionable messages.
        if "AADSTS7000215" in err_str:
            raise HTTPException(
                status_code=401,
                detail="Invalid client secret. Check the secret value and its expiry date in Azure portal.",
            )
        if "AADSTS700016" in err_str:
            raise HTTPException(
                status_code=401,
                detail="Application not found in the tenant. Verify the client_id and tenant_id.",
            )
        if "AADSTS90002" in err_str or "AADSTS90004" in err_str:
            raise HTTPException(
                status_code=401,
                detail="Tenant not found. Verify the tenant_id (directory ID).",
            )
        if "AADSTS65001" in err_str or "Insufficient" in err_str or "forbidden" in err_str.lower():
            raise HTTPException(
                status_code=401,
                detail="Insufficient Fabric permissions. Grant the service principal 'Fabric API' permissions in Azure portal.",
            )
        logger.error("Service-principal Fabric auth failed: %s", exc)
        raise HTTPException(status_code=401, detail=f"Authentication failed: {err_str}")

    auth_id = str(uuid.uuid4())
    with _AUTH_LOCK:
        _AUTH[auth_id] = {
            "status": "ready",
            "token": token_obj.token,
            "method": "service_principal",
            "error": None,
        }

    logger.info("Fabric service-principal auth completed for session %s", auth_id)
    return {"auth_id": auth_id, "status": "ready"}


@router.get("/auth/{auth_id}/status")
async def fabric_auth_status(auth_id: str, _: Any = Depends(get_current_user)):
    with _AUTH_LOCK:
        sess = _AUTH.get(auth_id)
    if not sess:
        return {"status": "not_found"}
    return {"status": sess["status"], "error": sess.get("error")}


@router.get("/auth/{auth_id}/workspaces")
async def fabric_list_workspaces(auth_id: str, _: Any = Depends(get_current_user)):
    token = _get_token(auth_id)
    try:
        workspaces = await fabric_client.list_workspaces(token)
        return workspaces
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Fabric API error: {exc}")


@router.post("/auth/{auth_id}/workspace-items")
async def fabric_workspace_items(
    auth_id: str,
    body: WorkspaceItemsRequest,
    _: Any = Depends(get_current_user),
):
    token = _get_token(auth_id)
    results = []
    try:
        for ws_id in body.workspace_ids:
            models, reports, dataflows = await asyncio.gather(
                fabric_client.list_workspace_semantic_models(token, ws_id),
                fabric_client.list_workspace_reports(token, ws_id),
                fabric_client.list_workspace_dataflows(token, ws_id),
            )
            results.append({
                "workspace_id": ws_id,
                "datasets": [
                    {"id": m.get("id", ""), "name": m.get("displayName", m.get("name", ""))}
                    for m in models
                ],
                "reports": [
                    {
                        "id": r.get("id", ""),
                        "name": r.get("displayName", r.get("name", "")),
                        "report_type": r.get("type", "PowerBIReport"),
                    }
                    for r in reports
                ],
                "dataflows": [
                    {
                        "id": df.get("id", ""),
                        "name": df.get("name", ""),
                        "generation": df.get("generation", "Gen2"),
                        "modified_at": df.get("modified_at", ""),
                        "configured_by": df.get("created_by", ""),
                    }
                    for df in dataflows
                ],
            })
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Fabric API error: {exc}")
    return results


# ── Session endpoints ──────────────────────────────────────────────────────────

@router.post("/sessions")
async def create_fabric_session(
    body: CreateSessionRequest,
    background_tasks: BackgroundTasks,
    current_user: Any = Depends(get_current_user),
):
    """Create a Fabric assessment session and start async extraction."""
    token = _get_token(body.auth_id)
    user_id = current_user.get("user_id") if isinstance(current_user, dict) else getattr(current_user, "user_id", None)

    session_id = str(uuid.uuid4())
    azure_store.create_fabric_session(session_id, body.label, user_id)

    if body.unified_session_id:
        try:
            azure_store.link_unified_fabric(body.unified_session_id, session_id)
        except Exception as exc:
            logger.warning("Failed to link unified session: %s", exc)

    background_tasks.add_task(
        _run_fabric_assessment,
        session_id=session_id,
        token=token,
        workspace_ids=body.workspace_ids,
        dataset_ids=set(body.dataset_ids),
        report_ids=set(body.report_ids),
        dataflow_ids=set(body.dataflow_ids),
    )

    return {"fabric_session_id": session_id, "status": "running"}


@router.get("/sessions")
async def list_fabric_sessions(current_user: Any = Depends(get_current_user)):
    user_id = current_user.get("user_id") if isinstance(current_user, dict) else getattr(current_user, "user_id", None)
    rows = azure_store.list_fabric_sessions(user_id)
    return [_format_session_record(r) for r in rows]


@router.get("/sessions/{session_id}")
async def get_fabric_session(session_id: str, _: Any = Depends(get_current_user)):
    row = azure_store.get_fabric_session(session_id)
    if not row:
        raise HTTPException(status_code=404, detail="Fabric session not found")
    # Parse potentially large results JSON off the event loop
    loop = asyncio.get_event_loop()
    record = await loop.run_in_executor(
        None, functools.partial(_format_session_record, row, include_results=True)
    )
    return record


@router.post("/sessions/{session_id}/cancel")
async def cancel_fabric_session(session_id: str, _: Any = Depends(get_current_user)):
    row = azure_store.get_fabric_session(session_id)
    if not row:
        raise HTTPException(status_code=404, detail="Fabric session not found")
    if row.get("status") == "running":
        azure_store.update_fabric_session(
            session_id,
            status="cancelled",
            completed_at=datetime.now(timezone.utc).isoformat(),
        )
    return {"ok": True}


@router.get("/sessions/{session_id}/export/word")
async def export_fabric_word(
    session_id: str,
    client_name: str | None = None,
    regenerate: bool = False,
    _: Any = Depends(get_current_user),
):
    row = azure_store.get_fabric_session(session_id)
    if not row:
        raise HTTPException(status_code=404, detail="Fabric session not found")
    if row.get("status") != "completed":
        raise HTTPException(status_code=400, detail="Session not yet completed")

    if not regenerate:
        cached = azure_store.load_fabric_word_bytes(session_id)
        if cached:
            filename = f"fabric_assessment_{session_id[:8]}.docx"
            return Response(
                content=cached,
                media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                headers={"Content-Disposition": f'attachment; filename="{filename}"'},
            )

    results_json = row.get("results_json") or "{}"
    try:
        results = json.loads(results_json)
    except Exception:
        results = {}

    label = client_name or row.get("label") or None

    from app.services.ai_report_service import build_fabric_ai_word_report
    doc_bytes = build_fabric_ai_word_report(session_id, results, client_name=label)
    azure_store.save_fabric_word_bytes(session_id, doc_bytes)

    filename = f"fabric_assessment_{session_id[:8]}.docx"
    return Response(
        content=doc_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/sessions/{session_id}/export/excel")
async def export_fabric_excel(session_id: str, _: Any = Depends(get_current_user)):
    row = azure_store.get_fabric_session(session_id)
    if not row:
        raise HTTPException(status_code=404, detail="Fabric session not found")
    if row.get("status") != "completed":
        raise HTTPException(status_code=400, detail="Session not yet completed")

    results_json = row.get("results_json") or "{}"
    try:
        results = json.loads(results_json)
    except Exception:
        results = {}

    xlsx_bytes = _generate_excel(results, row.get("label") or session_id)
    filename = f"fabric_assessment_{session_id[:8]}.xlsx"
    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── Standalone /api/auth/token + /api/extract endpoints ───────────────────────

@router.post("/token")
async def fabric_acquire_token(body: FabricTokenRequest, _: Any = Depends(get_current_user)):
    """
    Acquire a Fabric token via InteractiveBrowserCredential (server must have a display).
    Returns token_acquired + expires_at.  Mainly useful for CLI / local environments.
    """
    try:
        from azure.identity import InteractiveBrowserCredential
        cred = InteractiveBrowserCredential()
        token_obj = cred.get_token("https://api.fabric.microsoft.com/.default")
        return {
            "token_acquired": True,
            "expires_at": datetime.fromtimestamp(token_obj.expires_on, tz=timezone.utc).isoformat(),
        }
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@router.post("/extract")
async def trigger_extraction(
    body: ExtractRequest,
    background_tasks: BackgroundTasks,
    _: Any = Depends(get_current_user),
):
    """
    Trigger parallel extraction of a semantic model + report.
    Returns immediately with a job_id; poll /extract/{job_id}/status.
    """
    # We need a token — look for one in the active auth sessions
    token = _find_any_ready_token()
    if not token:
        raise HTTPException(status_code=401, detail="No active Fabric auth session. Call /fabric/auth/start first.")

    job_id = str(uuid.uuid4())
    _JOBS[job_id] = {"status": "running", "progress_pct": 0, "error": None, "result": None}

    background_tasks.add_task(
        _run_extraction_job,
        job_id=job_id,
        token=token,
        workspace_id=body.workspace_id,
        model_id=body.model_id,
        report_id=body.report_id,
        fmt=body.format,
    )
    return {"job_id": job_id, "status": "running"}


@router.get("/extract/{job_id}/status")
async def get_extract_status(job_id: str, _: Any = Depends(get_current_user)):
    job = _JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return {
        "status": job["status"],
        "progress_pct": job["progress_pct"],
        "error": job.get("error"),
    }


@router.get("/extract/{job_id}/result")
async def get_extract_result(job_id: str, _: Any = Depends(get_current_user)):
    job = _JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["status"] != "completed":
        raise HTTPException(status_code=400, detail="Job not yet completed")
    return job["result"]


@router.get("/assessment/{job_id}/model")
async def get_model_assessment(job_id: str, _: Any = Depends(get_current_user)):
    job = _JOBS.get(job_id)
    if not job or job["status"] != "completed":
        raise HTTPException(status_code=404, detail="Job not found or not completed")
    return job["result"].get("model", {})


@router.get("/assessment/{job_id}/model/complexity")
async def get_model_complexity(job_id: str, _: Any = Depends(get_current_user)):
    job = _JOBS.get(job_id)
    if not job or job["status"] != "completed":
        raise HTTPException(status_code=404, detail="Job not found or not completed")
    model = job["result"].get("model", {})
    return {
        "complexity_score": model.get("complexity_score", 0),
        "score_breakdown": model.get("score_breakdown", {}),
    }


@router.get("/assessment/{job_id}/report")
async def get_report_assessment(job_id: str, _: Any = Depends(get_current_user)):
    job = _JOBS.get(job_id)
    if not job or job["status"] != "completed":
        raise HTTPException(status_code=404, detail="Job not found or not completed")
    return job["result"].get("report", {})


@router.get("/assessment/{job_id}/report/pages")
async def get_report_pages(job_id: str, _: Any = Depends(get_current_user)):
    job = _JOBS.get(job_id)
    if not job or job["status"] != "completed":
        raise HTTPException(status_code=404, detail="Job not found or not completed")
    return job["result"].get("report", {}).get("pages", [])


# ── Background: full session assessment (async, concurrent) ──────────────────

async def _run_fabric_assessment(
    session_id: str,
    token: str,
    workspace_ids: list[str],
    dataset_ids: set[str],
    report_ids: set[str],
    dataflow_ids: set[str] | None = None,
) -> None:
    """
    Concurrent Fabric assessment orchestrator.

    Architecture (5 phases):
      1. Discovery  — list all models/reports per workspace concurrently
      2. Semantic Models — extract all models concurrently (Semaphore=20)
      3. Reports    — extract all reports concurrently (Semaphore=20)
      4. Cross-linking — link reports→models, compute cross-ws metrics
      5. Saving     — bulk write to DB

    Concurrency design:
      - asyncio.Semaphore(20) caps simultaneous Fabric API calls to stay
        within the 200 req/min rate limit without triggering 429s.
      - Rate limiter (fabric_rate_limiter) provides an additional token-bucket
        guard: each API call acquires one token before firing.
      - Individual artifact failures are non-fatal: logged to the progress
        tracker and a stub result is inserted so the workspace still assembles.
      - asyncio.gather() collects all model/report coroutines and runs them
        concurrently within the semaphore budget.

    Progress: written to both the in-memory ProgressState (for SSE / polling)
    and the fabric_sessions.progress_message column (backwards-compat).
    """
    # Semaphore limits concurrent Fabric REST API calls.
    # 20 slots × ~3 calls/model = ~60 in-flight requests max, well within limit.
    _sem = asyncio.Semaphore(40)
    _loop = asyncio.get_event_loop()

    # ── Throttled DB progress writer (max 1 write per 4 s) ───────────────────
    # Runs the synchronous DB call in a thread pool so it never blocks the
    # event loop — critical when processing hundreds of models/reports.
    _last_db_progress: list[float] = [0.0]

    def _write_db_progress(payload: str) -> None:
        try:
            azure_store.update_fabric_session(session_id, progress_message=payload)
        except Exception as exc:
            logger.warning("DB progress update failed: %s", exc)

    def _db_progress(msg: str, md: int = 0, mt: int = 0, rd: int = 0, rt: int = 0, force: bool = False) -> None:
        now = time.monotonic()
        if not force and (now - _last_db_progress[0]) < 4.0:
            return
        _last_db_progress[0] = now
        payload = json.dumps({"msg": msg, "md": md, "mt": mt, "rd": rd, "rt": rt})
        _loop.run_in_executor(None, _write_db_progress, payload)

    if dataflow_ids is None:
        dataflow_ids = set()

    tracker = await _progress_store.create(session_id)
    await tracker.set_status("running")

    try:
        # ── Phase 1: Discovery ────────────────────────────────────────────────
        await tracker.set_phase("discovery")
        _db_progress("Discovering workspace items…")

        # Collections populated concurrently; safe under asyncio single-thread.
        ws_datasets: dict[str, list[dict]] = {}
        ws_reports: dict[str, list[dict]] = {}
        ws_dataflows: dict[str, list[dict]] = {}

        async def _discover_workspace(ws_id: str) -> None:
            """List models + reports + dataflows for one workspace concurrently."""
            async with _sem:
                await fabric_rate_limiter.acquire(3)
                models, reports, dataflows = await asyncio.gather(
                    fabric_client.list_workspace_semantic_models(token, ws_id),
                    fabric_client.list_workspace_reports(token, ws_id),
                    fabric_client.list_workspace_dataflows(token, ws_id),
                )
            ws_datasets[ws_id] = [
                m for m in models
                if not dataset_ids or m.get("id", "") in dataset_ids
            ]
            ws_reports[ws_id] = [
                r for r in reports
                if not report_ids or r.get("id", "") in report_ids
            ]
            ws_dataflows[ws_id] = [
                df for df in dataflows
                if not dataflow_ids or df.get("id", "") in dataflow_ids
            ]

        # Discover all workspaces concurrently
        await asyncio.gather(*[_discover_workspace(ws_id) for ws_id in workspace_ids])

        total_models = sum(len(v) for v in ws_datasets.values())
        total_reports = sum(len(v) for v in ws_reports.values())
        total_dataflows = sum(len(v) for v in ws_dataflows.values())

        await tracker.set_totals(total_models, total_reports, total_dataflows)
        _db_progress("Extraction starting…", md=0, mt=total_models, rd=0, rt=total_reports)
        logger.info(
            "Fabric session %s: discovered %d models, %d reports across %d workspaces",
            session_id, total_models, total_reports, len(workspace_ids),
        )

        # ── Fetch workspace metadata (for name/type/state) ────────────────────
        # Use get_workspace_metadata (no per-workspace re-enumeration) since
        # models/reports were already discovered in Phase 1.
        await fabric_rate_limiter.acquire()
        all_workspaces_meta = await fabric_client.get_workspace_metadata(token)
        ws_meta_map = {w["id"]: w for w in all_workspaces_meta}

        # ── Phase 2: Semantic Models (concurrent) ─────────────────────────────
        await tracker.set_phase("semantic_models")

        # Each workspace gets its own list; appends from different coroutines for
        # the SAME workspace are safe because asyncio is single-threaded.
        datasets_by_ws: dict[str, list[dict]] = {ws_id: [] for ws_id in workspace_ids}

        async def _process_model(ws_id: str, model: dict) -> None:
            """Extract + parse one semantic model. Failures are non-fatal."""
            model_id   = model.get("id", "")
            model_name = model.get("displayName", model.get("name", model_id))
            await tracker.item_started(f"Model: {model_name}")

            try:
                async with _sem:
                    # Each model needs 2 API calls: metadata + TMDL extraction
                    await fabric_rate_limiter.acquire(2)
                    meta, raw_parts = await asyncio.gather(
                        fabric_client.get_dataset_metadata(token, ws_id, model_id),
                        fabric_client.extract_semantic_model(token, ws_id, model_id),
                    )

                # CPU-bound parsing runs after the semaphore is released so
                # other API calls can proceed in parallel.
                decoded  = tmdl_parser.decode_parts(raw_parts)
                tmdl_data = tmdl_parser.parse_tmdl_parts(decoded)
                ds_dict  = tmdl_parser.assemble_dataset(
                    dataset_id=model_id,
                    dataset_name=model_name,
                    configured_by=meta.get("configured_by", ""),
                    is_refreshable=meta.get("is_refreshable", False),
                    web_url=meta.get("web_url", ""),
                    tmdl_data=tmdl_data,
                )
                if meta.get("storage_mode"):
                    ds_dict["storage_mode"] = meta["storage_mode"]
                datasets_by_ws[ws_id].append(ds_dict)
                await tracker.item_completed(f"Model: {model_name}", "model")

            except Exception as exc:
                # Non-fatal: stub dataset keeps workspace assembly intact
                logger.error("Model extraction failed (%s %s): %s", ws_id, model_id, exc)
                datasets_by_ws[ws_id].append(_stub_dataset(model_id, model_name, str(exc)))
                await tracker.item_failed(f"Model: {model_name}", str(exc), "model")

            processed = tracker.phase_progress["semantic_models"]["processed"]
            _db_progress(
                f"Model complete: {model_name}",
                md=processed, mt=total_models,
                rd=tracker.phase_progress["reports"]["processed"], rt=total_reports,
            )

        # Launch all model tasks concurrently — semaphore caps parallelism
        await asyncio.gather(*[
            _process_model(ws_id, model)
            for ws_id in workspace_ids
            for model in ws_datasets.get(ws_id, [])
        ])
        await tracker.phase_done("semantic_models")

        # ── Phase 3: Reports (concurrent) ────────────────────────────────────
        await tracker.set_phase("reports")

        reports_by_ws: dict[str, list[dict]] = {ws_id: [] for ws_id in workspace_ids}

        # Build cross-workspace measure lookup for field enrichment in report parsing
        measures_global: dict[str, dict] = {}
        for ws_id in workspace_ids:
            for ds in datasets_by_ws.get(ws_id, []):
                for m in ds.get("measures", []):
                    measures_global[m["name"]] = m

        async def _process_report(ws_id: str, report: dict) -> None:
            """Extract + parse one report. Failures are non-fatal."""
            report_id   = report.get("id", "")
            report_name = report.get("displayName", report.get("name", report_id))
            await tracker.item_started(f"Report: {report_name}")

            try:
                async with _sem:
                    await fabric_rate_limiter.acquire(2)
                    meta, raw_parts = await asyncio.gather(
                        fabric_client.get_report_metadata(token, ws_id, report_id),
                        fabric_client.extract_report(token, ws_id, report_id),
                    )

                is_paginated = meta.get("is_paginated", False)
                if is_paginated:
                    parsed = report_parser._empty_report()
                    parsed["is_paginated"] = True
                else:
                    decoded = report_parser.decode_parts(raw_parts)
                    parsed  = report_parser.parse_report_parts(decoded, measures_global)

                reports_by_ws[ws_id].append({
                    "id": report_id,
                    "name": meta.get("name") or report_name,
                    "report_type": meta.get("report_type", "PowerBIReport"),
                    "is_paginated": is_paginated,
                    "dataset_id": meta.get("dataset_id", ""),
                    "web_url": meta.get("web_url", ""),
                    **parsed,
                })
                await tracker.item_completed(f"Report: {report_name}", "report")

            except Exception as exc:
                logger.error("Report extraction failed (%s %s): %s", ws_id, report_id, exc)
                reports_by_ws[ws_id].append(_stub_report(report_id, report_name, str(exc)))
                await tracker.item_failed(f"Report: {report_name}", str(exc), "report")

            processed_r = tracker.phase_progress["reports"]["processed"]
            _db_progress(
                f"Report complete: {report_name}",
                md=total_models, mt=total_models,
                rd=processed_r, rt=total_reports,
            )

        await asyncio.gather(*[
            _process_report(ws_id, report)
            for ws_id in workspace_ids
            for report in ws_reports.get(ws_id, [])
        ])
        await tracker.phase_done("reports")

        # ── Phase 3b: Dataflows (concurrent) ─────────────────────────────────
        await tracker.set_phase("dataflows")

        dataflows_by_ws: dict[str, list[dict]] = {ws_id: [] for ws_id in workspace_ids}

        async def _process_dataflow(ws_id: str, df: dict) -> None:
            """Extract + parse one dataflow. Failures are non-fatal."""
            df_id   = df.get("id", "")
            df_name = df.get("name", df_id)
            generation = df.get("generation", "Gen2")
            await tracker.item_started(f"Dataflow: {df_name}")

            try:
                async with _sem:
                    await fabric_rate_limiter.acquire(3)
                    if generation == "Gen2":
                        meta, datasources, transactions, upstream, raw_parts = await asyncio.gather(
                            fabric_client.get_dataflow_metadata(token, ws_id, df_id, generation),
                            fabric_client.list_dataflow_datasources(token, ws_id, df_id),
                            fabric_client.list_dataflow_transactions(token, ws_id, df_id),
                            fabric_client.list_dataflow_upstream(token, ws_id, df_id),
                            fabric_client.extract_dataflow_definition(token, ws_id, df_id),
                        )
                        decoded = dataflow_parser.decode_parts(raw_parts)
                        definition_data = dataflow_parser.parse_dataflow_parts(decoded)
                    else:
                        # Gen1: no definition endpoint
                        meta, datasources, transactions, upstream = await asyncio.gather(
                            fabric_client.get_dataflow_metadata(token, ws_id, df_id, generation),
                            fabric_client.list_dataflow_datasources(token, ws_id, df_id),
                            fabric_client.list_dataflow_transactions(token, ws_id, df_id),
                            fabric_client.list_dataflow_upstream(token, ws_id, df_id),
                        )
                        definition_data = dataflow_parser.empty_definition()

                assembled = dataflow_parser.assemble_dataflow(
                    dataflow_id=df_id,
                    dataflow_name=df_name,
                    generation=generation,
                    workspace_id=ws_id,
                    configured_by=meta.get("configured_by", df.get("created_by", "")),
                    modified_by=meta.get("modified_by", df.get("modified_by", "")),
                    modified_at=meta.get("modified_at", df.get("modified_at", "")),
                    description=meta.get("description", df.get("description", "")),
                    can_refresh=meta.get("can_refresh", True),
                    refresh_count=meta.get("refresh_count", 0),
                    failure_count=meta.get("failure_count", 0),
                    avg_duration_sec=meta.get("avg_duration_sec", 0),
                    last_refresh_time=meta.get("last_refresh_time", ""),
                    next_refresh_time=meta.get("next_refresh_time", ""),
                    refresh_schedule=meta.get("refresh_schedule", {}),
                    gateway_id=meta.get("gateway_id", df.get("gateway_id", "")),
                    state=meta.get("state", df.get("state", "Active")),
                    datasources=datasources,
                    transactions=transactions,
                    upstream=upstream,
                    definition_data=definition_data,
                )
                dataflows_by_ws[ws_id].append(assembled)
                await tracker.item_completed(f"Dataflow: {df_name}", "dataflow")

            except Exception as exc:
                logger.error("Dataflow extraction failed (%s %s): %s", ws_id, df_id, exc)
                dataflows_by_ws[ws_id].append(_stub_dataflow(df_id, df_name, generation, str(exc)))
                await tracker.item_failed(f"Dataflow: {df_name}", str(exc), "dataflow")

            processed_df = tracker.phase_progress.get("dataflows", {}).get("processed", 0)
            _db_progress(
                f"Dataflow complete: {df_name}",
                md=total_models, mt=total_models,
                rd=total_reports, rt=total_reports,
            )

        await asyncio.gather(*[
            _process_dataflow(ws_id, df)
            for ws_id in workspace_ids
            for df in ws_dataflows.get(ws_id, [])
        ])
        await tracker.phase_done("dataflows")

        # ── Phase 4: Cross-linking ────────────────────────────────────────────
        # No additional API calls needed — link report→dataset by dataset_id field
        await tracker.set_phase("crosslinking")
        await tracker.phase_done("crosslinking")

        # ── Phase 5: Assemble results + save ──────────────────────────────────
        await tracker.set_phase("saving")
        _db_progress("Saving results…", md=total_models, mt=total_models, rd=total_reports, rt=total_reports, force=True)

        workspace_results: list[dict] = []
        for ws_id in workspace_ids:
            ws_meta      = ws_meta_map.get(ws_id, {"id": ws_id, "name": ws_id, "type": "Workspace", "state": "Active"})
            datasets_out  = datasets_by_ws.get(ws_id, [])
            reports_out   = reports_by_ws.get(ws_id, [])
            dataflows_out = dataflows_by_ws.get(ws_id, [])
            workspace_results.append({
                "id":    ws_id,
                "name":  ws_meta.get("name", ws_id),
                "type":  ws_meta.get("type", "Workspace"),
                "state": ws_meta.get("state", "Active"),
                "dataset_count":          len(datasets_out),
                "report_count":           sum(1 for r in reports_out if not r.get("is_paginated")),
                "paginated_report_count": sum(1 for r in reports_out if r.get("is_paginated")),
                "dataflow_count":         len(dataflows_out),
                "datasets":   datasets_out,
                "reports":    reports_out,
                "dataflows":  dataflows_out,
            })

        summary = _build_summary(workspace_results)
        fabric_results = {
            "assessed_at": datetime.now(timezone.utc).isoformat(),
            "workspaces":  workspace_results,
            "summary":     summary,
        }

        # Offload CPU-bound JSON serialisation + blocking DB write to a thread
        # so the event loop stays responsive to other HTTP requests during save.
        completed_at_str = datetime.now(timezone.utc).isoformat()
        progress_final = json.dumps({
            "msg": "Assessment complete",
            "md": total_models, "mt": total_models,
            "rd": total_reports, "rt": total_reports,
        })

        def _do_save() -> None:
            results_json_str = json.dumps(fabric_results, default=str)
            azure_store.update_fabric_session(
                session_id,
                status="completed",
                completed_at=completed_at_str,
                progress_message=progress_final,
                results_json=results_json_str,
            )

        await _loop.run_in_executor(None, _do_save)

        await tracker.phase_done("saving")
        await tracker.set_status("completed")
        logger.info(
            "Fabric session %s completed: %d models, %d reports (%d failed)",
            session_id, total_models, total_reports, tracker.failed_items,
        )

    except asyncio.CancelledError:
        # Server shutdown / task cancellation — must still mark DB as failed
        # so the frontend doesn't spin forever. CancelledError is a BaseException
        # subclass (not Exception) so it needs its own handler.
        logger.warning("Fabric session %s cancelled (server shutdown?)", session_id)
        try:
            azure_store.update_fabric_session(
                session_id,
                status="failed",
                completed_at=datetime.now(timezone.utc).isoformat(),
                error="Assessment was interrupted (server shutdown or restart). Please retry.",
            )
        except Exception:
            pass
        if tracker:
            try:
                await tracker.set_status("failed", failure_reason="Assessment was interrupted. Please retry.")
            except Exception:
                pass
        raise  # re-raise so asyncio knows the task was cancelled

    except Exception as exc:
        logger.error("Fabric session %s failed: %s", session_id, exc, exc_info=True)
        azure_store.update_fabric_session(
            session_id,
            status="failed",
            completed_at=datetime.now(timezone.utc).isoformat(),
            error=str(exc)[:1000],
        )
        if tracker:
            await tracker.set_status("failed", failure_reason=str(exc)[:500])


# ── Progress endpoints ────────────────────────────────────────────────────────

@router.get("/sessions/{session_id}/progress")
async def get_session_progress(session_id: str, _: Any = Depends(get_current_user)) -> dict:
    """
    Return current progress state for a running or recently completed assessment.
    Falls back to a DB-derived skeleton when the in-memory tracker has been
    removed (e.g. after server restart).
    """
    tracker = _progress_store.get(session_id)
    if tracker:
        return tracker.snapshot()

    # Graceful fallback: build minimal state from DB record
    row = azure_store.get_fabric_session(session_id)
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")

    db_status = row.get("status", "running")

    # Orphan detection: if tracker is gone but DB still shows "running",
    # the worker process was likely recycled mid-assessment. Auto-fail it
    # after 60 minutes so the UI doesn't spin forever.
    if db_status == "running":
        created_at = row.get("created_at")
        if created_at:
            try:
                if isinstance(created_at, str):
                    from datetime import timezone as _tz
                    created_dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
                else:
                    created_dt = created_at
                age_minutes = (datetime.now(timezone.utc) - created_dt.astimezone(timezone.utc)).total_seconds() / 60
                if age_minutes > 15:
                    azure_store.update_fabric_session(
                        session_id,
                        status="failed",
                        completed_at=datetime.now(timezone.utc).isoformat(),
                        error="Assessment timed out — the server process was likely recycled. Please retry.",
                    )
                    db_status = "failed"
            except Exception:
                pass

    is_done = db_status in ("completed", "failed", "cancelled")
    return {
        "assessment_id":    session_id,
        "status":           db_status,
        "phase":            "saving" if is_done else "discovery",
        "total_items":      0,
        "processed_items":  0,
        "failed_items":     0,
        "current_item_name": "",
        "failure_reason":   row.get("error"),
        "phase_progress": {
            "discovery":       {"done": is_done, "count": 0},
            "semantic_models": {"done": is_done, "total": 0, "processed": 0},
            "reports":         {"done": is_done, "total": 0, "processed": 0},
            "dataflows":       {"done": is_done, "total": 0, "processed": 0},
            "crosslinking":    {"done": is_done},
            "saving":          {"done": is_done},
        },
        "started_at":           _dt_str(row.get("created_at")) or "",
        "estimated_completion": None,
        "errors":               [],
        "activity_log":         [],
    }


@router.get("/sessions/{session_id}/progress/stream")
async def stream_session_progress(
    session_id: str,
    token: str = Query(..., description="Bearer JWT — required because EventSource cannot set headers"),
) -> StreamingResponse:
    """
    Server-Sent Events endpoint that pushes full progress snapshots every ~1 s.

    SSE lifecycle:
      - Emits `event: ping` immediately so the client knows the connection is live.
      - Emits `data: <json>` every second while status is 'running' or 'queued'.
      - Closes (generator returns) when status becomes 'completed' or 'failed',
        after sending one final snapshot.

    Authentication:
      EventSource API cannot set the Authorization header, so the JWT is
      accepted as the `token` query-parameter and validated here.
    """
    # Validate JWT from query param using same mechanism as header-based auth
    from app.core.auth import decode_token
    try:
        decode_token(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    async def _event_stream():
        # Immediate ping so the client knows the stream is open
        yield "event: ping\ndata: {}\n\n"

        while True:
            tracker = _progress_store.get(session_id)
            if tracker:
                snapshot = tracker.snapshot()
            else:
                # Fallback to DB while tracker not yet initialised or already removed
                row = azure_store.get_fabric_session(session_id)
                if not row:
                    yield f"event: error\ndata: {json.dumps({'error': 'Session not found'})}\n\n"
                    return
                db_status = row.get("status", "running")
                is_done_fb = db_status in ("completed", "failed", "cancelled")
                snapshot = {
                    "assessment_id": session_id,
                    "status": db_status,
                    "phase": "saving" if is_done_fb else "discovery",
                    "total_items": 0,
                    "processed_items": 0,
                    "failed_items": 0,
                    "current_item_name": "",
                    "failure_reason": row.get("error"),
                    "phase_progress": {
                        "discovery":       {"done": is_done_fb, "count": 0},
                        "semantic_models": {"done": is_done_fb, "total": 0, "processed": 0},
                        "reports":         {"done": is_done_fb, "total": 0, "processed": 0},
                        "dataflows":       {"done": is_done_fb, "total": 0, "processed": 0},
                        "crosslinking":    {"done": is_done_fb},
                        "saving":          {"done": is_done_fb},
                    },
                    "errors": [],
                    "activity_log": [],
                }

            # Emit data event (SSE spec: `data: <payload>\n\n`)
            yield f"data: {json.dumps(snapshot, default=str)}\n\n"

            # Stop streaming when assessment reaches a terminal state
            if snapshot.get("status") in ("completed", "failed", "cancelled"):
                return

            # 1-second cadence balances liveness vs. server load
            await asyncio.sleep(1.0)

    return StreamingResponse(
        _event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control":    "no-cache",
            "X-Accel-Buffering": "no",   # tells nginx not to buffer SSE
            "Connection":       "keep-alive",
        },
    )


# ── Background: standalone extraction job ────────────────────────────────────

async def _run_extraction_job(
    job_id: str,
    token: str,
    workspace_id: str,
    model_id: str,
    report_id: str,
    fmt: str,
) -> None:
    """Parallel extraction of one model + one report."""
    try:
        _JOBS[job_id]["progress_pct"] = 10

        model_parts, report_parts = await asyncio.gather(
            fabric_client.extract_semantic_model(token, workspace_id, model_id, fmt),
            fabric_client.extract_report(token, workspace_id, report_id),
        )
        _JOBS[job_id]["progress_pct"] = 60

        decoded_model = tmdl_parser.decode_parts(model_parts)
        tmdl_data = tmdl_parser.parse_tmdl_parts(decoded_model)
        model_assessment = tmdl_parser.assemble_dataset(
            dataset_id=model_id,
            dataset_name=model_id,
            configured_by="",
            is_refreshable=False,
            web_url="",
            tmdl_data=tmdl_data,
        )

        decoded_report = report_parser.decode_parts(report_parts)
        measures_map = {m["name"]: m for m in model_assessment.get("measures", [])}
        report_assessment = report_parser.parse_report_parts(decoded_report, measures_map)

        _JOBS[job_id]["progress_pct"] = 90

        _JOBS[job_id].update({
            "status": "completed",
            "progress_pct": 100,
            "result": {
                "job_id": job_id,
                "workspace_id": workspace_id,
                "extracted_at": datetime.now(timezone.utc).isoformat(),
                "model": model_assessment,
                "report": {"id": report_id, **report_assessment},
            },
        })
    except Exception as exc:
        logger.error("Extraction job %s failed: %s", job_id, exc)
        _JOBS[job_id].update({"status": "failed", "error": str(exc)})


# ── Helpers ───────────────────────────────────────────────────────────────────

def _format_session_record(row: dict, include_results: bool = False) -> dict:
    """Convert a raw azure_store row to FabricSessionRecord shape."""
    # azure_store.get_fabric_session returns 'session_id'; list returns 'fabric_session_id'
    session_id = row.get("fabric_session_id") or row.get("session_id", "")

    record: dict[str, Any] = {
        "fabric_session_id": session_id,
        "label": row.get("label"),
        "status": row.get("status", "running"),
        "created_at": _dt_str(row.get("created_at")),
        "completed_at": _dt_str(row.get("completed_at")),
        "error": row.get("error"),
        "progress_message": row.get("progress_message"),
    }

    if include_results:
        results_json = row.get("results_json") or "{}"
        try:
            record["results"] = json.loads(results_json) or None
        except Exception:
            record["results"] = None

    return record


def _dt_str(val: Any) -> str | None:
    if val is None:
        return None
    if isinstance(val, datetime):
        return val.isoformat()
    return str(val)


def _find_any_ready_token() -> str | None:
    """Return any available ready Fabric token for standalone extraction."""
    with _AUTH_LOCK:
        for sess in _AUTH.values():
            if sess.get("status") == "ready" and sess.get("token"):
                return sess["token"]
    return None


def _build_summary(workspaces: list[dict]) -> dict:
    total_measures = 0
    total_calc_tables = 0
    total_calc_cols = 0
    total_rels = 0
    total_visuals = 0
    total_dataflow_entities = 0
    total_dataflow_datasources = 0

    for ws in workspaces:
        for ds in ws.get("datasets", []):
            total_measures += ds.get("measure_count", 0)
            total_calc_tables += ds.get("calculated_table_count", 0)
            total_calc_cols += ds.get("calculated_column_count", 0)
            total_rels += ds.get("relationship_count", 0)
        for rpt in ws.get("reports", []):
            total_visuals += rpt.get("visual_count", 0)
        for df in ws.get("dataflows", []):
            total_dataflow_entities += df.get("entity_count", 0)
            total_dataflow_datasources += df.get("datasource_count", 0)

    return {
        "workspace_count": len(workspaces),
        "dataset_count": sum(ws.get("dataset_count", 0) for ws in workspaces),
        "report_count": sum(ws.get("report_count", 0) for ws in workspaces),
        "paginated_report_count": sum(ws.get("paginated_report_count", 0) for ws in workspaces),
        "dataflow_count": sum(ws.get("dataflow_count", 0) for ws in workspaces),
        "total_measures": total_measures,
        "total_calculated_tables": total_calc_tables,
        "total_calculated_columns": total_calc_cols,
        "total_relationships": total_rels,
        "total_visuals": total_visuals,
        "total_dataflow_entities": total_dataflow_entities,
        "total_dataflow_datasources": total_dataflow_datasources,
    }


def _stub_dataset(dataset_id: str, name: str, error: str) -> dict:
    return {
        "id": dataset_id, "name": name, "configured_by": "", "is_refreshable": False,
        "storage_mode": "Import", "web_url": "", "table_count": 0, "measure_count": 0,
        "calculated_column_count": 0, "calculated_table_count": 0, "relationship_count": 0,
        "complexity_score": 0, "info_supported": False,
        "tables": [], "measures": [], "calculated_columns": [], "calculated_tables": [],
        "relationships": [], "_error": error,
    }


def _stub_report(report_id: str, name: str, error: str) -> dict:
    return {
        "id": report_id, "name": name, "report_type": "PowerBIReport", "is_paginated": False,
        "dataset_id": "", "web_url": "", "page_count": None, "visual_count": 0,
        "bookmark_count": 0, "bookmarks": [], "layout_parsed": False, "pages": [],
        "_error": error,
    }


def _stub_dataflow(dataflow_id: str, name: str, generation: str, error: str) -> dict:
    return {
        "id": dataflow_id, "name": name, "generation": generation,
        "description": "", "workspace_id": "", "configured_by": "", "modified_by": "",
        "modified_at": "", "state": "Unknown", "can_refresh": False,
        "refresh_count": 0, "failure_count": 0, "reliability_pct": None,
        "avg_duration_sec": 0, "last_refresh_time": "", "next_refresh_time": "",
        "refresh_schedule": {}, "schedule_summary": "Unknown", "gateway_id": "",
        "datasources": [], "datasource_count": 0,
        "entities": [], "entity_count": 0,
        "total_transformation_steps": 0,
        "complexity": {"score": 0, "level": "None", "function_count": 0,
                       "step_count": 0, "nesting_depth": 0, "complex_functions": []},
        "upstream_dataflows": [], "upstream_dataflow_refs": [],
        "transactions": [], "has_refresh_errors": False,
        "_error": error,
    }


# ── Excel export ──────────────────────────────────────────────────────────────

_EXCEL_ROW_LIMIT = 1_048_576


def _generate_excel(results: dict, label: str) -> bytes:
    """Generate a styled multi-sheet Excel file from FabricResults."""
    try:
        import openpyxl
        from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
        from openpyxl.utils import get_column_letter
    except ImportError:
        raise HTTPException(status_code=503, detail="openpyxl not installed")

    wb = openpyxl.Workbook()
    wb.remove(wb.active)

    # ── Style constants (mirrors SQL Server report palette) ───────────────────
    DARK_BLUE   = "1F3864"
    MID_BLUE    = "2E75B6"
    LIGHT_BLUE  = "BDD7EE"
    ACCENT_BLUE = "DEEAF1"
    TEAL_DARK   = "0F766E"
    TEAL_MID    = "0D9488"
    TEAL_LIGHT  = "CCFBF1"
    NAVY        = "1E3A5F"
    AMBER_DARK  = "92400E"
    AMBER_LIGHT = "FEF3C7"
    GREEN       = "70AD47"
    LIGHT_GREEN = "E2EFDA"
    ORANGE      = "ED7D31"
    LIGHT_ORANGE= "FCE4D6"
    RED         = "FF0000"
    LIGHT_RED   = "FFE2E2"
    WHITE       = "FFFFFF"
    LIGHT_GRAY  = "F2F2F2"
    MED_GRAY    = "808080"
    DARK_GRAY   = "404040"
    FONT_NAME   = "Calibri"

    def _fnt(bold=False, size=11, color=DARK_GRAY, italic=False):
        return Font(name=FONT_NAME, bold=bold, size=size, color=color, italic=italic)

    def _fill(hex_color: str):
        return PatternFill("solid", fgColor=hex_color)

    def _border(style="thin", color="D0D7E5"):
        s = Side(style=style, color=color)
        return Border(left=s, right=s, top=s, bottom=s)

    def _align(h="left", v="center", wrap=False):
        return Alignment(horizontal=h, vertical=v, wrap_text=wrap)

    def _header_cell(ws, row: int, col: int, value: str, bg=DARK_BLUE, fg=WHITE):
        c = ws.cell(row=row, column=col, value=value)
        c.font = _fnt(bold=True, color=fg, size=10)
        c.fill = _fill(bg)
        c.alignment = _align("center")
        c.border = _border()

    def _section_title(ws, row: int, col: int, text: str, span: int = 1, bg=MID_BLUE):
        c = ws.cell(row=row, column=col, value=text)
        c.font = _fnt(bold=True, size=12, color=WHITE)
        c.fill = _fill(bg)
        c.alignment = _align("left")
        c.border = _border()
        if span > 1:
            ws.merge_cells(start_row=row, start_column=col, end_row=row, end_column=col + span - 1)

    def _data_cell(ws, row: int, col: int, value, bg=WHITE, align_h="left",
                   bold=False, color=DARK_GRAY, wrap=False):
        c = ws.cell(row=row, column=col, value=value)
        c.font = _fnt(bold=bold, color=color)
        c.fill = _fill(bg)
        c.border = _border()
        c.alignment = _align(align_h, wrap=wrap)

    def _auto_width(ws, min_w=10, max_w=52):
        for col in ws.columns:
            max_len = 0
            col_letter = get_column_letter(col[0].column)
            for cell in col:
                try:
                    if cell.value:
                        max_len = max(max_len, len(str(cell.value)))
                except Exception:
                    pass
            ws.column_dimensions[col_letter].width = min(max(max_len + 2, min_w), max_w)

    def _add_sheet(
        name: str,
        section_label: str,
        headers: list[str],
        rows: list[list],
        col_widths: list[int] | None = None,
        header_bg: str = DARK_BLUE,
        alt_bg: str = LIGHT_GRAY,
        tab_color: str = MID_BLUE,
        cell_overrides: dict | None = None,
        wrap_last_col: bool = False,
    ) -> list:
        """
        Creates a sheet (possibly split across multiple sheets if rows > EXCEL_ROW_LIMIT).
        Row 1 = section title (merged), Row 2 = column headers, Row 3+ = data.
        Returns list of created worksheet objects.
        """
        MAX_DATA_ROWS = _EXCEL_ROW_LIMIT - 2  # rows 1+2 are title+header
        sheets_created = []
        part = 1
        offset = 0
        total = len(rows)

        while offset < total or (offset == 0 and total == 0):
            chunk = rows[offset: offset + MAX_DATA_ROWS]
            sheet_name = name[:31] if part == 1 else f"{name[:27]} ({part})"
            ws = wb.create_sheet(title=sheet_name)
            ws.sheet_properties.tabColor = tab_color
            sheets_created.append(ws)

            # Row 1: section title
            _section_title(ws, 1, 1, f"  {section_label}", span=len(headers), bg=header_bg)
            ws.row_dimensions[1].height = 22

            # Row 2: column headers
            for ci, h in enumerate(headers, 1):
                _header_cell(ws, 2, ci, h, bg=header_bg)
            ws.row_dimensions[2].height = 26
            ws.auto_filter.ref = f"A2:{get_column_letter(len(headers))}2"
            ws.freeze_panes = "A3"

            # Data rows starting at row 3
            for ri, row in enumerate(chunk, start=3):
                bg = alt_bg if ri % 2 == 0 else WHITE
                for ci, val in enumerate(row, start=1):
                    str_val = str(val) if val is not None else ""
                    do_wrap = wrap_last_col and ci == len(row)
                    _data_cell(ws, ri, ci, str_val, bg=bg,
                               align_h="center" if ci > 2 else "left",
                               wrap=do_wrap)
                    # Apply any per-cell style overrides
                    if cell_overrides:
                        for (check_col, check_val), style in cell_overrides.items():
                            if ci == check_col and str_val == check_val:
                                c = ws.cell(row=ri, column=ci)
                                if "bg" in style:
                                    c.fill = _fill(style["bg"])
                                if "color" in style:
                                    c.font = _fnt(bold=style.get("bold", False), color=style["color"])

            # Column widths
            widths = col_widths or [22] * len(headers)
            for ci, w in enumerate(widths, start=1):
                ws.column_dimensions[get_column_letter(ci)].width = w

            offset += MAX_DATA_ROWS
            part += 1
            if offset >= total:
                break

        return sheets_created

    workspaces = results.get("workspaces", [])
    summary = results.get("summary", {})

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _risk(storage_mode: str) -> str:
        return {
            "DirectLake":  "Low",
            "Import":      "Low",
            "DirectQuery": "High",
            "Composite":   "Medium",
            "Dual":        "Medium",
            "Push":        "Medium",
        }.get(storage_mode, "Unknown")

    def _dep_type(storage_mode: str) -> str:
        return {
            "DirectLake":  "OneLake / Lakehouse",
            "DirectQuery": "Live RDBMS / Warehouse",
            "Import":      "Snapshot Cache",
            "Composite":   "Mixed (Import + DQ/DL)",
            "Dual":        "Hybrid Cache + Live Fallback",
            "Push":        "Streaming Push",
        }.get(storage_mode, storage_mode or "Unknown")

    def _report_complexity(rpt: dict, ds_map: dict) -> str:
        vc = rpt.get("visual_count", 0)
        ds = ds_map.get(rpt.get("dataset_id", ""), {})
        score = vc + ds.get("measure_count", 0) * 2 + ds.get("relationship_count", 0)
        if score >= 80: return "Very Complex"
        if score >= 40: return "Complex"
        if score >= 20: return "Moderate"
        if score >= 5:  return "Simple"
        return "Minimal"

    ds_by_id: dict[str, dict] = {}
    for _ws in workspaces:
        for _ds in _ws.get("datasets", []):
            ds_by_id[_ds.get("id", "")] = _ds

    # ── 1. Summary ────────────────────────────────────────────────────────────
    ws_sum = wb.create_sheet(title="Summary")
    ws_sum.sheet_properties.tabColor = DARK_BLUE

    # Main title
    ws_sum.merge_cells("A1:D1")
    c = ws_sum["A1"]
    c.value = "FABRIC ASSESSMENT REPORT"
    c.font = _fnt(bold=True, size=18, color=WHITE)
    c.fill = _fill(DARK_BLUE)
    c.alignment = _align("center")
    ws_sum.row_dimensions[1].height = 36

    # Sub-title
    ws_sum.merge_cells("A2:D2")
    c = ws_sum["A2"]
    c.value = f"Label: {label}    |    Generated: {results.get('assessed_at', '')}"
    c.font = _fnt(italic=True, size=10, color=MED_GRAY)
    c.fill = _fill(ACCENT_BLUE)
    c.alignment = _align("center")

    total_complex = sum(
        1 for _ws in workspaces for _ds in _ws.get("datasets", [])
        for m in _ds.get("measures", [])
        if (m.get("complexity") or {}).get("level") in ("Complex", "Very Complex")
    )

    # KPI grid (row 4 label, row 5 value)
    _section_title(ws_sum, 3, 1, "  KEY METRICS", span=4, bg=TEAL_DARK)
    kpis = [
        ("Workspaces",       summary.get("workspace_count", 0),          TEAL_MID),
        ("Semantic Models",  summary.get("dataset_count", 0),             MID_BLUE),
        ("Reports",          summary.get("report_count", 0),              MID_BLUE),
        ("Total Measures",   summary.get("total_measures", 0),            MID_BLUE),
        ("Complex Measures", total_complex,                                ORANGE),
        ("Calc Tables",      summary.get("total_calculated_tables", 0),   GREEN),
        ("Calc Columns",     summary.get("total_calculated_columns", 0),  GREEN),
        ("Total Visuals",    summary.get("total_visuals", 0),             MID_BLUE),
    ]
    for idx, (lbl, val, color) in enumerate(kpis):
        col = idx + 1
        kl = ws_sum.cell(row=4, column=col, value=lbl)
        kl.font = _fnt(bold=True, size=9, color=WHITE)
        kl.fill = _fill(color)
        kl.alignment = _align("center")
        kl.border = _border()
        ws_sum.row_dimensions[4].height = 18

        kv = ws_sum.cell(row=5, column=col, value=val)
        kv.font = _fnt(bold=True, size=16)
        kv.fill = _fill(ACCENT_BLUE)
        kv.alignment = _align("center")
        kv.border = _border()
        ws_sum.row_dimensions[5].height = 32

    # Workspace breakdown table
    _section_title(ws_sum, 7, 1, "  WORKSPACE BREAKDOWN", span=6, bg=MID_BLUE)
    ws_headers = ["Workspace", "Semantic Models", "Reports", "Dataflows", "Measures", "Visuals"]
    for ci, h in enumerate(ws_headers, 1):
        _header_cell(ws_sum, 8, ci, h, bg=MID_BLUE)
    ws_sum.row_dimensions[8].height = 22
    for ri, _ws in enumerate(workspaces, start=9):
        bg = LIGHT_BLUE if ri % 2 == 0 else WHITE
        vals = [
            _ws.get("name", ""),
            len(_ws.get("datasets", [])),
            len(_ws.get("reports", [])),
            len(_ws.get("dataflows", [])),
            sum(len(ds.get("measures", [])) for ds in _ws.get("datasets", [])),
            sum(rpt.get("visual_count", 0) for rpt in _ws.get("reports", [])),
        ]
        for ci, v in enumerate(vals, 1):
            _data_cell(ws_sum, ri, ci, v, bg=bg, align_h="center" if ci > 1 else "left")

    for ci, w in enumerate([34, 16, 10, 11, 11, 10], start=1):
        ws_sum.column_dimensions[get_column_letter(ci)].width = w

    # ── 2. Semantic Models ────────────────────────────────────────────────────
    model_rows = []
    for _ws in workspaces:
        for ds in _ws.get("datasets", []):
            cx_dist: dict[str, int] = {}
            for m in ds.get("measures", []):
                lvl = (m.get("complexity") or {}).get("level", "None")
                cx_dist[lvl] = cx_dist.get(lvl, 0) + 1
            model_rows.append([
                _ws.get("name", ""), ds.get("name", ""), ds.get("storage_mode", ""),
                _dep_type(ds.get("storage_mode", "")), ds.get("configured_by", ""),
                ds.get("table_count", 0), ds.get("measure_count", 0),
                ds.get("calculated_column_count", 0), ds.get("calculated_table_count", 0),
                ds.get("relationship_count", 0), ds.get("complexity_score", 0),
                cx_dist.get("Very Complex", 0), cx_dist.get("Complex", 0),
                "Yes" if ds.get("is_refreshable") else "No",
            ])
    _add_sheet("Semantic Models", "SEMANTIC MODELS",
               ["Workspace", "Model", "Storage Mode", "Dependency Type", "Owner",
                "Tables", "Measures", "Calc Cols", "Calc Tables", "Relationships",
                "Complexity Score", "Very Complex", "Complex", "Refreshable"],
               model_rows,
               col_widths=[24, 28, 14, 26, 22, 9, 10, 10, 11, 14, 14, 13, 10, 12],
               header_bg=DARK_BLUE, alt_bg=LIGHT_BLUE, tab_color=MID_BLUE)

    # ── 3. Measures (metadata + short DAX) ───────────────────────────────────
    measure_rows = []
    for _ws in workspaces:
        for ds in _ws.get("datasets", []):
            for m in ds.get("measures", []):
                cx = m.get("complexity") or {}
                deps = m.get("dependencies") or []
                dep_tables = ", ".join(sorted({d.get("table", "") for d in deps if d.get("table")}))
                measure_rows.append([
                    _ws.get("name", ""), ds.get("name", ""), m.get("table", ""),
                    m.get("name", ""), m.get("display_folder", ""),
                    cx.get("score", 0), cx.get("level", "None"),
                    cx.get("nesting_depth", 0), cx.get("function_count", 0),
                    cx.get("dependency_count", 0),
                    ", ".join(cx.get("complex_functions", [])),
                    dep_tables,
                    m.get("format_string", ""),
                    m.get("expression", "")[:500],
                ])
    _add_sheet("Measures", "MEASURES",
               ["Workspace", "Model", "Table", "Measure", "Folder",
                "Score", "Level", "Nesting Depth", "Function Count", "Column Refs",
                "Complex Functions", "Referenced Tables", "Format", "DAX Preview (500c)"],
               measure_rows,
               col_widths=[20, 22, 18, 26, 16, 8, 14, 12, 13, 10, 22, 22, 12, 50],
               header_bg=DARK_BLUE, alt_bg=LIGHT_GRAY, tab_color=DARK_BLUE)

    # ── 4. Relationships ──────────────────────────────────────────────────────
    rel_rows = []
    for _ws in workspaces:
        for ds in _ws.get("datasets", []):
            for r in ds.get("relationships", []):
                rel_rows.append([
                    _ws.get("name", ""), ds.get("name", ""),
                    r.get("from_table", ""), r.get("from_column", ""),
                    r.get("to_table", ""), r.get("to_column", ""),
                    r.get("cardinality", ""), r.get("cross_filter", ""),
                    "Active" if r.get("is_active", True) else "Inactive",
                ])
    _add_sheet("Relationships", "RELATIONSHIPS",
               ["Workspace", "Model", "From Table", "From Column",
                "To Table", "To Column", "Cardinality", "Cross Filter", "Status"],
               rel_rows,
               col_widths=[22, 22, 22, 22, 22, 22, 14, 16, 10],
               header_bg=MID_BLUE, alt_bg=LIGHT_BLUE, tab_color=MID_BLUE,
               cell_overrides={(9, "Inactive"): {"bg": LIGHT_ORANGE, "color": AMBER_DARK, "bold": True}})

    # ── 5. Reports ────────────────────────────────────────────────────────────
    report_rows = []
    for _ws in workspaces:
        for rpt in _ws.get("reports", []):
            ds    = ds_by_id.get(rpt.get("dataset_id", ""), {})
            pages = rpt.get("pages") or []
            unique_types = sorted({v.get("type", "") for p in pages for v in p.get("visuals", []) if v.get("type")})
            report_rows.append([
                _ws.get("name", ""), rpt.get("name", ""),
                rpt.get("report_type", ""), "Yes" if rpt.get("is_paginated") else "No",
                ds.get("name", rpt.get("dataset_id", "—") or "—"),
                rpt.get("page_count", 0) or 0, rpt.get("visual_count", 0),
                rpt.get("bookmark_count", 0),
                _report_complexity(rpt, ds_by_id),
                "Yes" if rpt.get("layout_parsed") else "No",
                ", ".join(unique_types[:10]),
            ])
    _add_sheet("Reports", "REPORTS",
               ["Workspace", "Report", "Type", "Paginated", "Linked Model",
                "Pages", "Visuals", "Bookmarks", "Complexity Level",
                "Layout Parsed", "Visual Types Used"],
               report_rows,
               col_widths=[20, 28, 14, 10, 26, 8, 9, 10, 16, 14, 38],
               header_bg=TEAL_DARK, alt_bg=TEAL_LIGHT, tab_color=TEAL_DARK)

    # ── 6. DAX Complexity (all items, no cap) ─────────────────────────────────
    complexity_items: list[tuple[int, list]] = []
    for _ws in workspaces:
        for ds in _ws.get("datasets", []):
            for m in ds.get("measures", []):
                cx = m.get("complexity") or {}
                if cx.get("score", 0) > 0:
                    complexity_items.append((cx["score"], [
                        _ws.get("name", ""), ds.get("name", ""), "Measure",
                        m.get("name", ""), m.get("table", ""),
                        cx["score"], cx.get("level", ""), cx.get("nesting_depth", 0),
                        cx.get("function_count", 0), cx.get("dependency_count", 0),
                        ", ".join(cx.get("complex_functions", [])),
                    ]))
            for col_item in ds.get("calculated_columns", []):
                cx = col_item.get("complexity") or {}
                if cx.get("score", 0) > 0:
                    complexity_items.append((cx["score"], [
                        _ws.get("name", ""), ds.get("name", ""), "Calc Column",
                        col_item.get("name", ""), col_item.get("table", ""),
                        cx["score"], cx.get("level", ""), cx.get("nesting_depth", 0),
                        cx.get("function_count", 0), cx.get("dependency_count", 0),
                        ", ".join(cx.get("complex_functions", [])),
                    ]))
    complexity_items.sort(key=lambda x: x[0], reverse=True)
    cx_rows = [row for _, row in complexity_items]
    _add_sheet("DAX Complexity", "DAX COMPLEXITY RANKING (ALL ITEMS)",
               ["Workspace", "Model", "Type", "Name", "Table",
                "Score", "Level", "Nesting Depth", "Function Count", "Column Refs",
                "Complex Functions"],
               cx_rows,
               col_widths=[20, 22, 14, 32, 20, 8, 14, 13, 14, 11, 30],
               header_bg=TEAL_DARK, alt_bg=TEAL_LIGHT, tab_color=TEAL_DARK,
               cell_overrides={
                   (7, "Very Complex"): {"bg": LIGHT_RED, "color": RED, "bold": True},
                   (7, "Complex"):      {"bg": LIGHT_ORANGE, "color": ORANGE, "bold": True},
               })

    # ── 7. Full DAX Expressions ───────────────────────────────────────────────
    dax_rows = []
    for _ws in workspaces:
        for ds in _ws.get("datasets", []):
            for m in ds.get("measures", []):
                expr = m.get("expression", "") or ""
                if expr:
                    cx = m.get("complexity") or {}
                    dax_rows.append([
                        _ws.get("name", ""), ds.get("name", ""), "Measure",
                        m.get("table", ""), m.get("name", ""),
                        m.get("display_folder", ""), m.get("format_string", ""),
                        cx.get("score", 0), cx.get("level", "None"),
                        expr,
                    ])
            for col_item in ds.get("calculated_columns", []):
                expr = col_item.get("expression", "") or ""
                if expr:
                    cx = col_item.get("complexity") or {}
                    dax_rows.append([
                        _ws.get("name", ""), ds.get("name", ""), "Calc Column",
                        col_item.get("table", ""), col_item.get("name", ""),
                        col_item.get("display_folder", ""), col_item.get("format_string", ""),
                        cx.get("score", 0), cx.get("level", "None"),
                        expr,
                    ])
            for tbl in ds.get("tables", []):
                for ct in (tbl.get("calculated_table_expression") and [tbl]) or []:
                    expr = ct.get("calculated_table_expression", "") or ""
                    if expr:
                        dax_rows.append([
                            _ws.get("name", ""), ds.get("name", ""), "Calc Table",
                            ct.get("name", ""), ct.get("name", ""),
                            "", "", 0, "None",
                            expr,
                        ])

    ws_dax_list = _add_sheet(
        "DAX Expressions", "FULL DAX EXPRESSIONS",
        ["Workspace", "Model", "Type", "Table", "Name",
         "Folder", "Format", "Score", "Level", "DAX Expression"],
        dax_rows,
        col_widths=[20, 22, 13, 22, 28, 16, 12, 8, 14, 80],
        header_bg=NAVY, alt_bg=ACCENT_BLUE, tab_color=NAVY,
        wrap_last_col=True,
    )
    # Enable wrap + taller rows on DAX expression column for readability
    for ws_dax in ws_dax_list:
        for row in ws_dax.iter_rows(min_row=3):
            last_cell = row[-1]
            if last_cell.value and len(str(last_cell.value)) > 80:
                ws_dax.row_dimensions[last_cell.row].height = min(
                    14 * (str(last_cell.value).count("\n") + 1), 200
                )

    # ── 8. Database Usage Summary ─────────────────────────────────────────────
    db_map: dict[str, dict] = {}
    for _ws in workspaces:
        for ds in _ws.get("datasets", []):
            key = ds.get("name", "")
            if not key:
                continue
            if key not in db_map:
                db_map[key] = {
                    "workspace": _ws.get("name", ""),
                    "name": key,
                    "storage_mode": ds.get("storage_mode", ""),
                    "dep_type": _dep_type(ds.get("storage_mode", "")),
                    "risk": _risk(ds.get("storage_mode", "")),
                    "reports": set(),
                    "table_count": ds.get("table_count", 0),
                    "relationship_count": ds.get("relationship_count", 0),
                    "measure_count": ds.get("measure_count", 0),
                }
            for rpt in _ws.get("reports", []):
                if rpt.get("dataset_id") == ds.get("id"):
                    db_map[key]["reports"].add(rpt.get("name", ""))
    db_rows = []
    for entry in sorted(db_map.values(), key=lambda x: -len(x["reports"])):
        db_rows.append([
            entry["workspace"], entry["name"], entry["storage_mode"],
            entry["dep_type"], len(entry["reports"]),
            entry["table_count"], entry["relationship_count"], entry["measure_count"],
            entry["risk"],
        ])
    _add_sheet("Database Usage Summary", "DATABASE / MODEL USAGE SUMMARY",
               ["Workspace", "Database / Model", "Storage Mode", "Dependency Type",
                "Approx Report Count", "Tables", "Relationships", "Measures", "Risk Level"],
               db_rows,
               col_widths=[20, 28, 16, 28, 18, 9, 14, 10, 12],
               header_bg=AMBER_DARK, alt_bg=AMBER_LIGHT, tab_color=AMBER_DARK,
               cell_overrides={
                   (9, "High"):   {"bg": LIGHT_RED,    "color": RED,    "bold": True},
                   (9, "Medium"): {"bg": LIGHT_ORANGE, "color": ORANGE, "bold": True},
                   (9, "Low"):    {"bg": LIGHT_GREEN,  "color": GREEN,  "bold": True},
               })

    # ── 9. Detailed Report Complexity ─────────────────────────────────────────
    detail_rows = []
    for _ws in workspaces:
        for rpt in _ws.get("reports", []):
            ds = ds_by_id.get(rpt.get("dataset_id", ""), {})
            pages = rpt.get("pages") or []
            field_tables: set[str] = set()
            for p in pages:
                for v in p.get("visuals", []):
                    for f in v.get("fields", []):
                        if f.get("table"):
                            field_tables.add(f["table"])
            detail_rows.append([
                _ws.get("name", ""), rpt.get("name", ""),
                ds.get("name", rpt.get("dataset_id", "—") or "—"),
                ds.get("storage_mode", ""),
                rpt.get("page_count", 0) or 0, ds.get("table_count", 0),
                ds.get("measure_count", 0), ds.get("relationship_count", 0),
                len(field_tables), ", ".join(sorted(field_tables)[:8]) or "—",
                rpt.get("visual_count", 0), _report_complexity(rpt, ds_by_id),
            ])
    detail_rows.sort(key=lambda r: r[11])
    _add_sheet("Report Complexity Detail", "DETAILED REPORT COMPLEXITY",
               ["Workspace", "Report Name", "Semantic Model", "Storage Mode",
                "Page Count", "Table Count", "Measures", "Relationships",
                "Unique Data Sources", "Data Source Tables (sample)",
                "Visual Count", "Complexity Level"],
               detail_rows,
               col_widths=[20, 28, 26, 14, 10, 10, 10, 14, 16, 40, 12, 16],
               header_bg=TEAL_DARK, alt_bg=TEAL_LIGHT, tab_color=TEAL_DARK,
               cell_overrides={
                   (12, "Very Complex"): {"bg": LIGHT_RED,    "color": RED,    "bold": True},
                   (12, "Complex"):      {"bg": LIGHT_ORANGE, "color": ORANGE, "bold": True},
               })

    # ── 10. Visual Field Inventory ────────────────────────────────────────────
    field_rows = []
    for _ws in workspaces:
        for rpt in _ws.get("reports", []):
            ds = ds_by_id.get(rpt.get("dataset_id", ""), {})
            pages = rpt.get("pages") or []
            for page in pages:
                for visual in page.get("visuals", []):
                    for field in visual.get("fields", []):
                        cx = field.get("complexity") or {}
                        field_rows.append([
                            _ws.get("name", ""), rpt.get("name", ""),
                            ds.get("name", ""), page.get("name", ""),
                            visual.get("title") or visual.get("type", ""),
                            visual.get("type", ""),
                            field.get("field_type", ""),
                            field.get("table", ""), field.get("name", ""),
                            field.get("agg_function", ""),
                            cx.get("level", "") if cx else "",
                            cx.get("score", "") if cx else "",
                        ])
    _add_sheet("Visual Field Inventory", "VISUAL FIELD INVENTORY",
               ["Workspace", "Report", "Semantic Model", "Page",
                "Visual Title", "Visual Type", "Field Type",
                "Table", "Field / Measure Name", "Aggregation",
                "Measure Complexity", "Complexity Score"],
               field_rows,
               col_widths=[18, 24, 22, 16, 22, 16, 12, 18, 26, 14, 16, 14],
               header_bg=NAVY, alt_bg=ACCENT_BLUE, tab_color=NAVY)

    # ── 11. Table-to-Report Lineage ───────────────────────────────────────────
    lineage_rows = []
    for _ws in workspaces:
        for rpt in _ws.get("reports", []):
            ds = ds_by_id.get(rpt.get("dataset_id", ""), {})
            pages = rpt.get("pages") or []
            used_tables: set[str] = set()
            used_measure_tables: set[str] = set()
            for p in pages:
                for v in p.get("visuals", []):
                    for f in v.get("fields", []):
                        if f.get("table"):
                            used_tables.add(f["table"])
                        if f.get("field_type") == "measure":
                            for dep in (f.get("dependencies") or []):
                                if dep.get("table"):
                                    used_measure_tables.add(dep["table"])
            ds_tables = {t.get("name", "") for t in (ds.get("tables") or [])}
            for tbl in sorted(used_tables | used_measure_tables):
                lineage_rows.append([
                    _ws.get("name", ""), rpt.get("name", ""),
                    ds.get("name", "—"), ds.get("storage_mode", ""), tbl,
                    "Yes" if tbl in ds_tables else "No",
                    "Direct Field" if tbl in used_tables else "Via Measure Dependency",
                    _risk(ds.get("storage_mode", "")),
                ])
    _add_sheet("Table-to-Report Lineage", "TABLE-TO-REPORT LINEAGE",
               ["Workspace", "Report", "Semantic Model", "Storage Mode",
                "Table Name", "Verified in Model", "Lineage Path", "Risk Level"],
               lineage_rows,
               col_widths=[20, 26, 24, 14, 22, 16, 26, 12],
               header_bg=NAVY, alt_bg=ACCENT_BLUE, tab_color=NAVY)

    # ── 12. Dataflows Inventory ───────────────────────────────────────────────
    df_rows = []
    for _ws in workspaces:
        for df in _ws.get("dataflows", []):
            cx = df.get("complexity") or {}
            ds_types = ", ".join(
                d.get("datasource_type", d.get("type", ""))
                for d in (df.get("datasources") or [])
            ) or "—"
            upstream = ", ".join(
                u.get("source_dataflow_name", u) if isinstance(u, dict) else str(u)
                for u in (df.get("upstream_dataflows") or [])
            ) or "—"
            last_txn = (df.get("transactions") or [{}])[0] if df.get("transactions") else {}
            df_rows.append([
                _ws.get("name", ""), df.get("name", ""),
                df.get("generation", ""), df.get("state", ""),
                df.get("configured_by", ""), df.get("modified_by", ""),
                df.get("modified_at", ""),
                df.get("entity_count", 0), df.get("datasource_count", 0),
                ds_types, df.get("total_transformation_steps", 0),
                cx.get("level", "None"), cx.get("score", 0),
                df.get("schedule_summary", ""),
                df.get("refresh_count", 0), df.get("failure_count", 0),
                f"{df.get('reliability_pct', '')}%" if df.get("reliability_pct") is not None else "—",
                df.get("last_refresh_time", ""),
                "Yes" if df.get("has_refresh_errors") else "No",
                df.get("gateway_id", "") or "—",
                upstream,
                last_txn.get("status", "") if last_txn else "",
                last_txn.get("error_message", "") if last_txn else "",
            ])
    _add_sheet("Dataflows", "DATAFLOWS INVENTORY",
               ["Workspace", "Dataflow Name", "Generation", "State", "Owner", "Modified By",
                "Last Modified", "Entities", "Data Sources", "Source Types",
                "Transform Steps", "Complexity Level", "Complexity Score",
                "Refresh Schedule", "Refresh Count", "Failure Count", "Reliability",
                "Last Refresh Time", "Has Errors", "Gateway ID",
                "Upstream Dataflows", "Last Run Status", "Last Error"],
               df_rows,
               col_widths=[20, 26, 9, 10, 20, 20, 20, 9, 11, 30, 14, 15, 13,
                           22, 13, 13, 11, 20, 10, 24, 24, 14, 34],
               header_bg=GREEN, alt_bg=LIGHT_GREEN, tab_color=GREEN,
               cell_overrides={(19, "Yes"): {"bg": LIGHT_RED, "color": RED, "bold": True}})

    # ── 13. Dataflow Entity Detail ────────────────────────────────────────────
    entity_rows = []
    for _ws in workspaces:
        for df in _ws.get("dataflows", []):
            for ent in df.get("entities", []):
                cx = ent.get("complexity") or {}
                raw_cols = ent.get("columns") or []
                # columns is a list of dicts {name, data_type} or plain strings
                col_names = ", ".join(
                    c.get("name", str(c)) if isinstance(c, dict) else str(c)
                    for c in raw_cols[:12]
                )
                entity_rows.append([
                    _ws.get("name", ""), df.get("name", ""),
                    df.get("generation", ""), ent.get("name", ""),
                    ent.get("column_count", len(raw_cols)), ent.get("step_count", 0),
                    cx.get("level", "None"), cx.get("score", 0),
                    cx.get("function_count", 0), cx.get("nesting_depth", 0),
                    ", ".join(cx.get("complex_functions", [])),
                    "Yes" if ent.get("is_enabled", True) else "No",
                    "Yes" if ent.get("is_hidden", False) else "No",
                    col_names or "—",
                ])
    _add_sheet("Dataflow Entities", "DATAFLOW ENTITY DETAIL",
               ["Workspace", "Dataflow", "Generation", "Entity Name",
                "Columns", "Transform Steps", "Complexity Level", "Score",
                "M Functions", "Nesting Depth", "Complex Functions",
                "Enabled", "Hidden", "Columns (sample)"],
               entity_rows,
               col_widths=[20, 26, 9, 26, 9, 14, 15, 8, 11, 12, 28, 9, 9, 42],
               header_bg=TEAL_DARK, alt_bg=TEAL_LIGHT, tab_color=TEAL_DARK)

    # ── 14. Dataflow M Queries (full Power Query code) ────────────────────────
    mq_rows = []
    for _ws in workspaces:
        for df in _ws.get("dataflows", []):
            for ent in df.get("entities", []):
                # m_expression is the canonical field from dataflow_parser
                m_query = (
                    ent.get("m_expression")
                    or ent.get("m_query")
                    or ent.get("query_steps_raw")
                    or ent.get("power_query_m")
                    or ent.get("advanced_query")
                    or ""
                )
                # Fallback: join named_steps list
                if not m_query:
                    named = ent.get("named_steps") or []
                    if named:
                        m_query = "\n".join(str(s) for s in named)
                # Fallback: join query_steps list
                if not m_query:
                    steps = ent.get("query_steps") or []
                    if steps:
                        if steps and isinstance(steps[0], dict):
                            m_query = "\n".join(
                                f"// Step: {s.get('name','')}\n{s.get('expression','')}"
                                for s in steps if s.get("expression")
                            )
                        else:
                            m_query = "\n".join(str(s) for s in steps)
                cx = ent.get("complexity") or {}
                mq_rows.append([
                    _ws.get("name", ""), df.get("name", ""),
                    df.get("generation", ""), ent.get("name", ""),
                    ent.get("step_count", 0), cx.get("level", "None"),
                    cx.get("function_count", 0),
                    ", ".join(cx.get("complex_functions", [])),
                    m_query or "(not extracted — Gen1 or definition unavailable)",
                ])
    _add_sheet("Dataflow M Queries", "DATAFLOW M QUERIES (POWER QUERY)",
               ["Workspace", "Dataflow", "Generation", "Entity Name",
                "Step Count", "Complexity Level", "M Functions",
                "Complex Functions", "M Query / Power Query Expression"],
               mq_rows,
               col_widths=[20, 26, 9, 26, 10, 15, 12, 28, 90],
               header_bg=MID_BLUE, alt_bg=ACCENT_BLUE, tab_color=MID_BLUE,
               wrap_last_col=True)

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
