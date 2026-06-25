"""
Infor CloudSuite Assessment API routes.

Mirrors the structure of sap.py and db2.py:
  POST /api/v1/infor/test-connection  — validate ION credentials, detect engine
  POST /api/v1/infor/assess           — start async assessment job (202)
  GET  /api/v1/infor/jobs/{id}/status — poll job status
  GET  /api/v1/infor/jobs/{id}/results — fetch full result (JSON)
  GET  /api/v1/infor/jobs/{id}/report  — download Excel workbook
  GET  /api/v1/infor/sessions          — list all Infor assessment jobs
"""

from fastapi import APIRouter, BackgroundTasks, HTTPException, Depends
from fastapi.responses import Response

from app.api.v1.routes.auth import get_current_user
from app.models.infor_requests import (
    InforAssessmentRequest,
    InforAssessmentResult,
    InforJobResponse,
    InforJobStatusResponse,
    InforSessionRecord,
)
from app.services import infor_service as svc

router = APIRouter(prefix="/api/v1/infor", tags=["Infor CloudSuite"])

AuthDep = Depends(get_current_user)


# ── Connection test ───────────────────────────────────────────────────────────

@router.post("/test-connection", summary="Test Infor ION API connectivity and detect engine")
async def test_connection(
    request: InforAssessmentRequest,
    _user=AuthDep,
) -> dict:
    """
    Attempts OAuth authentication against the ION API and reports:
    - Whether credentials are valid
    - Which engine was detected (m3 / ln / csi)
    - Tenant metadata

    Does NOT start an assessment job — safe to call repeatedly.
    """
    return svc.test_connection(request)


# ── Start assessment ──────────────────────────────────────────────────────────

@router.post(
    "/assess",
    status_code=202,
    response_model=InforJobResponse,
    summary="Start Infor CloudSuite assessment (async)",
)
async def start_assessment(
    request: InforAssessmentRequest,
    background_tasks: BackgroundTasks,
    _user=AuthDep,
) -> InforJobResponse:
    """
    Queues a 35-step engine-aware Infor assessment.

    If `engine` is not supplied in the request body, the connector auto-detects
    the engine via the ION tenant application catalog.  If detection fails, the
    job transitions immediately to `failed` with a clear error message explaining
    why the engine must be specified explicitly.
    """
    job_id = svc.create_job(request)
    background_tasks.add_task(svc.run_assessment, job_id, request)
    engine_hint = request.engine or request.edition or "auto-detect"
    return InforJobResponse(
        job_id=job_id,
        status="pending",
        message=f"Infor CloudSuite assessment queued (engine: {engine_hint}).",
    )


# ── Job status ────────────────────────────────────────────────────────────────

@router.get(
    "/jobs/{job_id}/status",
    response_model=InforJobStatusResponse,
    summary="Poll Infor assessment job status",
)
async def get_job_status(job_id: str, _user=AuthDep) -> InforJobStatusResponse:
    job = svc.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Infor job {job_id!r} not found.")
    return InforJobStatusResponse(
        job_id=job["job_id"],
        status=job["status"],
        engine=job.get("engine"),
        label=job.get("label"),
        progress_message=job.get("progress_message"),
        error=job.get("error"),
        created_at=job["created_at"],
        completed_at=job.get("completed_at"),
    )


# ── Job results ───────────────────────────────────────────────────────────────

@router.get(
    "/jobs/{job_id}/results",
    response_model=InforAssessmentResult,
    summary="Fetch completed Infor assessment result (JSON)",
)
async def get_job_results(job_id: str, _user=AuthDep) -> InforAssessmentResult:
    job = svc.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Infor job {job_id!r} not found.")
    if job["status"] not in ("completed", "failed"):
        raise HTTPException(status_code=409, detail=f"Job is still {job['status']}.")
    results = job.get("results")
    if not results:
        raise HTTPException(status_code=404, detail="Results not available — job may have failed.")
    return InforAssessmentResult(**results)


# ── Excel report download ─────────────────────────────────────────────────────

@router.get(
    "/jobs/{job_id}/report",
    summary="Download Infor assessment Excel workbook (9 sheets)",
)
async def download_report(job_id: str, _user=AuthDep):
    job = svc.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Infor job {job_id!r} not found.")
    if job["status"] != "completed":
        raise HTTPException(status_code=409, detail="Report only available for completed jobs.")
    excel_bytes: bytes | None = job.get("excel_bytes")
    if not excel_bytes:
        # Re-generate on demand if not cached (e.g. after server restart)
        results = job.get("results")
        if results:
            from app.models.infor_requests import InforAssessmentResult as _R
            from app.services.infor_service import _build_excel
            excel_bytes = _build_excel(_R(**results))
        else:
            raise HTTPException(status_code=404, detail="Excel report not available.")
    engine = job.get("engine", "infor")
    filename = f"infor_{engine}_assessment_{job_id[:8]}.xlsx"
    return Response(
        content=excel_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── Sessions list ─────────────────────────────────────────────────────────────

@router.get(
    "/sessions",
    response_model=list[InforSessionRecord],
    summary="List all Infor CloudSuite assessment jobs",
)
async def list_sessions(_user=AuthDep) -> list[InforSessionRecord]:
    jobs = svc.list_jobs()
    records = []
    for j in jobs:
        result_data = j.get("results")
        records.append(InforSessionRecord(
            job_id=j["job_id"],
            engine=j.get("engine"),
            label=j.get("label"),
            tenant_id=j.get("tenant_id"),
            status=j["status"],
            created_at=j["created_at"],
            completed_at=j.get("completed_at"),
            error=j.get("error"),
            results=InforAssessmentResult(**result_data) if result_data else None,
        ))
    return records
