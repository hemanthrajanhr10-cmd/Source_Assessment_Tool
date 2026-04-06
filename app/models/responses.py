import re
from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel


def humanize_connection_error(exc: Exception, server: str = "", database: str = "") -> str:
    """
    Convert a raw ODBC / mssql-python exception into a short, actionable message.
    """
    msg = str(exc)

    patterns = [
        (r"No such host is known",
         f"Cannot reach SQL Server host '{server}'. Check the server name and network connectivity."),
        (r"(Connection timeout|Timeout expired|timed out)",
         f"Connection to '{server}' timed out. Verify the server name, port, and that the firewall allows port access."),
        (r"Login failed for user",
         "Login failed. Check the username and password."),
        (r"Cannot open database",
         f"Database '{database}' not found or the login does not have access to it."),
        (r"(SSL|TLS|certificate)",
         "SSL/TLS handshake error. Try toggling 'Encrypt Connection' or 'Trust Server Certificate'."),
        (r"Named Pipes Provider",
         f"Cannot connect via Named Pipes to '{server}'. Ensure TCP/IP is enabled on the SQL Server instance."),
        (r"network.related or instance.specific",
         f"Could not reach SQL Server at '{server}'. Check server name, port, and firewall rules."),
        (r"(Access is denied|Permission denied)",
         "Access denied. The account may lack permission to connect to this server."),
        (r"server was not found or was not accessible",
         f"SQL Server '{server}' not found or not accessible. Verify the instance name and that SQL Server is running."),
    ]

    for pattern, friendly in patterns:
        if re.search(pattern, msg, re.IGNORECASE):
            return friendly

    # Fallback: trim the raw ODBC preamble and return the core message
    cleaned = re.sub(r"\[Microsoft\]\[ODBC Driver \d+ for SQL Server\]", "", msg).strip()
    return cleaned or "An unexpected connection error occurred."


class ConnectionTestResponse(BaseModel):
    success: bool
    message: str


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
    # Core metadata
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
    # Security assessment
    db_users_roles: list[dict[str, Any]]
    orphaned_users: list[dict[str, Any]]
    db_owner_members: list[dict[str, Any]]
    dynamic_sql_usage: list[dict[str, Any]]
    clr_assemblies: list[dict[str, Any]]
    tde_status: list[dict[str, Any]]
    column_encryption: list[dict[str, Any]]
    pii_indicators: list[dict[str, Any]]
    # Feature usage & risks
    sql_agent_jobs: list[dict[str, Any]]
    linked_servers: list[dict[str, Any]]
    cross_db_references: list[dict[str, Any]]
    replication_status: list[dict[str, Any]]
    service_broker: list[dict[str, Any]]
    version_features: list[dict[str, Any]]
