"""
Pydantic models for Salesforce assessment requests and responses.

Supports multiple Salesforce API surfaces:
  REST API, Metadata API, Tooling API, Bulk API v2, Connect API (Analytics),
  SOQL/SOSL queries, Apex REST, Streaming/Platform Events.
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


# ── Auth methods ──────────────────────────────────────────────────────────────

class SalesforceAuthMethod(str, Enum):
    USERNAME_PASSWORD    = "username_password"
    OAUTH_CLIENT_CREDS  = "oauth_client_credentials"
    CONNECTED_APP_TOKEN = "connected_app_token"   # session ID / access_token


# ── API surfaces the user can choose to assess ────────────────────────────────

class SalesforceApiScope(str, Enum):
    REST_API        = "rest_api"        # sObjects, SOQL, Named Credentials
    METADATA_API    = "metadata_api"    # Custom objects, fields, layouts, flows
    TOOLING_API     = "tooling_api"     # Apex code, test coverage, debug logs
    BULK_API        = "bulk_api"        # Bulk jobs, data volumes
    ANALYTICS_API   = "analytics_api"  # Reports, dashboards (Connect API)
    SECURITY        = "security"        # Users, profiles, permission sets, roles
    AUTOMATION      = "automation"      # Flows, Process Builder, Workflow rules
    INTEGRATION     = "integration"     # Named creds, connected apps, platform events


# ── Credentials ───────────────────────────────────────────────────────────────

class SalesforceCredentials(BaseModel):
    auth_method:    SalesforceAuthMethod = SalesforceAuthMethod.USERNAME_PASSWORD
    api_version:    str = "59.0"

    # For username_password: "login" (production) | "test" (sandbox) | custom domain name
    # The real instance URL is discovered automatically from the OAuth response.
    domain:         Optional[str] = "login"

    # Required for oauth_client_credentials and connected_app_token (where we can't auto-discover)
    instance_url:   Optional[str] = None

    # Username + Password + Security Token
    username:       Optional[str] = None
    password:       Optional[str] = None
    security_token: Optional[str] = None  # appended to password for IP-restricted orgs

    # OAuth Client Credentials
    client_id:      Optional[str] = None
    client_secret:  Optional[str] = None

    # Pre-issued access token / session ID
    access_token:   Optional[str] = None


# ── Assessment request ────────────────────────────────────────────────────────

class SalesforceAssessmentRequest(BaseModel):
    credentials:         SalesforceCredentials
    label:               Optional[str] = None
    api_scopes:          List[SalesforceApiScope] = Field(
        default_factory=lambda: list(SalesforceApiScope)
    )

    # Fine-grained domain toggles
    include_objects:        bool = True
    include_fields:         bool = True
    include_relationships:  bool = True
    include_validation:     bool = True
    include_apex:           bool = True
    include_flows:          bool = True
    include_security:       bool = True
    include_bulk:           bool = True
    include_analytics:      bool = True
    include_integrations:   bool = True

    max_objects: int = Field(default=500, ge=1, le=5000)


# ── Per-check result ──────────────────────────────────────────────────────────

class SalesforceCheckResult(BaseModel):
    check_id:       str
    name:           str
    domain:         str
    api_surface:    str                                                    # which SF API surface
    risk:           Literal["critical", "high", "medium", "low"]
    status:         Literal["passed", "warning", "critical", "info", "error", "skipped"]
    count:          Optional[int]  = None
    value:          Optional[Any]  = None
    details:        Optional[str]  = None
    recommendation: Optional[str]  = None


# ── Domain-level rollup ───────────────────────────────────────────────────────

class SalesforceDomainSummary(BaseModel):
    domain:       str
    api_surface:  str
    total_checks: int
    critical:     int
    high:         int
    medium:       int
    low:          int
    passed:       int
    errors:       int
    score:        float


# ── Full assessment result ────────────────────────────────────────────────────

class SalesforceAssessmentResult(BaseModel):
    job_id:               str
    status:               Literal["completed", "failed"]
    instance_url:         str
    org_name:             Optional[str]  = None
    org_id:               Optional[str]  = None
    org_type:             Optional[str]  = None   # Production, Sandbox, Developer
    sf_version:           Optional[str]  = None

    total_checks:         int   = 0
    critical_findings:    int   = 0
    high_findings:        int   = 0
    medium_findings:      int   = 0
    low_findings:         int   = 0
    overall_score:        float = 0.0

    # ── Core sObject inventory ────────────────────────────────────────────────
    custom_object_count:   int  = 0
    standard_object_count: int  = 0
    total_field_count:     int  = 0
    validation_rule_count: int  = 0
    record_type_count:     int  = 0
    page_layout_count:     int  = 0
    custom_metadata_type_count: int = 0
    custom_setting_count:  int  = 0
    external_object_count: int  = 0
    cdc_event_count:       int  = 0

    # ── Apex ──────────────────────────────────────────────────────────────────
    apex_class_count:      int  = 0
    trigger_count:         int  = 0
    total_apex_lines:      int  = 0

    # ── Automation ────────────────────────────────────────────────────────────
    flow_count:            int  = 0
    active_flow_count:     int  = 0
    workflow_rule_count:   int  = 0
    duplicate_rule_count:  int  = 0
    assignment_rule_count: int  = 0

    # ── Security ──────────────────────────────────────────────────────────────
    active_user_count:     int  = 0
    inactive_user_count:   int  = 0
    profile_count:         int  = 0
    permission_set_count:  int  = 0
    role_count:            int  = 0
    admin_user_count:      int  = 0

    # ── Bulk & Analytics ──────────────────────────────────────────────────────
    bulk_job_count:        int  = 0
    report_count:          int  = 0
    dashboard_count:       int  = 0

    # ── Integrations ──────────────────────────────────────────────────────────
    connected_app_count:   int  = 0
    named_credential_count: int = 0
    platform_event_count:  int  = 0
    installed_package_count: int = 0

    # ── Operations ────────────────────────────────────────────────────────────
    scheduled_job_count:   int  = 0
    queue_count:           int  = 0
    email_service_count:   int  = 0

    # ── Licenses & Limits ─────────────────────────────────────────────────────
    user_license_count:    int  = 0
    api_usage_pct:         float = 0.0
    data_storage_mb:       int  = 0
    file_storage_mb:       int  = 0

    # ── UI Components ─────────────────────────────────────────────────────────
    vf_page_count:             int  = 0
    vf_component_count:        int  = 0
    aura_component_count:      int  = 0
    lwc_bundle_count:          int  = 0
    static_resource_count:     int  = 0
    email_template_count:      int  = 0
    lightning_page_count:      int  = 0
    custom_label_count:        int  = 0

    # ── Field Schema Analysis ─────────────────────────────────────────────────
    formula_field_count:       int  = 0
    encrypted_field_count:     int  = 0
    external_id_field_count:   int  = 0
    rollup_summary_field_count: int = 0
    lookup_field_count:        int  = 0
    picklist_field_count:      int  = 0
    multi_picklist_field_count: int = 0
    history_enabled_obj_count: int  = 0
    feed_enabled_obj_count:    int  = 0

    # ── Security Deep Dive ────────────────────────────────────────────────────
    permission_set_group_count: int = 0
    auth_provider_count:       int  = 0
    mfa_user_count:            int  = 0
    public_group_count:        int  = 0
    custom_permission_count:   int  = 0
    trusted_ip_range_count:    int  = 0
    remote_site_count:         int  = 0

    # ── Automation Deep Dive ──────────────────────────────────────────────────
    approval_process_count:    int  = 0
    email_alert_count:         int  = 0
    workflow_field_update_count: int = 0
    outbound_message_count:    int  = 0
    escalation_rule_count:     int  = 0

    # ── Integration Extended ──────────────────────────────────────────────────
    external_service_count:    int  = 0
    push_topic_count:          int  = 0
    streaming_channel_count:   int  = 0

    # ── Reporting Extended ────────────────────────────────────────────────────
    report_folder_count:       int  = 0
    dashboard_folder_count:    int  = 0
    dashboard_component_count: int  = 0

    # ── Operations & Monitoring ────────────────────────────────────────────────
    apex_log_count:            int   = 0
    apex_log_size_mb:          float = 0.0
    flow_interview_error_count: int  = 0
    event_log_file_count:      int   = 0

    # ── Experience Cloud & Collaboration ──────────────────────────────────────
    experience_site_count:     int  = 0
    chatter_group_count:       int  = 0
    content_document_count:    int  = 0
    knowledge_article_count:   int  = 0

    # ── Business Objects ──────────────────────────────────────────────────────
    price_book_count:          int  = 0
    active_product_count:      int  = 0
    opportunity_stage_count:   int  = 0
    case_status_count:         int  = 0
    territory_model_count:     int  = 0

    # ── Inventory lists (capped for Excel export) ─────────────────────────────
    apex_inventory:              List[Dict] = Field(default_factory=list)
    flow_inventory:              List[Dict] = Field(default_factory=list)
    user_inventory:              List[Dict] = Field(default_factory=list)
    package_inventory:           List[Dict] = Field(default_factory=list)
    user_license_inventory:      List[Dict] = Field(default_factory=list)
    scheduled_job_inventory:     List[Dict] = Field(default_factory=list)
    vf_page_inventory:           List[Dict] = Field(default_factory=list)
    lwc_inventory:               List[Dict] = Field(default_factory=list)
    approval_process_inventory:  List[Dict] = Field(default_factory=list)
    experience_site_inventory:   List[Dict] = Field(default_factory=list)
    product_inventory:           List[Dict] = Field(default_factory=list)

    domain_summaries:        List[SalesforceDomainSummary]  = []
    check_results:           List[SalesforceCheckResult]    = []

    errors:               List[str]      = []
    completed_at:         Optional[str]  = None
    duration_seconds:     Optional[float] = None


# ── Job / session response models ─────────────────────────────────────────────

class SalesforceJobResponse(BaseModel):
    job_id:  str
    status:  str
    message: str


class SalesforceJobStatusResponse(BaseModel):
    job_id:           str
    status:           str
    label:            Optional[str]  = None
    progress_message: Optional[str]  = None
    error:            Optional[str]  = None
    created_at:       str
    completed_at:     Optional[str]  = None
    checks_completed: int  = 0
    total_checks:     int  = 0


class SalesforceSessionRecord(BaseModel):
    job_id:            str
    status:            str
    label:             Optional[str]   = None
    instance_url:      str
    org_name:          Optional[str]   = None
    org_type:          Optional[str]   = None
    total_checks:      int             = 0
    critical_findings: int             = 0
    high_findings:     int             = 0
    overall_score:     float           = 0.0
    created_at:        str
    completed_at:      Optional[str]   = None
    duration_seconds:  Optional[float] = None
