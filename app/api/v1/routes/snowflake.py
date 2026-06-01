"""
Snowflake Assessment API routes.

POST /snowflake/init-auth            — start browser OAuth session (opens system browser)
GET  /snowflake/auth-status/{id}     — poll auth session status
DELETE /snowflake/auth-sessions/{id} — revoke auth session
GET  /snowflake/auth-sessions        — list all auth sessions
POST /snowflake/assess               — start async assessment job (202)
GET  /snowflake/jobs/{id}/status     — poll job status
GET  /snowflake/jobs/{id}/results    — fetch full result
GET  /snowflake/jobs/{id}/report     — download Excel report
GET  /snowflake/jobs/{id}/word-report — download Word (.docx) report
GET  /snowflake/sessions             — list all Snowflake assessment jobs
"""

import io
from fastapi import APIRouter, BackgroundTasks, HTTPException, Depends
from fastapi.responses import StreamingResponse
import uuid

from app.api.v1.routes.auth import get_current_user
from app.db import snowflake_client as sf_client
from app.models.snowflake_requests import (
    SnowflakeAuthRequest,
    SnowflakeAuthResponse,
    SnowflakeAuthStatusResponse,
    SnowflakeAssessmentRequest,
    SnowflakeAssessmentResult,
    SnowflakeJobResponse,
    SnowflakeJobStatusResponse,
    SnowflakeSessionRecord,
)
from app.services import snowflake_service as svc

router = APIRouter(prefix="/api/v1/snowflake", tags=["Snowflake"])
AuthDep = Depends(get_current_user)


# ── Browser OAuth auth ────────────────────────────────────────────────────────

@router.post(
    "/init-auth",
    response_model=SnowflakeAuthResponse,
    summary="Initiate Snowflake browser OAuth (opens system browser)",
)
async def init_auth(request: SnowflakeAuthRequest, _user=AuthDep) -> SnowflakeAuthResponse:
    """
    Registers a new auth session and opens the default system browser for
    Snowflake SSO / OAuth.  Poll /auth-status/{auth_id} until status='authenticated'.
    """
    auth_id = str(uuid.uuid4())
    creds = request.credentials
    sf_client.init_auth_session(
        auth_id=auth_id,
        account=creds.account,
        username=creds.username,
        role=creds.role,
        warehouse=creds.warehouse,
        database=creds.database,
    )
    return SnowflakeAuthResponse(
        auth_id=auth_id,
        status="pending",
        message="Browser opened for Snowflake authentication. Complete login in your browser, then poll /auth-status.",
    )


