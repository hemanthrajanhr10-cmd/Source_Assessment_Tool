"""
SAP Assessment API routes.

Mirrors the structure of assessment.py and sessions.py — same patterns:
  POST /sap/test-connection      — validate credentials, return system info
  POST /sap/assess               — start async assessment job (202)
  GET  /sap/jobs/{job_id}/status — poll job status
  GET  /sap/jobs/{job_id}/results — fetch full result
  GET  /sap/jobs/{job_id}/report  — download Excel export (stub)
  GET  /sap/sessions             — list all SAP jobs
"""

from fastapi import APIRouter, BackgroundTasks, HTTPException, Depends
from fastapi.responses import JSONResponse

from app.api.v1.routes.auth import get_current_user
from app.models.sap_requests import (
    SapAssessmentRequest,
    SapAssessmentResult,
    SapJobResponse,
    SapJobStatusResponse,
    SapSessionRecord,
)
from app.services import sap_assessment_service as svc

router = APIRouter(prefix="/api/v1/sap", tags=["SAP"])


# ── Dependency shorthand ──────────────────────────────────────────────────────

AuthDep = Depends(get_current_user)


# ── Connection test ───────────────────────────────────────────────────────────

@router.post("/test-connection", summary="Test SAP system connectivity")
async def test_connection(
    request: SapAssessmentRequest,
    _user=AuthDep,
) -> dict:
    result = svc.test_connection(request)
    return result


# ── Start assessment ──────────────────────────────────────────────────────────

@router.post(
    "/assess",
    status_code=202,
    response_model=SapJobResponse,
    summary="Start SAP assessment (async)",
)
async def start_assessment(
    request: SapAssessmentRequest,
    background_tasks: BackgroundTasks,
    _user=AuthDep,
) -> SapJobResponse:
    job_id = svc.create_job(request)
    background_tasks.add_task(svc.run_assessment, job_id, request)
    return SapJobResponse(
        job_id=job_id,
        status="pending",
        message=f"SAP {request.variant.upper()} assessment queued.",
    )


# ── Job status ────────────────────────────────────────────────────────────────

@router.get(
    "/jobs/{job_id}/status",
    response_model=SapJobStatusResponse,
    summary="Poll SAP job status",
)
async def get_job_status(job_id: str, _user=AuthDep) -> SapJobStatusResponse:
    job = svc.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"SAP job {job_id!r} not found.")
    return SapJobStatusResponse(
        job_id=job["job_id"],
        status=job["status"],
        variant=job["variant"],
        label=job.get("label"),
        progress_message=job.get("progress_message"),
        error=job.get("error"),
        created_at=job["created_at"],
        completed_at=job.get("completed_at"),
    )


# ── Job results ───────────────────────────────────────────────────────────────

@router.get(
    "/jobs/{job_id}/results",
    response_model=SapAssessmentResult,
    summary="Fetch completed SAP assessment result",
)
async def get_job_results(job_id: str, _user=AuthDep) -> SapAssessmentResult:
    job = svc.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"SAP job {job_id!r} not found.")
    if job["status"] not in ("completed", "failed"):
        raise HTTPException(status_code=409, detail=f"Job is still {job['status']}.")
    results = job.get("results")
    if not results:
        raise HTTPException(status_code=404, detail="Results not available — job may have failed.")
    return SapAssessmentResult(**results)


# ── Report download (stub — extend with openpyxl export) ─────────────────────

@router.get("/jobs/{job_id}/report", summary="Download SAP assessment Excel report")
async def download_report(job_id: str, _user=AuthDep):
    job = svc.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"SAP job {job_id!r} not found.")
    if job["status"] != "completed":
        raise HTTPException(status_code=409, detail="Report only available for completed jobs.")

    # TODO: generate a real Excel file using openpyxl (same pattern as session_service.py)
    # For now, return the JSON result as a downloadable .json stub.
    import json
    content = json.dumps(job.get("results", {}), indent=2, default=str)
    return JSONResponse(
        content={"stub": True, "message": "Excel export not yet implemented. Raw JSON attached.", "data": job.get("results", {})},
        headers={"Content-Disposition": f'attachment; filename="sap_assessment_{job_id[:8]}.json"'},
    )


# ── Sessions list ─────────────────────────────────────────────────────────────

@router.get(
    "/sessions",
    response_model=list[SapSessionRecord],
    summary="List all SAP assessment jobs",
)
async def list_sessions(_user=AuthDep) -> list[SapSessionRecord]:
    jobs = svc.list_jobs()
    return [
        SapSessionRecord(
            job_id=j["job_id"],
            variant=j["variant"],
            label=j.get("label"),
            status=j["status"],
            created_at=j["created_at"],
            completed_at=j.get("completed_at"),
            error=j.get("error"),
            results=SapAssessmentResult(**j["results"]) if j.get("results") else None,
        )
        for j in jobs
    ]
