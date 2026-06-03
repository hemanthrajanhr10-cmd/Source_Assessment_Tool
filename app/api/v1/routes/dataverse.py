"""
Dataverse Assessment API routes.

POST /dataverse/test-connection    — validate credentials, return org info
POST /dataverse/assess             — start async assessment job (202)
GET  /dataverse/jobs/{id}/status   — poll job status
GET  /dataverse/jobs/{id}/results  — fetch full result JSON
GET  /dataverse/sessions           — list all Dataverse assessment jobs
"""

from fastapi import APIRouter, BackgroundTasks, HTTPException, Depends
from fastapi.responses import StreamingResponse
import io

from app.api.v1.routes.auth import get_current_user
from app.models.dataverse_requests import (
    DataverseAssessmentRequest,
    DataverseAssessmentResult,
    DataverseJobResponse,
    DataverseJobStatusResponse,
    DataverseSessionRecord,
)
from app.db.dataverse_client import DataverseClient
from app.services import dataverse_service as svc

router = APIRouter(prefix="/api/v1/dataverse", tags=["Dataverse"])

AuthDep = Depends(get_current_user)


# ── Connection test ───────────────────────────────────────────────────────────

@router.post("/test-connection", summary="Test Dataverse connectivity")
async def test_connection(request: DataverseAssessmentRequest, _user=AuthDep) -> dict:
    try:
        client = DataverseClient(request.credentials)
        org = client.test_connection()
        return {"status": "ok", "organization": org}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


# ── Start assessment ──────────────────────────────────────────────────────────

@router.post(
    "/assess",
    status_code=202,
    response_model=DataverseJobResponse,
    summary="Start Dataverse assessment (async)",
)
async def start_assessment(
    request: DataverseAssessmentRequest,
    background_tasks: BackgroundTasks,
    _user=AuthDep,
) -> DataverseJobResponse:
    job_id = svc.create_job(request)
    background_tasks.add_task(svc.run_assessment, job_id, request)
    return DataverseJobResponse(
        job_id=job_id,
        status="pending",
        message="Dataverse assessment queued — 23 domains across 100+ checks.",
    )


# ── Job status ────────────────────────────────────────────────────────────────

@router.get(
    "/jobs/{job_id}/status",
    response_model=DataverseJobStatusResponse,
    summary="Poll Dataverse job status",
)
async def get_job_status(job_id: str, _user=AuthDep) -> DataverseJobStatusResponse:
    job = svc.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Dataverse job {job_id!r} not found.")
    return DataverseJobStatusResponse(
        job_id=job["job_id"],
        status=job["status"],
        label=job.get("label"),
        progress_message=job.get("progress_message"),
        error=job.get("error"),
        created_at=job["created_at"],
        completed_at=job.get("completed_at"),
        checks_completed=job.get("checks_completed", 0),
        total_checks=job.get("total_checks", len(svc.STEPS)),
    )


# ── Full results ──────────────────────────────────────────────────────────────

@router.get(
    "/jobs/{job_id}/results",
    response_model=DataverseAssessmentResult,
    summary="Fetch full Dataverse assessment result",
)
async def get_job_results(job_id: str, _user=AuthDep) -> DataverseAssessmentResult:
    job = svc.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Dataverse job {job_id!r} not found.")
    if job["status"] not in ("completed", "failed"):
        raise HTTPException(status_code=425, detail="Assessment still in progress.")
    result = job.get("result")
    if not result:
        raise HTTPException(status_code=500, detail="Result data unavailable.")
    return result


# ── Sessions list ─────────────────────────────────────────────────────────────

@router.get(
    "/sessions",
    response_model=list[DataverseSessionRecord],
    summary="List all Dataverse assessment sessions",
)
async def list_sessions(_user=AuthDep) -> list[DataverseSessionRecord]:
    return svc.list_jobs()
