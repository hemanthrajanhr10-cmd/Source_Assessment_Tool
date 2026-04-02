from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

from app.models.responses import JobStatus


@dataclass
class JobRecord:
    job_id: str
    status: JobStatus = JobStatus.PENDING
    label: Optional[str] = None
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error: Optional[str] = None
    progress_message: Optional[str] = None
    report_path: Optional[str] = None
    results: Optional[dict[str, Any]] = None
