from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel


class JobStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class AssessmentResponse(BaseModel):
    job_id: str
    status: JobStatus
    message: str


class JobStatusResponse(BaseModel):
    job_id: str
    status: JobStatus
    label: Optional[str]
    created_at: datetime
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    error: Optional[str]
    progress_message: Optional[str]


class OverviewResult(BaseModel):
    database_name: str
    connected_user: str
    sql_server_version: str
    schema_count: int
    table_count: int
    view_count: int
    stored_proc_count: int
    function_count: int
    total_size_mb: Optional[float]


class AssessmentResults(BaseModel):
    job_id: str
    overview: Optional[OverviewResult]
    schemas: list[dict[str, Any]]
    tables: list[dict[str, Any]]
    columns: list[dict[str, Any]]
    views: list[dict[str, Any]]
    stored_procedures: list[dict[str, Any]]
    functions: list[dict[str, Any]]
    indexes: list[dict[str, Any]]
    relationships: list[dict[str, Any]]
    index_coverage: list[dict[str, Any]]
    insertion_frequency: list[dict[str, Any]]
    null_analysis: list[dict[str, Any]]
