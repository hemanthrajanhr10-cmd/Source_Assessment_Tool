"""
Pydantic request / response models for Databricks workspace assessments.
Supports PAT (Personal Access Token) and Azure Managed Identity auth.
Workspace API surface: REST 2.x on the workspace host.
"""

from typing import Any, Literal, Optional
from pydantic import BaseModel, SecretStr


# ── Auth / Connection ──────────────────────────────────────────────────────────

class DatabricksCredentials(BaseModel):
    workspace_url: str          # e.g. https://adb-1234567890123456.7.azuredatabricks.net
    access_token: SecretStr     # PAT or Azure MSI token
    cloud: Optional[Literal["azure", "aws", "gcp"]] = None  # auto-detected if omitted


class DatabricksAssessmentRequest(BaseModel):
    credentials: DatabricksCredentials
    label: Optional[str] = None
    # Scope toggles — all default on
    include_clusters: bool = True
    include_warehouses: bool = True
    include_unity_catalog: bool = True
    include_jobs: bool = True
    include_security: bool = True
    include_integrations: bool = True
    include_mlflow: bool = True
    include_cost_signals: bool = True


# ── Sub-result models ─────────────────────────────────────────────────────────

class DatabricksWorkspaceInfo(BaseModel):
    workspace_id: Optional[str] = None
    workspace_name: Optional[str] = None
    deployment_name: Optional[str] = None
    cloud: Optional[str] = None
    region: Optional[str] = None
    metastore_id: Optional[str] = None
    databricks_runtime_channel: Optional[str] = None


class DatabricksClusterSummary(BaseModel):
    total_clusters: int = 0
    running_clusters: int = 0
    terminated_clusters: int = 0
    all_purpose_clusters: int = 0
    job_clusters: int = 0
    clusters_without_autoterminate: int = 0
    photon_enabled_clusters: int = 0
    legacy_runtime_clusters: int = 0
    policy_compliant_clusters: int = 0
    single_node_clusters: int = 0


class DatabricksCluster(BaseModel):
    cluster_id: str
    cluster_name: Optional[str] = None
    cluster_source: Optional[str] = None   # UI, JOB, API, etc.
    state: Optional[str] = None
    spark_version: Optional[str] = None
    node_type_id: Optional[str] = None
    driver_node_type_id: Optional[str] = None
    autotermination_minutes: Optional[int] = None
    enable_elastic_disk: Optional[bool] = None
    runtime_engine: Optional[str] = None   # STANDARD, PHOTON
    num_workers: Optional[int] = None
    autoscale_min: Optional[int] = None
    autoscale_max: Optional[int] = None
    policy_id: Optional[str] = None
    creator_user_name: Optional[str] = None
    start_time: Optional[str] = None
    terminated_time: Optional[str] = None


class DatabricksWarehouseSummary(BaseModel):
    total_warehouses: int = 0
    running_warehouses: int = 0
    stopped_warehouses: int = 0
    serverless_warehouses: int = 0
    classic_warehouses: int = 0
    warehouses_without_auto_stop: int = 0


class DatabricksWarehouse(BaseModel):
    id: str
    name: Optional[str] = None
    cluster_size: Optional[str] = None
    min_num_clusters: Optional[int] = None
    max_num_clusters: Optional[int] = None
    auto_stop_mins: Optional[int] = None
    state: Optional[str] = None
    warehouse_type: Optional[str] = None   # CLASSIC, PRO, SERVERLESS
    enable_photon: Optional[bool] = None
    channel_name: Optional[str] = None
    creator_name: Optional[str] = None
    num_active_sessions: Optional[int] = None


class DatabricksUnityCatalogSummary(BaseModel):
    metastore_name: Optional[str] = None
    metastore_id: Optional[str] = None
    storage_root: Optional[str] = None
    catalog_count: int = 0
    schema_count: int = 0
    table_count: int = 0
    view_count: int = 0
    external_location_count: int = 0
    storage_credential_count: int = 0
    volume_count: int = 0
    delta_sharing_enabled: bool = False
    data_sharing_recipient_count: int = 0


