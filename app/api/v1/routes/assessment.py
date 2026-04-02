"""
Assessment API routes.

POST   /api/v1/assess               — trigger a new assessment job (202 Accepted)
GET    /api/v1/jobs                 — list all jobs
GET    /api/v1/jobs/{job_id}/status — poll job status + progress
GET    /api/v1/jobs/{job_id}/results — fetch full JSON results (completed jobs only)
GET    /api/v1/jobs/{job_id}/report  — download Excel report (completed jobs only)
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import FileResponse

from app.core import job_store
from app.core.logging import get_logger
from app.models.job import JobRecord
from app.models.requests import AssessmentRequest
from app.models.responses import (
    AssessmentResponse,
    AssessmentResults,
    JobStatus,
    JobStatusResponse,
    OverviewResult,
)
from app.services import assessment_service

router = APIRouter()
logger = get_logger(__name__)

EXCEL_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


# ─────────────────────── Background task bridge ─────────────────────────────

def _run_assessment_task(job_id: str, request: AssessmentRequest) -> None:
    """
    Executed in FastAPI's default thread-pool executor (not the event loop).
    Updates job state before, during, and after the assessment run.
    """
    job_store.update_job(
        job_id,
        status=JobStatus.RUNNING,
        started_at=datetime.now(timezone.utc),
    )
    try:
        results, report_path = assessment_service.run_assessment(job_id, request)
        job_store.update_job(
            job_id,
            status=JobStatus.COMPLETED,
            completed_at=datetime.now(timezone.utc),
            results=results,
            report_path=report_path,
            progress_message="Assessment complete.",
        )
        logger.info("Job %s completed", job_id, extra={"job_id": job_id})
    except Exception as exc:
        logger.error(
            "Job %s failed: %s", job_id, exc,
            extra={"job_id": job_id}, exc_info=True,
        )
        job_store.update_job(
            job_id,
            status=JobStatus.FAILED,
            completed_at=datetime.now(timezone.utc),
            error=str(exc),
            progress_message=None,
        )


# ──────────────────────────── Endpoints ─────────────────────────────────────

@router.post(
    "/assess",
    response_model=AssessmentResponse,
    status_code=202,
    summary="Trigger a new SQL Server assessment",
    description=(
        "Accepts SQL Server connection credentials and assessment options. "
        "Returns a job ID immediately. Poll `/jobs/{job_id}/status` to track progress."
    ),
)
async def trigger_assessment(
    body: AssessmentRequest,
    background_tasks: BackgroundTasks,
) -> AssessmentResponse:
    job_id = str(uuid.uuid4())
    record = JobRecord(job_id=job_id, label=body.label)
    job_store.create_job(record)

    background_tasks.add_task(_run_assessment_task, job_id, body)

    logger.info("Assessment job %s queued", job_id, extra={"job_id": job_id})
    return AssessmentResponse(
        job_id=job_id,
        status=JobStatus.PENDING,
        message="Assessment queued. Poll /jobs/{job_id}/status for updates.",
    )


@router.get(
    "/jobs",
    response_model=list[JobStatusResponse],
    summary="List all assessment jobs",
)
async def list_jobs() -> list[JobStatusResponse]:
    records = job_store.list_jobs()
    return [_to_status_response(r) for r in records]


@router.get(
    "/jobs/{job_id}/status",
    response_model=JobStatusResponse,
    summary="Get job status and progress",
)
async def get_job_status(job_id: str) -> JobStatusResponse:
    record = job_store.get_job(job_id)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found.")
    return _to_status_response(record)


@router.get(
    "/jobs/{job_id}/results",
    response_model=AssessmentResults,
    summary="Get full JSON results of a completed assessment",
)
async def get_results(job_id: str) -> AssessmentResults:
    record = _require_completed(job_id)

    raw = record.results or {}
    overview_raw = raw.get("overview")
    overview: OverviewResult | None = None
    if isinstance(overview_raw, dict):
        try:
            overview = OverviewResult(**overview_raw)
        except Exception:
            overview = None

    return AssessmentResults(
        job_id=job_id,
        overview=overview,
        schemas=raw.get("schemas", []),
        tables=raw.get("tables", []),
        columns=raw.get("columns", []),
        views=raw.get("views", []),
        stored_procedures=raw.get("stored_procedures", []),
        functions=raw.get("functions", []),
        indexes=raw.get("indexes", []),
        relationships=raw.get("relationships", []),
        index_coverage=raw.get("index_coverage", []),
        insertion_frequency=raw.get("insertion_frequency", []),
        null_analysis=raw.get("null_analysis", []),
    )


@router.get(
    "/jobs/{job_id}/report",
    summary="Download the Excel assessment report",
    response_class=FileResponse,
)
async def download_report(job_id: str) -> FileResponse:
    record = _require_completed(job_id)

    if not record.report_path:
        raise HTTPException(status_code=404, detail="Report file not found.")

    import os
    if not os.path.isfile(record.report_path):
        raise HTTPException(status_code=404, detail="Report file missing from disk.")

    filename = f"sql_assessment_{job_id[:8]}.xlsx"
    return FileResponse(
        path=record.report_path,
        media_type=EXCEL_MEDIA_TYPE,
        filename=filename,
    )


# ──────────────────────────── Helpers ───────────────────────────────────────

def _to_status_response(record: JobRecord) -> JobStatusResponse:
    return JobStatusResponse(
        job_id=record.job_id,
        status=record.status,
        label=record.label,
        created_at=record.created_at,
        started_at=record.started_at,
        completed_at=record.completed_at,
        error=record.error,
        progress_message=record.progress_message,
    )


def _require_completed(job_id: str) -> JobRecord:
    record = job_store.get_job(job_id)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found.")
    if record.status == JobStatus.PENDING:
        raise HTTPException(status_code=409, detail="Assessment is still pending.")
    if record.status == JobStatus.RUNNING:
        raise HTTPException(status_code=409, detail="Assessment is still running.")
    if record.status == JobStatus.FAILED:
        raise HTTPException(
            status_code=422,
            detail=f"Assessment failed: {record.error}",
        )
    return record
