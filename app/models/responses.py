import re
from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel


# ── Session response models ────────────────────────────────────────────────────

class ConnectivityResult(BaseModel):
    server: str
    port: int
    reachable: bool
    latency_ms: Optional[float]


class DatabaseInfo(BaseModel):
    name: str
    size_mb: Optional[float]
    state: str


class CreateSessionResponse(BaseModel):
    session_id: str
    status: str
    total_jobs: int


class SessionJobInfo(BaseModel):
    job_id: str
    server: str
    database: str
    status: str
    progress_message: Optional[str]
    error: Optional[str]
    started_at: Optional[datetime]
    completed_at: Optional[datetime]


class SessionStatusResponse(BaseModel):
    session_id: str
    label: Optional[str]
    status: str
    total_jobs: int
    completed_jobs: int
    failed_jobs: int
    created_at: datetime
    completed_at: Optional[datetime]
    jobs: list[SessionJobInfo]


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
    CANCELLED = "cancelled"


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
    access_level: Optional[str]
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
    # ── New: Schema / Design checks (db_datareader) ───────────────────────────
    trustworthy_databases: list[dict[str, Any]]
    deprecated_data_types: list[dict[str, Any]]
    missing_primary_keys: list[dict[str, Any]]
    heap_tables: list[dict[str, Any]]
    untrusted_constraints: list[dict[str, Any]]
    sp_naming_violations: list[dict[str, Any]]
    sp_complexity: list[dict[str, Any]]
    duplicate_indexes: list[dict[str, Any]]
    database_options_audit: list[dict[str, Any]]
    object_permissions: list[dict[str, Any]]
    # ── New: Performance checks (view_database_state) ─────────────────────────
    missing_indexes: list[dict[str, Any]]
    index_usage_stats: list[dict[str, Any]]
    fragmentation_report: list[dict[str, Any]]
    statistics_health: list[dict[str, Any]]
    # ── New: Reliability / Config checks (sysadmin) ───────────────────────────
    backup_history: list[dict[str, Any]]
    server_configurations: list[dict[str, Any]]
    weak_sql_logins: list[dict[str, Any]]
    server_permissions: list[dict[str, Any]]
    deprecated_features_in_use: list[dict[str, Any]]
    # ── Extended engine assessment ────────────────────────────────────────────
    schema_classification: list[dict[str, Any]]
    view_complexity: list[dict[str, Any]]
    database_files: list[dict[str, Any]]
    ssis_catalog_packages: list[dict[str, Any]]
    ssis_execution_history: list[dict[str, Any]]
    ssis_msdb_packages: list[dict[str, Any]]
    sql_agent_job_schedules: list[dict[str, Any]]
    sql_agent_job_steps: list[dict[str, Any]]
    ssas_linked_servers: list[dict[str, Any]]
    wait_statistics: list[dict[str, Any]]
    query_store_top_queries: list[dict[str, Any]]
    # ── PostgreSQL-specific extended sections ─────────────────────────────────
    pg_extensions: list[dict[str, Any]]
    pg_triggers: list[dict[str, Any]]
    pg_sequences: list[dict[str, Any]]
    pg_partitions: list[dict[str, Any]]
    pg_matviews: list[dict[str, Any]]
    pg_table_bloat: list[dict[str, Any]]
    pg_connection_stats: list[dict[str, Any]]
