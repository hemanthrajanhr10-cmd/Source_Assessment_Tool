"""
Salesforce Assessment API routes.

POST /salesforce/test-connection          — validate credentials, return org info
POST /salesforce/assess                   — start async assessment job (202)
GET  /salesforce/jobs/{id}/status         — poll job status
GET  /salesforce/jobs/{id}/results        — fetch full result JSON
GET  /salesforce/jobs/{id}/export/excel   — download 15-sheet Excel workbook
GET  /salesforce/sessions                 — list all Salesforce assessment sessions
"""

from fastapi import APIRouter, BackgroundTasks, HTTPException, Depends
from fastapi.responses import Response

from app.api.v1.routes.auth import get_current_user
from app.models.salesforce_requests import (
    SalesforceAssessmentRequest,
    SalesforceAssessmentResult,
    SalesforceJobResponse,
    SalesforceJobStatusResponse,
    SalesforceSessionRecord,
)
from app.services import salesforce_service as svc

router = APIRouter(prefix="/api/v1/salesforce", tags=["Salesforce"])

AuthDep = Depends(get_current_user)


# ── Connection test ───────────────────────────────────────────────────────────

@router.post("/test-connection", summary="Test Salesforce connectivity")
async def test_connection(request: SalesforceAssessmentRequest, _user=AuthDep) -> dict:
    try:
        info = svc.test_connection(request)
        return {"status": "ok", "org": info}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


# ── Start assessment ──────────────────────────────────────────────────────────

@router.post(
    "/assess",
    status_code=202,
    response_model=SalesforceJobResponse,
    summary="Start Salesforce assessment (async)",
)
async def start_assessment(
    request: SalesforceAssessmentRequest,
    background_tasks: BackgroundTasks,
    _user=AuthDep,
) -> SalesforceJobResponse:
    job_id = svc.create_job(request)
    background_tasks.add_task(svc.run_assessment, job_id, request)
    return SalesforceJobResponse(
        job_id=job_id,
        status="pending",
        message=(
            "Salesforce assessment queued — 8+ API surfaces, 20 domains, 100+ checks, 35 steps, 15-sheet Excel. "
            "REST · Metadata · Tooling · Bulk · Analytics · Security · Automation · Integrations · "
            "Org Limits · Packages · Operations · UI Components · Field Schema · Experience Cloud · Business Objects."
        ),
    )


# ── Job status ────────────────────────────────────────────────────────────────

@router.get(
    "/jobs/{job_id}/status",
    response_model=SalesforceJobStatusResponse,
    summary="Poll Salesforce job status",
)
async def get_job_status(job_id: str, _user=AuthDep) -> SalesforceJobStatusResponse:
    job = svc.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Salesforce job {job_id!r} not found.")
    return SalesforceJobStatusResponse(
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
    response_model=SalesforceAssessmentResult,
    summary="Fetch full Salesforce assessment result",
)
async def get_job_results(job_id: str, _user=AuthDep) -> SalesforceAssessmentResult:
    job = svc.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Salesforce job {job_id!r} not found.")
    if job["status"] not in ("completed", "failed"):
        raise HTTPException(status_code=425, detail="Assessment still in progress.")
    result = job.get("result")
    if not result:
        raise HTTPException(status_code=500, detail="Result data unavailable.")
    return result


# ── Sessions list ─────────────────────────────────────────────────────────────

@router.get(
    "/sessions",
    response_model=list[SalesforceSessionRecord],
    summary="List all Salesforce assessment sessions",
)
async def list_sessions(_user=AuthDep) -> list[SalesforceSessionRecord]:
    return svc.list_jobs()


# ── Excel export ──────────────────────────────────────────────────────────────

@router.get(
    "/jobs/{job_id}/export/excel",
    summary="Export Salesforce assessment as 15-sheet Excel workbook",
)
async def export_excel(job_id: str, _user=AuthDep) -> Response:
    job = svc.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Salesforce job {job_id!r} not found.")
    if job["status"] != "completed":
        raise HTTPException(status_code=425, detail="Assessment not yet complete.")
    result = job.get("result")
    if not result:
        raise HTTPException(status_code=500, detail="Result data unavailable.")

    label = job.get("label") or job_id
    try:
        xlsx = svc.build_excel_report(result, label)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    filename = f"salesforce_assessment_{job_id[:8]}.xlsx"
    return Response(
        content=xlsx,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
