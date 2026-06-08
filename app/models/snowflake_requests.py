"""
Snowflake assessment request and response models.

Auth methods supported:
  username_password       — Basic username + password
  browser_sso             — Browser OAuth / SSO (externalbrowser)
  browser_sso_cached      — Browser SSO with token caching
  mfa_push                — Password + Duo Push notification
  mfa_totp                — Password + TOTP 6-digit code
  key_pair                — RSA key-pair / JWT (headless)
  oauth_token             — Pre-fetched OAuth access token
  oauth_auth_code         — OAuth 2.0 Authorization Code + PKCE (browser)
  oauth_client_credentials— OAuth 2.0 Client Credentials (machine-to-machine)
  workload_identity       — Azure / AWS / GCP native identity (no secrets)
  toml_profile            — Named profile from ~/.snowflake/connections.toml

APIs used: Snowflake Python connector + INFORMATION_SCHEMA + ACCOUNT_USAGE
"""

from enum import Enum
from typing import Optional, Literal
from pydantic import BaseModel, Field


# ── Auth method enum ──────────────────────────────────────────────────────────

class SnowflakeAuthMethod(str, Enum):
    USERNAME_PASSWORD        = "username_password"
    BROWSER_SSO              = "browser_sso"
    BROWSER_SSO_CACHED       = "browser_sso_cached"
    MFA_PUSH                 = "mfa_push"
    MFA_TOTP                 = "mfa_totp"
    KEY_PAIR                 = "key_pair"
    OAUTH_TOKEN              = "oauth_token"
    OAUTH_AUTH_CODE          = "oauth_auth_code"
    OAUTH_CLIENT_CREDENTIALS = "oauth_client_credentials"
    WORKLOAD_IDENTITY        = "workload_identity"
    TOML_PROFILE             = "toml_profile"


# ── Connection / Auth parameters ──────────────────────────────────────────────

class SnowflakeCredentials(BaseModel):
    auth_method: SnowflakeAuthMethod = Field(
        SnowflakeAuthMethod.BROWSER_SSO,
        description="Authentication method to use",
    )
    account: Optional[str] = Field(None, description="Snowflake account identifier")
    username: Optional[str] = Field(None, description="Snowflake username / login hint")
    role: Optional[str] = Field(None, description="Default role to activate after login")
    warehouse: Optional[str] = Field(None, description="Default warehouse to use")
    database: Optional[str] = Field(None, description="Default database scope")

    # Password-based
    password: Optional[str] = Field(None)
    passcode: Optional[str] = Field(None, description="6-digit TOTP code (mfa_totp only)")

    # Key-pair
    private_key_path: Optional[str] = Field(None)
    private_key_passphrase: Optional[str] = Field(None)

    # OAuth token
    oauth_token: Optional[str] = Field(None)

    # OAuth flows
    oauth_client_id: Optional[str] = Field(None)
    oauth_client_secret: Optional[str] = Field(None)
    oauth_auth_url: Optional[str] = Field(None)
    oauth_token_url: Optional[str] = Field(None)
    oauth_scope: Optional[str] = Field(None)

    # Workload Identity
    workload_identity_provider: Optional[str] = Field("AZURE")

    # TOML profile
    toml_connection_name: Optional[str] = Field("myconnection")


class SnowflakeAuthRequest(BaseModel):
    credentials: SnowflakeCredentials


class SnowflakeAssessmentRequest(BaseModel):
    auth_id: str = Field(..., description="Auth session ID returned by /init-auth")
    label: Optional[str] = Field(None)
    include_query_history: bool = Field(True)
    include_storage_usage: bool = Field(True)
    include_warehouse_metering: bool = Field(True)
    include_login_history: bool = Field(True)
    include_access_history: bool = Field(True)
    include_governance: bool = Field(True)
    include_integrations: bool = Field(True)
    max_databases: int = Field(10, ge=1, le=50)


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
    default_data_retention_days: int = 1


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
    table_type: str
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


