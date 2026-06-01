"""
Snowflake assessment request and response models.

Auth: Browser-based OAuth (externalbrowser via snowflake-connector-python)
  - Flow: init-auth → browser opens → poll auth-status → assess
APIs used: Snowflake Python connector + INFORMATION_SCHEMA + ACCOUNT_USAGE
"""

from typing import Optional, Literal
from pydantic import BaseModel, Field


# ── Connection / Auth parameters ──────────────────────────────────────────────

class SnowflakeCredentials(BaseModel):
    """Credentials to initiate Snowflake browser OAuth."""
    account: str = Field(..., description="Snowflake account identifier, e.g. myorg-myaccount or myaccount.us-east-1")
    username: Optional[str] = Field(None, description="Snowflake username (optional login hint for SSO)")
    role: Optional[str] = Field(None, description="Default role to activate after login")
    warehouse: Optional[str] = Field(None, description="Default warehouse to use")
    database: Optional[str] = Field(None, description="Default database scope")


class SnowflakeAuthRequest(BaseModel):
    credentials: SnowflakeCredentials


class SnowflakeAssessmentRequest(BaseModel):
    """Start a Snowflake assessment using a completed auth session."""
    auth_id: str = Field(..., description="Auth session ID returned by /init-auth")
    label: Optional[str] = Field(None, description="Human-readable label for this assessment")
    include_query_history: bool = Field(True, description="Fetch query stats from ACCOUNT_USAGE (requires ACCOUNTADMIN)")
    include_storage_usage: bool = Field(True, description="Fetch storage metrics from ACCOUNT_USAGE")
    include_warehouse_metering: bool = Field(True, description="Fetch warehouse credit usage from ACCOUNT_USAGE")
    max_databases: int = Field(10, ge=1, le=50, description="Max databases to enumerate schemas/tables in")


# ── Account Info ──────────────────────────────────────────────────────────────

class SnowflakeAccountInfo(BaseModel):
    account_name: str
    organization_name: Optional[str] = None
    account_locator: Optional[str] = None
    cloud_provider: Optional[str] = None
    region: Optional[str] = None
    edition: Optional[str] = None
    snowflake_version: Optional[str] = None
    current_role: Optional[str] = None
    current_warehouse: Optional[str] = None
    current_user: Optional[str] = None


# ── Compute ───────────────────────────────────────────────────────────────────

class SnowflakeWarehouse(BaseModel):
    name: str
    state: str
    wh_type: str = "STANDARD"
    size: str
    auto_suspend: int = 600
    auto_resume: bool = True
    cluster_count: Optional[int] = None
    max_cluster_count: Optional[int] = None
    running: int = 0
    queued: int = 0
    is_default: bool = False
    owner: Optional[str] = None
    comment: Optional[str] = None
    scaling_policy: Optional[str] = None


class SnowflakeWarehouseMetrics(BaseModel):
    total_warehouses: int
    active_warehouses: int
    suspended_warehouses: int
    warehouses_by_size: dict[str, int] = {}
    multi_cluster_warehouses: int = 0


# ── Data Objects ──────────────────────────────────────────────────────────────

class SnowflakeDatabase(BaseModel):
    name: str
    origin: Optional[str] = None
    owner: Optional[str] = None
    comment: Optional[str] = None
    retention_time: int = 1
    created_on: Optional[str] = None
    is_default: bool = False
    is_transient: bool = False


class SnowflakeSchema(BaseModel):
    database_name: str
    name: str
    owner: Optional[str] = None
    retention_time: int = 1
    comment: Optional[str] = None
    is_managed_access: bool = False
    is_transient: bool = False


class SnowflakeTable(BaseModel):
    database_name: str
    schema_name: str
    name: str
    table_type: str  # BASE TABLE, VIEW, EXTERNAL TABLE, MATERIALIZED VIEW, etc.
    row_count: Optional[int] = None
    bytes: Optional[int] = None
    clustering_key: Optional[str] = None
    is_transient: bool = False
    retention_time: int = 1
    created: Optional[str] = None
    last_altered: Optional[str] = None


# ── Summary stats ─────────────────────────────────────────────────────────────

class SnowflakeDatabaseSummary(BaseModel):
    total_databases: int = 0
    total_schemas: int = 0
    total_tables: int = 0
    total_views: int = 0
    total_external_tables: int = 0
    total_materialized_views: int = 0
    total_size_bytes: int = 0


