"""
Handles assessment results received from the gateway agent via Service Bus.
Called by the Service Bus result listener background thread.
"""

from datetime import datetime, timezone
from typing import Any, Optional

from app.core import job_store
from app.core.logging import get_logger
from app.db import azure_store
from app.models.responses import JobStatus
from app.services import report_service
from app.services.assessment_service import _extract_overview

logger = get_logger(__name__)


def handle_result(job_id: str, body: dict) -> None:
    """
    Process a completed assessment result from the agent.
    Persists to Azure SQL and generates the Excel report.
    """
    error: Optional[str] = body.get("error")

    if error:
        logger.error("Agent reported failure for job %s: %s", job_id, error)
        job_store.update_job(
            job_id,
            status=JobStatus.FAILED,
            completed_at=datetime.now(timezone.utc),
            error=error,
            progress_message=None,
        )
        return

    raw: dict[str, Any] = body.get("results") or {}
    if not raw:
        logger.error("Empty results for job %s", job_id)
        job_store.update_job(
            job_id,
            status=JobStatus.FAILED,
            completed_at=datetime.now(timezone.utc),
            error="Agent returned empty results.",
            progress_message=None,
        )
        return

    try:
        job_store.update_job(job_id, progress_message="Persisting results to Azure SQL…")

        overview_raw = raw.get("overview")
        if isinstance(overview_raw, list):
            overview_dict = _extract_overview(overview_raw)
        elif isinstance(overview_raw, dict):
            overview_dict = overview_raw
        else:
            overview_dict = None

        azure_store.save_overview(job_id, overview_dict)
        azure_store.save_sections(job_id, raw)

        job_store.update_job(job_id, progress_message="Building Excel report…")
        report_path = report_service.build_report(job_id, raw)

        job_store.update_job(
            job_id,
            status=JobStatus.COMPLETED,
            completed_at=datetime.now(timezone.utc),
            report_path=report_path,
            progress_message="Completed via gateway agent.",
        )
        logger.info("Job %s completed successfully via Service Bus", job_id)

    except Exception as exc:
        logger.exception("Failed to process results for job %s: %s", job_id, exc)
        job_store.update_job(
            job_id,
            status=JobStatus.FAILED,
            completed_at=datetime.now(timezone.utc),
            error=str(exc),
            progress_message=None,
        )

    # If this job belongs to a session, update session progress
    try:
        job_row = azure_store.get_job(job_id)
        if job_row and job_row.get("session_id"):
            from app.services.session_service import update_session_progress
            update_session_progress(job_row["session_id"])
    except Exception as exc:
        logger.warning("Could not update session progress for job %s: %s", job_id, exc)
