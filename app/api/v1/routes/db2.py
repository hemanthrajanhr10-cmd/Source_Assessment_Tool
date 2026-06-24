"""
IBM Db2 Assessment API routes.

POST /api/v1/db2/test-connection      — verify credentials before queuing
POST /api/v1/db2/assess               — start async assessment job (202)
GET  /api/v1/db2/jobs/{id}/status     — poll job status
GET  /api/v1/db2/jobs/{id}/results    — fetch full result (JSON)
GET  /api/v1/db2/jobs/{id}/report     — download Excel report
GET  /api/v1/db2/sessions             — list all Db2 assessment sessions
"""

import io

from fastapi import APIRouter, BackgroundTasks, HTTPException, Depends
from fastapi.responses import StreamingResponse

from app.api.v1.routes.auth import get_current_user
from app.db import db2_client as db2
from app.models.db2_requests import (
    Db2ConnectionParams,
    Db2AssessmentResult,
    Db2JobResponse,
    Db2JobStatusResponse,
    Db2SessionRecord,
)
from app.services import db2_service as svc

router = APIRouter(prefix="/api/v1/db2", tags=["IBM Db2"])
AuthDep = Depends(get_current_user)


# ── Test connection ───────────────────────────────────────────────────────────

@router.post(
    "/test-connection",
    summary="Test IBM Db2 connection",
)
async def test_connection(params: Db2ConnectionParams, _user=AuthDep) -> dict:
    """
    Validates that the provided credentials can open a connection to the Db2
    instance.  Returns success/error without starting an assessment job.
    """
    try:
        result = db2.test_connection(
            hostname=params.hostname,
            port=params.port,
            database=params.database,
            username=params.username,
            password=params.password,
            ssl_enabled=params.ssl_enabled,
            ssl_server_certificate=params.ssl_server_certificate,
        )
        return result
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# ── Start assessment ──────────────────────────────────────────────────────────

@router.post(
    "/assess",
    status_code=202,
    response_model=Db2JobResponse,
    summary="Start IBM Db2 assessment (async)",
)
async def start_assessment(
    params: Db2ConnectionParams,
    background_tasks: BackgroundTasks,
    _user=AuthDep,
) -> Db2JobResponse:
    job_id = svc.create_job(params)
    background_tasks.add_task(svc.run_assessment, job_id, params)
    return Db2JobResponse(
        job_id=job_id,
        status="pending",
        message="IBM Db2 assessment queued. Poll /jobs/{job_id}/status for progress.",
    )


# ── Job status ────────────────────────────────────────────────────────────────

@router.get(
    "/jobs/{job_id}/status",
    response_model=Db2JobStatusResponse,
    summary="Poll IBM Db2 assessment job status",
)
async def get_job_status(job_id: str, _user=AuthDep) -> Db2JobStatusResponse:
    job = svc.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id!r} not found.")
    return Db2JobStatusResponse(
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
    response_model=Db2AssessmentResult,
    summary="Fetch completed IBM Db2 assessment result",
)
async def get_job_results(job_id: str, _user=AuthDep) -> Db2AssessmentResult:
    job = svc.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id!r} not found.")
    if job["status"] not in ("completed", "failed"):
        raise HTTPException(status_code=409, detail=f"Job is still '{job['status']}'.")
    results = job.get("results")
    if not results:
        raise HTTPException(status_code=404, detail="Results not yet available.")
    return Db2AssessmentResult(**results)


# ── Excel report ──────────────────────────────────────────────────────────────

@router.get(
    "/jobs/{job_id}/report",
    summary="Download IBM Db2 Excel report",
)
async def download_excel(job_id: str, _user=AuthDep):
    job = svc.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id!r} not found.")
    if job["status"] != "completed":
        raise HTTPException(status_code=409, detail="Report only available for completed jobs.")
    excel_bytes: bytes | None = job.get("excel_bytes")
    if not excel_bytes:
        raise HTTPException(status_code=404, detail="Excel report not yet available.")
    label = (job.get("label") or "ibm_db2_assessment").replace(" ", "_")
    return StreamingResponse(
        io.BytesIO(excel_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{label}_{job_id[:8]}.xlsx"'},
    )


# ── Sessions list ─────────────────────────────────────────────────────────────

@router.get(
    "/sessions",
    response_model=list[Db2SessionRecord],
    summary="List all IBM Db2 assessment sessions",
)
async def list_sessions(_user=AuthDep) -> list[Db2SessionRecord]:
    jobs = svc.list_jobs()
    records = []
    for j in jobs:
        raw_results = j.get("results")
        results_obj = Db2AssessmentResult(**raw_results) if raw_results else None
        records.append(
            Db2SessionRecord(
                job_id=j["job_id"],
                label=j.get("label"),
                status=j["status"],
                hostname=j.get("hostname"),
                database=j.get("database"),
                created_at=j["created_at"],
                completed_at=j.get("completed_at"),
                error=j.get("error"),
                results=results_obj,
            )
        )
    return records
