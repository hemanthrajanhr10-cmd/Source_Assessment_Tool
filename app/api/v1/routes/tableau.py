"""
Tableau Assessment API routes — Superior Edition.

POST /tableau/test-connection          — validate credentials
POST /tableau/assess                   — start async assessment (202)
GET  /tableau/jobs/{id}/status         — poll job status
GET  /tableau/jobs/{id}/results        — fetch full result (includes migration feasibility)
GET  /tableau/jobs/{id}/report         — download Excel report (12 sheets)
GET  /tableau/jobs/{id}/word-report    — download AI-powered Word report
GET  /tableau/sessions                 — list all Tableau jobs
"""

from fastapi import APIRouter, BackgroundTasks, HTTPException, Depends
from fastapi.responses import StreamingResponse
import io

from app.api.v1.routes.auth import get_current_user
from app.models.tableau_requests import (
    TableauAssessmentRequest,
    TableauAssessmentResult,
    TableauJobResponse,
    TableauJobStatusResponse,
    TableauSessionRecord,
)
from app.services import tableau_service as svc

router = APIRouter(prefix="/api/v1/tableau", tags=["Tableau"])

AuthDep = Depends(get_current_user)


# ── Connection test ───────────────────────────────────────────────────────────

@router.post("/test-connection", summary="Test Tableau Server/Cloud connectivity")
async def test_connection(request: TableauAssessmentRequest, _user=AuthDep) -> dict:
    return svc.test_connection(request)


# ── Start assessment ──────────────────────────────────────────────────────────

@router.post(
    "/assess",
    status_code=202,
    response_model=TableauJobResponse,
    summary="Start Tableau assessment (async)",
)
async def start_assessment(
    request: TableauAssessmentRequest,
    background_tasks: BackgroundTasks,
    _user=AuthDep,
) -> TableauJobResponse:
    job_id = svc.create_job(request)
    background_tasks.add_task(svc.run_assessment, job_id, request)
    return TableauJobResponse(
        job_id=job_id,
        status="pending",
        message="Tableau assessment queued.",
    )


# ── Job status ────────────────────────────────────────────────────────────────

@router.get(
    "/jobs/{job_id}/status",
    response_model=TableauJobStatusResponse,
    summary="Poll Tableau job status",
)
async def get_job_status(job_id: str, _user=AuthDep) -> TableauJobStatusResponse:
    job = svc.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Tableau job {job_id!r} not found.")
    return TableauJobStatusResponse(
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
    response_model=TableauAssessmentResult,
    summary="Fetch completed Tableau assessment result",
)
async def get_job_results(job_id: str, _user=AuthDep) -> TableauAssessmentResult:
    job = svc.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Tableau job {job_id!r} not found.")
    if job["status"] not in ("completed", "failed"):
        raise HTTPException(status_code=409, detail=f"Job is still {job['status']}.")
    results = job.get("results")
    if not results:
        raise HTTPException(status_code=404, detail="Results not available.")
    return TableauAssessmentResult(**results)


# ── Excel report ──────────────────────────────────────────────────────────────

@router.get("/jobs/{job_id}/report", summary="Download Tableau Excel report")
async def download_excel_report(job_id: str, _user=AuthDep):
    job = svc.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Tableau job {job_id!r} not found.")
    if job["status"] != "completed":
        raise HTTPException(status_code=409, detail="Report only available for completed jobs.")
    excel_bytes: bytes | None = job.get("excel_bytes")
    if not excel_bytes:
        raise HTTPException(status_code=404, detail="Excel report not available.")
    label = (job.get("label") or "tableau_assessment").replace(" ", "_")
    filename = f"{label}_{job_id[:8]}.xlsx"
    return StreamingResponse(
        io.BytesIO(excel_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── Word report ───────────────────────────────────────────────────────────────

@router.get("/jobs/{job_id}/word-report", summary="Download Tableau Word report")
async def download_word_report(job_id: str, _user=AuthDep):
    job = svc.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Tableau job {job_id!r} not found.")
    if job["status"] != "completed":
        raise HTTPException(status_code=409, detail="Report only available for completed jobs.")
    word_bytes: bytes | None = job.get("word_bytes")
    if not word_bytes:
        raise HTTPException(status_code=404, detail="Word report not available.")
    label = (job.get("label") or "tableau_assessment").replace(" ", "_")
    filename = f"{label}_{job_id[:8]}.docx"
    return StreamingResponse(
        io.BytesIO(word_bytes),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── AI Word report (regenerate) ───────────────────────────────────────────────

@router.post("/jobs/{job_id}/regenerate-word-report", summary="Regenerate AI-powered Word report")
async def regenerate_word_report(job_id: str, _user=AuthDep):
    """Re-run the AI Word report generation for a completed job. Useful when AI is added after initial run."""
    job = svc.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Tableau job {job_id!r} not found.")
    if job["status"] != "completed":
        raise HTTPException(status_code=409, detail="Report only available for completed jobs.")
    results = job.get("results")
    if not results:
        raise HTTPException(status_code=404, detail="Assessment results not available.")
    try:
        from app.services.ai_report_service import build_tableau_ai_word_report
        label = job.get("label") or results.get("server_info", {}).get("site_name") or job_id[:8]
        word_bytes = build_tableau_ai_word_report(job_id, results, client_name=label)
        svc._update(job_id, word_bytes=word_bytes)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI report generation failed: {exc}")
    label_str = (job.get("label") or "tableau_assessment").replace(" ", "_")
    filename = f"{label_str}_{job_id[:8]}_ai.docx"
    return StreamingResponse(
        io.BytesIO(word_bytes),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── Sessions list ─────────────────────────────────────────────────────────────

@router.get(
    "/sessions",
    response_model=list[TableauSessionRecord],
    summary="List all Tableau assessment jobs",
)
async def list_sessions(_user=AuthDep) -> list[TableauSessionRecord]:
    jobs = svc.list_jobs()
    return [
        TableauSessionRecord(
            job_id=j["job_id"],
            label=j.get("label"),
            status=j["status"],
            server_url=j.get("server_url"),
            created_at=j["created_at"],
            completed_at=j.get("completed_at"),
            error=j.get("error"),
            results=TableauAssessmentResult(**j["results"]) if j.get("results") else None,
        )
        for j in jobs
    ]
