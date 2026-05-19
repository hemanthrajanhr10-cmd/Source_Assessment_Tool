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
from app.fabric_assessment import report_parser, tmdl_parser
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

class WorkspaceItemsRequest(BaseModel):
    workspace_ids: list[str]


class CreateSessionRequest(BaseModel):
    auth_id: str
    label: str | None = None
    workspace_ids: list[str] = []
    dataset_ids: list[str] = []
    report_ids: list[str] = []
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
            models, reports = await asyncio.gather(
                fabric_client.list_workspace_semantic_models(token, ws_id),
                fabric_client.list_workspace_reports(token, ws_id),
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
    return _format_session_record(row, include_results=True)


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
    _sem = asyncio.Semaphore(20)
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

    tracker = await _progress_store.create(session_id)
    await tracker.set_status("running")

    try:
        # ── Phase 1: Discovery ────────────────────────────────────────────────
        await tracker.set_phase("discovery")
        _db_progress("Discovering workspace items…")

        # Collections populated concurrently; safe under asyncio single-thread.
        ws_datasets: dict[str, list[dict]] = {}
        ws_reports: dict[str, list[dict]] = {}

        async def _discover_workspace(ws_id: str) -> None:
            """List models + reports for one workspace concurrently."""
            async with _sem:
                # Each workspace listing is two concurrent GET calls
                await fabric_rate_limiter.acquire(2)
                models, reports = await asyncio.gather(
                    fabric_client.list_workspace_semantic_models(token, ws_id),
                    fabric_client.list_workspace_reports(token, ws_id),
                )
            ws_datasets[ws_id] = [
                m for m in models
                if not dataset_ids or m.get("id", "") in dataset_ids
            ]
            ws_reports[ws_id] = [
                r for r in reports
                if not report_ids or r.get("id", "") in report_ids
            ]

        # Discover all workspaces concurrently
        await asyncio.gather(*[_discover_workspace(ws_id) for ws_id in workspace_ids])

        total_models = sum(len(v) for v in ws_datasets.values())
        total_reports = sum(len(v) for v in ws_reports.values())

        await tracker.set_totals(total_models, total_reports)
        _db_progress("Extraction starting…", md=0, mt=total_models, rd=0, rt=total_reports)
        logger.info(
            "Fabric session %s: discovered %d models, %d reports across %d workspaces",
            session_id, total_models, total_reports, len(workspace_ids),
        )

        # ── Fetch workspace metadata (for name/type/state) ────────────────────
        await fabric_rate_limiter.acquire()
        all_workspaces_meta = await fabric_client.list_workspaces(token)
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

        # ── Phase 4: Cross-linking ────────────────────────────────────────────
        # No additional API calls needed — link report→dataset by dataset_id field
        await tracker.set_phase("crosslinking")
        await tracker.phase_done("crosslinking")

        # ── Phase 5: Assemble results + save ──────────────────────────────────
        await tracker.set_phase("saving")
        _db_progress("Saving results…", md=total_models, mt=total_models, rd=total_reports, rt=total_reports, force=True)

        workspace_results: list[dict] = []
        for ws_id in workspace_ids:
            ws_meta     = ws_meta_map.get(ws_id, {"id": ws_id, "name": ws_id, "type": "Workspace", "state": "Active"})
            datasets_out = datasets_by_ws.get(ws_id, [])
            reports_out  = reports_by_ws.get(ws_id, [])
            workspace_results.append({
                "id":    ws_id,
                "name":  ws_meta.get("name", ws_id),
                "type":  ws_meta.get("type", "Workspace"),
                "state": ws_meta.get("state", "Active"),
                "dataset_count":          len(datasets_out),
                "report_count":           sum(1 for r in reports_out if not r.get("is_paginated")),
                "paginated_report_count": sum(1 for r in reports_out if r.get("is_paginated")),
                "datasets": datasets_out,
                "reports":  reports_out,
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

    except Exception as exc:
        logger.error("Fabric session %s failed: %s", session_id, exc, exc_info=True)
        azure_store.update_fabric_session(
            session_id,
            status="failed",
            completed_at=datetime.now(timezone.utc).isoformat(),
            error=str(exc)[:1000],
        )
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
                if age_minutes > 60:
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
                snapshot  = {"assessment_id": session_id, "status": db_status, "phase": "discovery"}

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

    for ws in workspaces:
        for ds in ws.get("datasets", []):
            total_measures += ds.get("measure_count", 0)
            total_calc_tables += ds.get("calculated_table_count", 0)
            total_calc_cols += ds.get("calculated_column_count", 0)
            total_rels += ds.get("relationship_count", 0)
        for rpt in ws.get("reports", []):
            total_visuals += rpt.get("visual_count", 0)

    return {
        "workspace_count": len(workspaces),
        "dataset_count": sum(ws.get("dataset_count", 0) for ws in workspaces),
        "report_count": sum(ws.get("report_count", 0) for ws in workspaces),
        "paginated_report_count": sum(ws.get("paginated_report_count", 0) for ws in workspaces),
        "total_measures": total_measures,
        "total_calculated_tables": total_calc_tables,
        "total_calculated_columns": total_calc_cols,
        "total_relationships": total_rels,
        "total_visuals": total_visuals,
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


# ── Excel export ──────────────────────────────────────────────────────────────

def _generate_excel(results: dict, label: str) -> bytes:
    """Generate a multi-sheet Excel file from FabricResults."""
    try:
        import openpyxl
        from openpyxl.styles import Font, PatternFill, Alignment
        from openpyxl.utils import get_column_letter
    except ImportError:
        raise HTTPException(status_code=503, detail="openpyxl not installed")

    wb = openpyxl.Workbook()
    wb.remove(wb.active)  # remove default sheet

    HEADER_FONT = Font(bold=True, color="FFFFFF")
    HEADER_FILL = PatternFill("solid", fgColor="4F46E5")

    def _add_sheet(name: str, headers: list[str], rows: list[list]) -> None:
        ws = wb.create_sheet(title=name[:31])
        ws.append(headers)
        for cell in ws[1]:
            cell.font = HEADER_FONT
            cell.fill = HEADER_FILL
            cell.alignment = Alignment(horizontal="center")
        for row in rows:
            ws.append([str(v) if v is not None else "" for v in row])
        for col_idx in range(1, len(headers) + 1):
            ws.column_dimensions[get_column_letter(col_idx)].width = 22

    workspaces = results.get("workspaces", [])
    summary = results.get("summary", {})

    # ── Summary sheet ─────────────────────────────────────────────────────────
    _add_sheet("Summary", ["Metric", "Value"], [
        ["Workspaces", summary.get("workspace_count", 0)],
        ["Semantic Models", summary.get("dataset_count", 0)],
        ["Reports", summary.get("report_count", 0)],
        ["Paginated Reports", summary.get("paginated_report_count", 0)],
        ["Total Measures", summary.get("total_measures", 0)],
        ["Calculated Tables", summary.get("total_calculated_tables", 0)],
        ["Calculated Columns", summary.get("total_calculated_columns", 0)],
        ["Relationships", summary.get("total_relationships", 0)],
        ["Total Visuals", summary.get("total_visuals", 0)],
        ["Assessed At", results.get("assessed_at", "")],
    ])

    # ── Models sheet ──────────────────────────────────────────────────────────
    model_rows = []
    for ws in workspaces:
        for ds in ws.get("datasets", []):
            model_rows.append([
                ws.get("name", ""), ds.get("name", ""), ds.get("storage_mode", ""),
                ds.get("configured_by", ""), ds.get("table_count", 0),
                ds.get("measure_count", 0), ds.get("calculated_column_count", 0),
                ds.get("calculated_table_count", 0), ds.get("relationship_count", 0),
                ds.get("complexity_score", 0),
            ])
    _add_sheet("Semantic Models",
               ["Workspace", "Model", "Storage Mode", "Owner", "Tables",
                "Measures", "Calc Cols", "Calc Tables", "Relationships", "Complexity"],
               model_rows)

    # ── Measures sheet ────────────────────────────────────────────────────────
    measure_rows = []
    for ws in workspaces:
        for ds in ws.get("datasets", []):
            for m in ds.get("measures", []):
                cx = m.get("complexity") or {}
                measure_rows.append([
                    ws.get("name", ""), ds.get("name", ""), m.get("table", ""),
                    m.get("name", ""), m.get("display_folder", ""),
                    cx.get("score", 0), cx.get("level", "None"),
                    cx.get("nesting_depth", 0), cx.get("function_count", 0),
                    m.get("expression", "")[:200],
                ])
    _add_sheet("Measures",
               ["Workspace", "Model", "Table", "Measure", "Folder",
                "Score", "Level", "Depth", "Functions", "Expression"],
               measure_rows)

    # ── Relationships sheet ───────────────────────────────────────────────────
    rel_rows = []
    for ws in workspaces:
        for ds in ws.get("datasets", []):
            for r in ds.get("relationships", []):
                rel_rows.append([
                    ws.get("name", ""), ds.get("name", ""),
                    r.get("from_table", ""), r.get("from_column", ""),
                    r.get("to_table", ""), r.get("to_column", ""),
                    r.get("cardinality", ""), r.get("cross_filter", ""),
                    "Yes" if r.get("is_active", True) else "No",
                ])
    _add_sheet("Relationships",
               ["Workspace", "Model", "From Table", "From Column",
                "To Table", "To Column", "Cardinality", "Cross Filter", "Active"],
               rel_rows)

    # ── Reports sheet ─────────────────────────────────────────────────────────
    report_rows = []
    for ws in workspaces:
        for rpt in ws.get("reports", []):
            report_rows.append([
                ws.get("name", ""), rpt.get("name", ""),
                rpt.get("report_type", ""), "Yes" if rpt.get("is_paginated") else "No",
                rpt.get("page_count", 0) or 0, rpt.get("visual_count", 0),
                rpt.get("bookmark_count", 0),
                "Yes" if rpt.get("layout_parsed") else "No",
            ])
    _add_sheet("Reports",
               ["Workspace", "Report", "Type", "Paginated",
                "Pages", "Visuals", "Bookmarks", "Full Analysis"],
               report_rows)

    # ── Complexity Top-50 sheet ───────────────────────────────────────────────
    complexity_items: list[tuple[int, list]] = []
    for ws in workspaces:
        for ds in ws.get("datasets", []):
            for m in ds.get("measures", []):
                cx = m.get("complexity") or {}
                if cx.get("score", 0) > 0:
                    complexity_items.append((cx["score"], [
                        ws.get("name", ""), ds.get("name", ""), "Measure",
                        m.get("name", ""), m.get("table", ""),
                        cx["score"], cx.get("level", ""), cx.get("nesting_depth", 0),
                        ", ".join(cx.get("complex_functions", [])),
                    ]))
            for c in ds.get("calculated_columns", []):
                cx = c.get("complexity") or {}
                if cx.get("score", 0) > 0:
                    complexity_items.append((cx["score"], [
                        ws.get("name", ""), ds.get("name", ""), "Calc Column",
                        c.get("name", ""), c.get("table", ""),
                        cx["score"], cx.get("level", ""), cx.get("nesting_depth", 0),
                        ", ".join(cx.get("complex_functions", [])),
                    ]))
    complexity_items.sort(key=lambda x: x[0], reverse=True)
    _add_sheet("Complexity Top 50",
               ["Workspace", "Model", "Type", "Name", "Table",
                "Score", "Level", "Depth", "Complex Functions"],
               [row for _, row in complexity_items[:50]])

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