class SnowflakeObjectInventory(BaseModel):
    stages: int = 0
    pipes: int = 0
    tasks: int = 0
    streams: int = 0
    procedures: int = 0
    functions: int = 0
    sequences: int = 0
    file_formats: int = 0
    dynamic_tables: int = 0
    shares_outbound: int = 0
    shares_inbound: int = 0
    resource_monitors: int = 0
    network_policies: int = 0
    masking_policies: int = 0
    row_access_policies: int = 0


# ── Users / Security ──────────────────────────────────────────────────────────

class SnowflakeUserProfile(BaseModel):
    total_users: int = 0
    disabled_users: int = 0
    users_without_mfa: int = 0
    admin_users: int = 0
    service_accounts: int = 0
    total_roles: int = 0
    custom_roles: int = 0
    system_roles: int = 0


class SnowflakeSecurityPosture(BaseModel):
    network_policies_count: int = 0
    users_without_mfa: int = 0
    users_with_default_role_public: int = 0
    masking_policies_count: int = 0
    row_access_policies_count: int = 0
    shares_total: int = 0
    resource_monitors_count: int = 0


# ── Performance / Cost ────────────────────────────────────────────────────────

class SnowflakeQueryMetrics(BaseModel):
    total_queries_last_7d: int = 0
    failed_queries_last_7d: int = 0
    avg_execution_ms: float = 0.0
    p95_execution_ms: float = 0.0
    bytes_scanned_total: int = 0
    bytes_spilled_local: int = 0
    bytes_spilled_remote: int = 0
    most_expensive_queries: list[dict] = []
    query_error_types: dict[str, int] = {}


class SnowflakeStorageMetrics(BaseModel):
    storage_bytes: int = 0
    stage_bytes: int = 0
    failsafe_bytes: int = 0
    total_bytes: int = 0


class SnowflakeCostMetrics(BaseModel):
    credits_used_last_30d: float = 0.0
    compute_credits: float = 0.0
    cloud_services_credits: float = 0.0
    top_warehouses_by_credit: list[dict] = []


# ── Top-level assessment result ───────────────────────────────────────────────

class SnowflakeAssessmentResult(BaseModel):
    job_id: str
    label: Optional[str] = None
    assessed_at: str
    status: Literal["completed", "failed"]
    error: Optional[str] = None

    account_info: Optional[SnowflakeAccountInfo] = None
    warehouse_metrics: Optional[SnowflakeWarehouseMetrics] = None
    database_summary: Optional[SnowflakeDatabaseSummary] = None
    object_inventory: Optional[SnowflakeObjectInventory] = None
    user_profile: Optional[SnowflakeUserProfile] = None
    security_posture: Optional[SnowflakeSecurityPosture] = None
    query_metrics: Optional[SnowflakeQueryMetrics] = None
    storage_metrics: Optional[SnowflakeStorageMetrics] = None
    cost_metrics: Optional[SnowflakeCostMetrics] = None

    # Detail lists (capped)
    warehouses: Optional[list[SnowflakeWarehouse]] = None
    databases: Optional[list[SnowflakeDatabase]] = None
    schemas: Optional[list[SnowflakeSchema]] = None
    tables: Optional[list[SnowflakeTable]] = None
    users: Optional[list[dict]] = None
    roles: Optional[list[dict]] = None


# ── Auth response models ──────────────────────────────────────────────────────

class SnowflakeAuthResponse(BaseModel):
    auth_id: str
    status: str
    message: str


class SnowflakeAuthStatusResponse(BaseModel):
    auth_id: str
    status: str  # pending | authenticated | failed
    account: Optional[str] = None
    current_user: Optional[str] = None
    current_role: Optional[str] = None
    error: Optional[str] = None


# ── Job response models ───────────────────────────────────────────────────────

class SnowflakeJobResponse(BaseModel):
    job_id: str
    status: str
    message: str


class SnowflakeJobStatusResponse(BaseModel):
    job_id: str
    status: str
    label: Optional[str] = None
    progress_message: Optional[str] = None
    error: Optional[str] = None
    created_at: str
    completed_at: Optional[str] = None


class SnowflakeSessionRecord(BaseModel):
    job_id: str
    label: Optional[str] = None
    status: str
    account: Optional[str] = None
    created_at: str
    completed_at: Optional[str] = None
    error: Optional[str] = None
    results: Optional[SnowflakeAssessmentResult] = None
