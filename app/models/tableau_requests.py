"""
Tableau assessment request and response models.

Connectivity: Tableau REST API over HTTPS (tableauserverclient library)
  - Tableau Server: https://<server>/api/<version>/
  - Tableau Cloud:  https://online.tableau.com/api/<version>/
  - Auth: Personal Access Token (PAT) or Username/Password
"""

from typing import Literal, Optional
from pydantic import BaseModel, SecretStr, Field


# ── Connection parameters ─────────────────────────────────────────────────────

class TableauCredentials(BaseModel):
    """Credentials for Tableau REST API."""
    server_url: str = Field(..., description="Tableau Server URL, e.g. https://tableau.acme.com")
    site_name: Optional[str] = Field(None, description="Site name (leave blank for Default site)")
    # Username/Password auth
    username: Optional[str] = Field(None, description="Tableau username (for password auth)")
    password: Optional[SecretStr] = Field(None, description="Tableau password (for password auth)")
    # Personal Access Token auth
    token_name: Optional[str] = Field(None, description="PAT name (for token auth)")
    token_secret: Optional[SecretStr] = Field(None, description="PAT secret (for token auth)")


class TableauAssessmentRequest(BaseModel):
    """Create a Tableau assessment job."""
    credentials: TableauCredentials
    label: Optional[str] = Field(None, description="Human-readable label for this assessment")
    include_permissions: bool = Field(True, description="Enumerate workbook and data source permissions")
    include_extract_health: bool = Field(True, description="Check extract refresh schedules and job history")
    include_flows: bool = Field(True, description="Enumerate Tableau Prep flows")


# ── Assessment result models ──────────────────────────────────────────────────

class TableauServerInfo(BaseModel):
    server_url: str
    site_name: str
    server_version: str
    site_id: str
    content_url: str


class TableauWorkbook(BaseModel):
    id: str
    name: str
    project_name: str
    owner_name: str
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    view_count: int = 0
    size_mb: float = 0.0
    show_tabs: bool = False
    tag_count: int = 0


class TableauView(BaseModel):
    id: str
    name: str
    workbook_name: str
    owner_name: str
    view_type: str = "sheet"
    total_views: int = 0


class TableauDatasource(BaseModel):
    id: str
    name: str
    project_name: str
    owner_name: str
    datasource_type: str
    content_url: str
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    is_certified: bool = False
    is_published: bool = True
    size_mb: float = 0.0
    connection_type: str = "unknown"
    has_extracts: bool = False
    tag_count: int = 0


class TableauUserProfile(BaseModel):
    total_users: int
    active_users: int
    admin_users: int
    site_admin_users: int
    creator_users: int
    explorer_users: int
    viewer_users: int
    unlicensed_users: int


class TableauGroup(BaseModel):
    id: str
    name: str
    domain_name: Optional[str] = None
    member_count: int = 0


class TableauProject(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    content_permissions: str = "ManagedByOwner"
    workbook_count: int = 0
    datasource_count: int = 0


class TableauFlow(BaseModel):
    id: str
    name: str
    project_name: str
    owner_name: str
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class TableauExtractJob(BaseModel):
    id: str
    type: str
    status: str
    priority: int = 0
    workbook_name: Optional[str] = None
    datasource_name: Optional[str] = None
    created_at: Optional[str] = None
    completed_at: Optional[str] = None


class TableauExtractHealth(BaseModel):
    total_schedules: int
    active_schedules: int
    suspended_schedules: int
    total_refresh_jobs: int
    successful_jobs: int
    failed_jobs: int
    cancelled_jobs: int
    stale_datasources: int


class TableauPermissionEntry(BaseModel):
    workbook_or_datasource_name: str
    grantee_name: str
    grantee_type: str
    capability_name: str
    capability_mode: str


class TableauDataQualityFlags(BaseModel):
    workbooks_with_no_views: int
    datasources_with_no_workbooks: int
    users_with_no_activity: int
    failed_extract_jobs: int
    stale_extracts_over_7_days: int
    uncertified_published_datasources: int


class TableauWorkbookSummary(BaseModel):
    total_workbooks: int
    total_views: int
    total_sheets: int
    total_dashboards: int
    workbooks_with_extracts: int
    avg_views_per_workbook: float = 0.0


class TableauDatasourceSummary(BaseModel):
    total_datasources: int
    published_datasources: int
    embedded_datasources: int
    certified_datasources: int
    extract_datasources: int
    live_datasources: int
    connection_types: list[str]


# ── Top-level assessment result ───────────────────────────────────────────────

class TableauAssessmentResult(BaseModel):
    job_id: str
    label: Optional[str] = None
    assessed_at: str
    status: Literal["completed", "failed"]
    error: Optional[str] = None

    server_info: Optional[TableauServerInfo] = None
    workbook_summary: Optional[TableauWorkbookSummary] = None
    datasource_summary: Optional[TableauDatasourceSummary] = None
    user_profile: Optional[TableauUserProfile] = None
    extract_health: Optional[TableauExtractHealth] = None
    data_quality: Optional[TableauDataQualityFlags] = None

    # Lists (capped for payload size)
    projects: Optional[list[TableauProject]] = None
    workbooks: Optional[list[TableauWorkbook]] = None
    datasources: Optional[list[TableauDatasource]] = None
    views: Optional[list[TableauView]] = None
    users_list: Optional[list[dict]] = None
    groups: Optional[list[TableauGroup]] = None
    flows: Optional[list[TableauFlow]] = None
    extract_jobs: Optional[list[TableauExtractJob]] = None
    permissions: Optional[list[TableauPermissionEntry]] = None


# ── Job response models ───────────────────────────────────────────────────────

class TableauJobResponse(BaseModel):
    job_id: str
    status: str
    message: str


class TableauJobStatusResponse(BaseModel):
    job_id: str
    status: str
    label: Optional[str] = None
    progress_message: Optional[str] = None
    error: Optional[str] = None
    created_at: str
    completed_at: Optional[str] = None


class TableauSessionRecord(BaseModel):
    job_id: str
    label: Optional[str] = None
    status: str
    server_url: Optional[str] = None
    created_at: str
    completed_at: Optional[str] = None
    error: Optional[str] = None
    results: Optional[TableauAssessmentResult] = None