class DatabricksCatalog(BaseModel):
    name: str
    catalog_type: Optional[str] = None
    comment: Optional[str] = None
    owner: Optional[str] = None
    metastore_id: Optional[str] = None
    storage_location: Optional[str] = None
    schema_count: int = 0
    table_count: int = 0
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class DatabricksJobSummary(BaseModel):
    total_jobs: int = 0
    continuous_jobs: int = 0
    scheduled_jobs: int = 0
    multi_task_jobs: int = 0
    jobs_with_failures_last_7d: int = 0
    jobs_using_all_purpose_compute: int = 0
    dlt_pipelines: int = 0


class DatabricksJob(BaseModel):
    job_id: int
    name: Optional[str] = None
    creator_user_name: Optional[str] = None
    run_as_user_name: Optional[str] = None
    schedule: Optional[str] = None
    job_cluster_count: int = 0
    task_count: int = 0
    uses_all_purpose_compute: bool = False
    last_run_status: Optional[str] = None
    last_run_duration_ms: Optional[int] = None
    created_time: Optional[str] = None


class DatabricksSecuritySummary(BaseModel):
    total_users: int = 0
    active_users: int = 0
    admin_users: int = 0
    service_principal_count: int = 0
    group_count: int = 0
    workspace_admins: int = 0
    ip_access_list_count: int = 0
    secrets_scope_count: int = 0
    pat_count: int = 0
    token_lifetime_configured: bool = False
    unity_catalog_enabled: bool = False
    audit_log_configured: bool = False


class DatabricksUser(BaseModel):
    id: Optional[str] = None
    user_name: Optional[str] = None
    display_name: Optional[str] = None
    active: Optional[bool] = None
    is_admin: bool = False


class DatabricksIntegrationSummary(BaseModel):
    external_location_count: int = 0
    storage_credential_count: int = 0
    git_credential_count: int = 0
    secret_scope_count: int = 0
    network_policy_count: int = 0
    dbfs_mount_count: int = 0
    delta_sharing_enabled: bool = False
    lakehouse_monitor_count: int = 0


class DatabricksMLflowSummary(BaseModel):
    experiment_count: int = 0
    registered_model_count: int = 0
    model_serving_endpoint_count: int = 0
    running_endpoints: int = 0
    vector_search_index_count: int = 0
    dlt_pipeline_count: int = 0


class DatabricksCheckResult(BaseModel):
    domain: str
    check: str
    status: Literal["pass", "warn", "fail", "info", "n/a"]
    risk: Literal["critical", "high", "medium", "low", "none"]
    count: Optional[int] = None
    value: Optional[Any] = None
    details: Optional[str] = None
    recommendation: Optional[str] = None


class DatabricksAssessmentResult(BaseModel):
    job_id: str
    label: Optional[str] = None
    workspace_url: Optional[str] = None
    workspace_info: Optional[DatabricksWorkspaceInfo] = None
    cluster_summary: Optional[DatabricksClusterSummary] = None
    warehouse_summary: Optional[DatabricksWarehouseSummary] = None
    unity_catalog: Optional[DatabricksUnityCatalogSummary] = None
    job_summary: Optional[DatabricksJobSummary] = None
    security_summary: Optional[DatabricksSecuritySummary] = None
    integration_summary: Optional[DatabricksIntegrationSummary] = None
    mlflow_summary: Optional[DatabricksMLflowSummary] = None
    # Detailed lists (for Excel / tabs)
    clusters: list[DatabricksCluster] = []
    warehouses: list[DatabricksWarehouse] = []
    catalogs: list[DatabricksCatalog] = []
    jobs: list[DatabricksJob] = []
    users: list[DatabricksUser] = []
    # Checks
    checks: list[DatabricksCheckResult] = []
    total_checks: int = 0
    passed_checks: int = 0
    warnings: int = 0
    critical_findings: int = 0
    high_findings: int = 0
    overall_score: Optional[float] = None
    assessment_timestamp: str = ""
    duration_seconds: Optional[float] = None
    error: Optional[str] = None


class DatabricksJobResponse(BaseModel):
    job_id: str
    status: str
    message: str


class DatabricksJobStatusResponse(BaseModel):
    job_id: str
    status: str
    label: Optional[str] = None
    progress_message: Optional[str] = None
    error: Optional[str] = None
    created_at: str
    completed_at: Optional[str] = None
    workspace_url: Optional[str] = None
