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

    def _parse_dt(v):
        if v is None:
            return None
        if isinstance(v, datetime):
            return v
        return datetime.fromisoformat(str(v))

    return JobRecord(
        job_id=row["job_id"],
        status=JobStatus(row["status"]),
        label=row.get("label"),
        created_at=_parse_dt(row["created_at"]) or datetime.now(timezone.utc),
        started_at=_parse_dt(row.get("started_at")),
        completed_at=_parse_dt(row.get("completed_at")),
        error=row.get("error"),
        progress_message=row.get("progress_message"),
        report_path=row.get("report_path"),
        results=None,   # results live in assessment_sections, not in memory
        session_id=row.get("session_id"),
        server_name=row.get("server_name"),
        database_name=row.get("database_name"),
    )


def create_job(record: JobRecord, user_id: Optional[str] = None) -> None:
    azure_store.create_job(
        record.job_id, record.label, record.created_at,
        session_id=record.session_id,
        server_name=record.server_name,
        database_name=record.database_name,
        user_id=user_id,
    )


def get_job(job_id: str) -> Optional[JobRecord]:
    row = azure_store.get_job(job_id)
    if row is None:
        return None
    return _row_to_record(row)


def update_job(job_id: str, **kwargs) -> None:
    # Strip keys that are not DB columns (e.g. 'results' is stored separately)
    kwargs.pop("results", None)
    azure_store.update_job(job_id, **kwargs)


def list_jobs(user_id: Optional[str] = None) -> list[JobRecord]:
    rows = azure_store.list_jobs(user_id=user_id)
    return [_row_to_record(r) for r in rows]
