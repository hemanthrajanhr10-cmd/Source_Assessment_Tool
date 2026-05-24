"""
Session API routes.

POST /api/v1/detect-connectivity         — TCP test per server (on-prem detection)
POST /api/v1/list-databases              — list available databases on a server
POST /api/v1/sessions                    — create a multi-server assessment session (202)
GET  /api/v1/sessions                    — list all sessions
GET  /api/v1/sessions/{session_id}/status — session status + per-job details
GET  /api/v1/sessions/{session_id}/report — download combined Excel report
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import FileResponse, Response

from app.core.dependencies import get_current_user
from app.core.logging import get_logger
from app.db import azure_store
from app.models.requests import ConnectivityTestRequest, ListDatabasesRequest, SessionRequest
from app.models.responses import (
    ConnectivityResult,
    CreateSessionResponse,
    DatabaseInfo,
    SessionJobInfo,
    SessionStatusResponse,
)
from app.services import session_service

router = APIRouter()
logger = get_logger(__name__)

EXCEL_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
WORD_MEDIA_TYPE  = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


# ──────────────────────────── Utility endpoints ──────────────────────────────

@router.post(
    "/detect-connectivity",
    response_model=list[ConnectivityResult],
    summary="TCP connectivity test per server",
    description=(
        "Tests whether each server is reachable via TCP. "
        "Unreachable servers are likely on-premises — use a gateway agent for those."
    ),
)
async def detect_connectivity(body: ConnectivityTestRequest) -> list[ConnectivityResult]:
    results = []
    for s in body.servers:
        server = str(s.get("server", ""))
        port = int(s.get("port", 1433))
        reachable, latency_ms = session_service.test_connectivity(server, port)
        results.append(ConnectivityResult(
            server=server,
            port=port,
            reachable=reachable,
            latency_ms=latency_ms,
        ))
    return results


@router.post(
    "/list-databases",
    response_model=list[DatabaseInfo],
    summary="List available databases on a server",
    description=(
        "Connects to the server and returns all non-system user databases. "
        "Always returns 200; raises 422 if connection fails."
    ),
)
async def list_databases(body: ListDatabasesRequest) -> list[DatabaseInfo]:
    try:
        dbs = session_service.list_databases(body.connection)
        return [
            DatabaseInfo(
                name=d["name"],
                size_mb=d.get("size_mb"),
                state=d.get("state_desc", "ONLINE"),
            )
            for d in dbs
        ]
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc))


# ──────────────────────────── Session endpoints ───────────────────────────────

@router.post(
    "/sessions",
    response_model=CreateSessionResponse,
    status_code=202,
    summary="Create a multi-server assessment session",
    description=(
        "Accepts one or more SQL Servers with selected databases. "
        "Returns a session ID immediately. Poll `/sessions/{id}/status` for progress."
    ),
)
async def create_session(
    body: SessionRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
) -> CreateSessionResponse:
    total_jobs = sum(len(srv.databases) for srv in body.servers)
    if total_jobs == 0:
        raise HTTPException(
            status_code=422,
            detail="No databases selected. Add at least one database per server.",
        )

    session_id = str(uuid.uuid4())
    azure_store.create_session(session_id, body.label, datetime.now(timezone.utc), user_id=current_user["user_id"], total_jobs=total_jobs)

    if body.unified_session_id:
        try:
            azure_store.link_unified_source(body.unified_session_id, session_id)
        except Exception as exc:
            logger.warning("Could not link source session %s to unified session %s: %s", session_id, body.unified_session_id, exc)

    background_tasks.add_task(session_service.run_session_background, session_id, body, current_user["user_id"])

    logger.info("Session %s created — %d job(s)", session_id, total_jobs)
    return CreateSessionResponse(session_id=session_id, status="pending", total_jobs=total_jobs)


@router.get(
    "/sessions",
    response_model=list[SessionStatusResponse],
    summary="List all assessment sessions",
)
async def list_sessions(current_user: dict = Depends(get_current_user)) -> list[SessionStatusResponse]:
    rows = azure_store.list_sessions(user_id=current_user["user_id"])
    result = []
    for row in rows:
        jobs = azure_store.list_session_jobs(row["session_id"])
        result.append(_build_response(row, jobs))
    return result


@router.get(
    "/sessions/{session_id}/status",
    response_model=SessionStatusResponse,
    summary="Get session status and per-job details",
)
async def get_session_status(session_id: str, current_user: dict = Depends(get_current_user)) -> SessionStatusResponse:
    row = azure_store.get_session(session_id)
    if row is None or row.get("user_id") != current_user["user_id"]:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found.")
    jobs = azure_store.list_session_jobs(session_id)
    return _build_response(row, jobs)


@router.post(
    "/sessions/{session_id}/cancel",
    summary="Cancel a running or pending session",
)
async def cancel_session(session_id: str, current_user: dict = Depends(get_current_user)):
    row = azure_store.get_session(session_id)
    if row is None or row.get("user_id") != current_user["user_id"]:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found.")
    if row["status"] not in ("pending", "running"):
        raise HTTPException(
            status_code=409,
            detail=f"Session is already '{row['status']}' and cannot be cancelled.",
        )
    azure_store.cancel_session(session_id)
    logger.info("Session %s cancelled by user", session_id)
    return {"ok": True, "session_id": session_id, "status": "cancelled"}


@router.get(
    "/sessions/{session_id}/report",
    summary="Download combined Excel assessment report for a session",
    response_class=FileResponse,
)
async def download_session_report(session_id: str, current_user: dict = Depends(get_current_user)) -> FileResponse:
    row = azure_store.get_session(session_id)
    if row is None or row.get("user_id") != current_user["user_id"]:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found.")

    jobs = azure_store.list_session_jobs(session_id)
    completed = [j for j in jobs if j["status"] == "completed"]
    if not completed:
        raise HTTPException(
            status_code=409,
            detail="No completed jobs in this session yet. Wait for at least one job to finish.",
        )

    # Collect results for all completed jobs
    jobs_data = []
    for job in completed:
        try:
            raw = azure_store.load_full_results(job["job_id"])
            jobs_data.append({
                "job_id": job["job_id"],
                "server": job.get("server_name") or "",
                "database": job.get("database_name") or "",
                "results": raw,
            })
        except Exception as exc:
            logger.warning("Could not load results for job %s: %s", job["job_id"], exc)

    if not jobs_data:
        raise HTTPException(status_code=409, detail="Could not load results for any completed jobs.")

    from app.services.report_service import build_session_report
    report_path = build_session_report(session_id, jobs_data)

    return FileResponse(
        path=report_path,
        media_type=EXCEL_MEDIA_TYPE,
        filename=f"session_{session_id[:8]}.xlsx",
    )


@router.get(
    "/sessions/{session_id}/word-report",
    summary="Download combined Word Fabric Assessment Report for a session",
)
async def download_session_word_report(
    session_id: str, current_user: dict = Depends(get_current_user)
) -> Response:
    row = azure_store.get_session(session_id)
    if row is None or row.get("user_id") != current_user["user_id"]:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found.")

    jobs = azure_store.list_session_jobs(session_id)
    completed = [j for j in jobs if j["status"] == "completed"]
    if not completed:
        raise HTTPException(
            status_code=409,
            detail="No completed jobs in this session yet.",
        )

    jobs_data = []
    for job in completed:
        try:
            raw = azure_store.load_full_results(job["job_id"])
            jobs_data.append({
                "job_id":   job["job_id"],
                "server":   job.get("server_name") or "",
                "database": job.get("database_name") or "",
                "label":    job.get("label") or job.get("database_name") or "",
                "results":  raw,
            })
        except Exception as exc:
            logger.warning("Could not load results for job %s: %s", job["job_id"], exc)

    if not jobs_data:
        raise HTTPException(status_code=409, detail="Could not load results for any completed jobs.")

    from app.services.ai_report_service import build_ai_session_word_report
    doc_bytes = build_ai_session_word_report(
        session_id=session_id,
        session_label=row.get("label"),
        jobs_data=jobs_data,
    )

    filename = f"fabric_assessment_{session_id[:8]}.docx"
    return Response(
        content=doc_bytes,
        media_type=WORD_MEDIA_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ──────────────────────────── Helpers ────────────────────────────────────────

def _parse_dt(v) -> datetime | None:
    if v is None:
        return None
    if isinstance(v, datetime):
        return v
    return datetime.fromisoformat(str(v))


def _build_response(row: dict, jobs: list[dict]) -> SessionStatusResponse:
    job_infos = [
        SessionJobInfo(
            job_id=j["job_id"],
            server=j.get("server_name") or "",
            database=j.get("database_name") or "",
            status=j["status"],
            progress_message=j.get("progress_message"),
            error=j.get("error"),
            started_at=_parse_dt(j.get("started_at")),
            completed_at=_parse_dt(j.get("completed_at")),
        )
        for j in jobs
    ]

    created_at = _parse_dt(row["created_at"]) or datetime.now(timezone.utc)

    return SessionStatusResponse(
        session_id=row["session_id"],
        label=row.get("label"),
        status=row["status"],
        total_jobs=row.get("total_jobs", 0),
        completed_jobs=row.get("completed_jobs", 0),
        failed_jobs=row.get("failed_jobs", 0),
        created_at=created_at,
        completed_at=_parse_dt(row.get("completed_at")),
        jobs=job_infos,
    )