@router.get(
    "/auth-status/{auth_id}",
    response_model=SnowflakeAuthStatusResponse,
    summary="Poll Snowflake browser OAuth status",
)
async def get_auth_status(auth_id: str, _user=AuthDep) -> SnowflakeAuthStatusResponse:
    session = sf_client.get_auth_status(auth_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Auth session {auth_id!r} not found.")
    return SnowflakeAuthStatusResponse(
        auth_id=auth_id,
        status=session["status"],
        account=session.get("current_account"),
        current_user=session.get("current_user"),
        current_role=session.get("current_role"),
        error=session.get("error"),
    )


@router.delete(
    "/auth-sessions/{auth_id}",
    summary="Revoke a Snowflake auth session",
)
async def revoke_auth(auth_id: str, _user=AuthDep) -> dict:
    found = sf_client.revoke_auth_session(auth_id)
    if not found:
        raise HTTPException(status_code=404, detail=f"Auth session {auth_id!r} not found.")
    return {"message": f"Auth session {auth_id} revoked."}


@router.get(
    "/auth-sessions",
    summary="List all active Snowflake auth sessions",
)
async def list_auth_sessions(_user=AuthDep) -> list[dict]:
    return sf_client.list_auth_sessions()


# ── Start assessment ──────────────────────────────────────────────────────────

@router.post(
    "/assess",
    status_code=202,
    response_model=SnowflakeJobResponse,
    summary="Start Snowflake assessment (async)",
)
async def start_assessment(
    request: SnowflakeAssessmentRequest,
    background_tasks: BackgroundTasks,
    _user=AuthDep,
) -> SnowflakeJobResponse:
    # Validate auth session before queueing
    session = sf_client.get_auth_status(request.auth_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Auth session {request.auth_id!r} not found.")
    if session.get("status") != "authenticated":
        raise HTTPException(
            status_code=409,
            detail=f"Auth session is '{session.get('status')}'. Complete browser login first.",
        )

    account = session.get("current_account") or session.get("account") or "unknown"
    job_id = svc.create_job(request, account)
    background_tasks.add_task(svc.run_assessment, job_id, request)
    return SnowflakeJobResponse(
        job_id=job_id,
        status="pending",
        message="Snowflake assessment queued.",
    )


# ── Job status ────────────────────────────────────────────────────────────────

@router.get(
    "/jobs/{job_id}/status",
    response_model=SnowflakeJobStatusResponse,
    summary="Poll Snowflake assessment job status",
)
async def get_job_status(job_id: str, _user=AuthDep) -> SnowflakeJobStatusResponse:
    job = svc.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id!r} not found.")
    return SnowflakeJobStatusResponse(
        job_id=job["job_id"],
        status=job["status"],
        label=job.get("label"),
        progress_message=job.get("progress_message"),
        error=job.get("error"),
        created_at=job["created_at"],
        completed_at=job.get("completed_at"),
    )


# ── Job results ───────────────────────────────────────────────────────────────

@router.get(
    "/jobs/{job_id}/results",
    response_model=SnowflakeAssessmentResult,
    summary="Fetch completed Snowflake assessment result",
)
async def get_job_results(job_id: str, _user=AuthDep) -> SnowflakeAssessmentResult:
    job = svc.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id!r} not found.")
    if job["status"] not in ("completed", "failed"):
        raise HTTPException(status_code=409, detail=f"Job is still '{job['status']}'.")
    results = job.get("results")
    if not results:
        raise HTTPException(status_code=404, detail="Results not available.")
    return SnowflakeAssessmentResult(**results)


# ── Excel report ──────────────────────────────────────────────────────────────

@router.get("/jobs/{job_id}/report", summary="Download Snowflake Excel report")
async def download_excel(job_id: str, _user=AuthDep):
    job = svc.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id!r} not found.")
    if job["status"] != "completed":
        raise HTTPException(status_code=409, detail="Report only available for completed jobs.")
    excel_bytes: bytes | None = job.get("excel_bytes")
    if not excel_bytes:
        raise HTTPException(status_code=404, detail="Excel report not available.")
    label = (job.get("label") or "snowflake_assessment").replace(" ", "_")
    return StreamingResponse(
        io.BytesIO(excel_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{label}_{job_id[:8]}.xlsx"'},
    )


# ── Word report ───────────────────────────────────────────────────────────────

@router.get("/jobs/{job_id}/word-report", summary="Download Snowflake Word report")
async def download_word(job_id: str, _user=AuthDep):
    job = svc.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id!r} not found.")
    if job["status"] != "completed":
        raise HTTPException(status_code=409, detail="Report only available for completed jobs.")
    word_bytes: bytes | None = job.get("word_bytes")
    if not word_bytes:
        raise HTTPException(status_code=404, detail="Word report not available.")
    label = (job.get("label") or "snowflake_assessment").replace(" ", "_")
    return StreamingResponse(
        io.BytesIO(word_bytes),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{label}_{job_id[:8]}.docx"'},
    )


# ── Sessions list ─────────────────────────────────────────────────────────────

@router.get(
    "/sessions",
    response_model=list[SnowflakeSessionRecord],
    summary="List all Snowflake assessment jobs",
)
async def list_sessions(_user=AuthDep) -> list[SnowflakeSessionRecord]:
    jobs = svc.list_jobs()
    return [
        SnowflakeSessionRecord(
            job_id=j["job_id"],
            label=j.get("label"),
            status=j["status"],
            account=j.get("account"),
            created_at=j["created_at"],
            completed_at=j.get("completed_at"),
            error=j.get("error"),
            results=SnowflakeAssessmentResult(**j["results"]) if j.get("results") else None,
        )
        for j in jobs
    ]
