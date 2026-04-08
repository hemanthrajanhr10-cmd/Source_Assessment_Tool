"""
Job store — thin wrapper over the Azure SQL persistence layer.
Maintains the same public interface as the old in-memory store so
all callers (routes, services) need no changes to their import paths.
"""

from datetime import datetime, timezone
from typing import Any, Optional

from app.db import azure_store
from app.models.job import JobRecord
from app.models.responses import JobStatus


def _row_to_record(row: dict) -> JobRecord:
    """Convert a raw DB row dict into a JobRecord dataclass."""
    return JobRecord(
        job_id=row["job_id"],
        status=JobStatus(row["status"]),
        label=row.get("label"),
        created_at=row["created_at"] if isinstance(row["created_at"], datetime)
                   else datetime.fromisoformat(str(row["created_at"])),
        started_at=row.get("started_at"),
        completed_at=row.get("completed_at"),
        error=row.get("error"),
        progress_message=row.get("progress_message"),
        report_path=row.get("report_path"),
        results=None,   # results live in assessment_sections, not in memory
    )


def create_job(record: JobRecord) -> None:
    azure_store.create_job(record.job_id, record.label, record.created_at)


def get_job(job_id: str) -> Optional[JobRecord]:
    row = azure_store.get_job(job_id)
    if row is None:
        return None
    return _row_to_record(row)


def update_job(job_id: str, **kwargs) -> None:
    # Strip keys that are not DB columns (e.g. 'results' is stored separately)
    kwargs.pop("results", None)
    azure_store.update_job(job_id, **kwargs)


def list_jobs() -> list[JobRecord]:
    rows = azure_store.list_jobs()
    return [_row_to_record(r) for r in rows]
