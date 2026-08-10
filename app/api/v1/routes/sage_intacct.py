"""
Sage Intacct Assessment API routes.

POST /sage-intacct/test-connection   — validate credentials, return company info
POST /sage-intacct/assess            — start async assessment job (202)
GET  /sage-intacct/jobs/{id}/status  — poll job status
GET  /sage-intacct/jobs/{id}/results — fetch full result
GET  /sage-intacct/jobs/{id}/report  — download Excel report
GET  /sage-intacct/jobs/{id}/word-report — download Word (.docx) report
GET  /sage-intacct/sessions          — list all Sage Intacct jobs
"""

from fastapi import APIRouter, BackgroundTasks, HTTPException, Depends
from fastapi.responses import StreamingResponse, JSONResponse
import io

from app.api.v1.routes.auth import get_current_user
from app.models.sage_intacct_requests import (
    SageIntacctAssessmentRequest,
    SageIntacctAssessmentResult,
    SageIntacctJobResponse,
    SageIntacctJobStatusResponse,
    SageIntacctSessionRecord,
)
from app.services import sage_intacct_service as svc

router = APIRouter(prefix="/api/v1/sage-intacct", tags=["Sage Intacct"])

AuthDep = Depends(get_current_user)


# ── Connection test ───────────────────────────────────────────────────────────

@router.post("/test-connection", summary="Test Sage Intacct connectivity")
async def test_connection(request: SageIntacctAssessmentRequest, _user=AuthDep) -> dict:
    return svc.test_connection(request)


# ── Start assessment ──────────────────────────────────────────────────────────

@router.post(
    "/assess",
    status_code=202,
    response_model=SageIntacctJobResponse,
    summary="Start Sage Intacct assessment (async)",
)
async def start_assessment(
    request: SageIntacctAssessmentRequest,
    background_tasks: BackgroundTasks,
    _user=AuthDep,
) -> SageIntacctJobResponse:
    job_id = svc.create_job(request)
    background_tasks.add_task(svc.run_assessment, job_id, request)
    return SageIntacctJobResponse(
        job_id=job_id,
        status="pending",
        message="Sage Intacct assessment queued.",
    )


# ── Job status ────────────────────────────────────────────────────────────────

@router.get(
    "/jobs/{job_id}/status",
    response_model=SageIntacctJobStatusResponse,
    summary="Poll Sage Intacct job status",
)
async def get_job_status(job_id: str, _user=AuthDep) -> SageIntacctJobStatusResponse:
    job = svc.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Sage Intacct job {job_id!r} not found.")
    return SageIntacctJobStatusResponse(
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
    response_model=SageIntacctAssessmentResult,
    summary="Fetch completed Sage Intacct assessment result",
)
async def get_job_results(job_id: str, _user=AuthDep) -> SageIntacctAssessmentResult:
    job = svc.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Sage Intacct job {job_id!r} not found.")
    if job["status"] not in ("completed", "failed"):
        raise HTTPException(status_code=409, detail=f"Job is still {job['status']}.")
    results = job.get("results")
    if not results:
        raise HTTPException(status_code=404, detail="Results not available.")
    return SageIntacctAssessmentResult(**results)


# ── Excel report ──────────────────────────────────────────────────────────────

@router.get("/jobs/{job_id}/report", summary="Download Sage Intacct Excel report")
async def download_excel_report(job_id: str, _user=AuthDep):
    job = svc.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Sage Intacct job {job_id!r} not found.")
    if job["status"] != "completed":
        raise HTTPException(status_code=409, detail="Report only available for completed jobs.")
    excel_bytes: bytes | None = job.get("excel_bytes")
    if not excel_bytes:
        raise HTTPException(status_code=404, detail="Excel report not available.")
    label = (job.get("label") or "sage_intacct_assessment").replace(" ", "_")
    filename = f"{label}_{job_id[:8]}.xlsx"
    return StreamingResponse(
        io.BytesIO(excel_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── Word report ───────────────────────────────────────────────────────────────

@router.get("/jobs/{job_id}/word-report", summary="Download Sage Intacct Word report")
async def download_word_report(job_id: str, _user=AuthDep):
    job = svc.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Sage Intacct job {job_id!r} not found.")
    if job["status"] != "completed":
        raise HTTPException(status_code=409, detail="Report only available for completed jobs.")
    word_bytes: bytes | None = job.get("word_bytes")
    if not word_bytes:
        raise HTTPException(status_code=404, detail="Word report not available.")
    label = (job.get("label") or "sage_intacct_assessment").replace(" ", "_")
    filename = f"{label}_{job_id[:8]}.docx"
    return StreamingResponse(
        io.BytesIO(word_bytes),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── Sessions list ─────────────────────────────────────────────────────────────

@router.get(
    "/sessions",
    response_model=list[SageIntacctSessionRecord],
    summary="List all Sage Intacct assessment jobs",
)
async def list_sessions(_user=AuthDep) -> list[SageIntacctSessionRecord]:
    jobs = svc.list_jobs()
    return [
        SageIntacctSessionRecord(
            job_id=j["job_id"],
            label=j.get("label"),
            status=j["status"],
            created_at=j["created_at"],
            completed_at=j.get("completed_at"),
            error=j.get("error"),
            results=SageIntacctAssessmentResult(**j["results"]) if j.get("results") else None,
        )
        for j in jobs
    ]