# ── Login & Access History ────────────────────────────────────────────────────

class SnowflakeLoginHistory(BaseModel):
    total_logins_30d: int = 0
    failed_logins_30d: int = 0
    unique_users_30d: int = 0
    client_types: dict[str, int] = {}
    failed_reasons: dict[str, int] = {}


class SnowflakeAccessHistory(BaseModel):
    total_access_events_30d: int = 0
    distinct_objects_accessed: int = 0
    top_users_by_access: list[dict] = []


# ── Integrations ──────────────────────────────────────────────────────────────

class SnowflakeIntegrations(BaseModel):
    storage_integrations: list[dict] = []
    notification_integrations: list[dict] = []
    security_integrations: list[dict] = []
    api_integrations: list[dict] = []
    catalog_integrations: list[dict] = []


# ── Governance ────────────────────────────────────────────────────────────────

class SnowflakeGovernance(BaseModel):
    projection_policies: int = 0
    aggregation_policies: int = 0
    authentication_policies: int = 0
    password_policies: int = 0
    session_policies: int = 0
    total_tags: int = 0
    tags: list[dict] = []


# ── Alerts ────────────────────────────────────────────────────────────────────

class SnowflakeAlertsSummary(BaseModel):
    total_alerts: int = 0
    enabled_alerts: int = 0
    alerts: list[dict] = []


# ── Replication ───────────────────────────────────────────────────────────────

class SnowflakeReplication(BaseModel):
    replication_groups: int = 0
    failover_groups: int = 0
    replicated_databases: list[dict] = []


# ── Performance / Cost ────────────────────────────────────────────────────────

class SnowflakeQueryMetrics(BaseModel):
    total_queries_last_7d: int = 0
    failed_queries_last_7d: int = 0
    avg_execution_ms: float = 0.0
    p95_execution_ms: float = 0.0
    bytes_scanned_total: int = 0
    bytes_spilled_local: int = 0
    bytes_spilled_remote: int = 0
    partitions_scanned_pct: float = 0.0
    most_expensive_queries: list[dict] = []
    query_error_types: dict[str, int] = {}
    query_types: dict[str, int] = {}


class SnowflakeStorageMetrics(BaseModel):
    storage_bytes: int = 0
    stage_bytes: int = 0
    failsafe_bytes: int = 0
    total_bytes: int = 0
    trend: list[dict] = []


class SnowflakeCostMetrics(BaseModel):
    credits_used_last_30d: float = 0.0
    compute_credits: float = 0.0
    cloud_services_credits: float = 0.0
    top_warehouses_by_credit: list[dict] = []
    by_service_type: list[dict] = []
    daily_trend: list[dict] = []


class SnowflakeOperationalMetrics(BaseModel):
    auto_clustering_credits: float = 0.0
    auto_clustering_bytes_reclustered: int = 0
    auto_clustering_tables: int = 0
    pipe_credits: float = 0.0
    pipe_files_inserted: int = 0
    pipe_bytes_inserted: int = 0
    task_runs_7d: int = 0
    task_succeeded_7d: int = 0
    task_failed_7d: int = 0
    search_opt_credits: float = 0.0
    mv_refresh_credits: float = 0.0
    data_transfer_bytes: int = 0
    data_transfer_by_cloud: dict[str, int] = {}


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
    login_history: Optional[SnowflakeLoginHistory] = None
    access_history: Optional[SnowflakeAccessHistory] = None
    integrations: Optional[SnowflakeIntegrations] = None
    governance: Optional[SnowflakeGovernance] = None
    alerts: Optional[SnowflakeAlertsSummary] = None
    replication: Optional[SnowflakeReplication] = None
    query_metrics: Optional[SnowflakeQueryMetrics] = None
    storage_metrics: Optional[SnowflakeStorageMetrics] = None
    cost_metrics: Optional[SnowflakeCostMetrics] = None
    operational_metrics: Optional[SnowflakeOperationalMetrics] = None

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
    status: str
    auth_method: Optional[str] = None
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
