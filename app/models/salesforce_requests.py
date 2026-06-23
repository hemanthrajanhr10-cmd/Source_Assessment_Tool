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

    # Object inventory
    custom_object_count:  int   = 0
    standard_object_count: int  = 0
    total_field_count:    int   = 0
    apex_class_count:     int   = 0
    flow_count:           int   = 0
    active_user_count:    int   = 0
    profile_count:        int   = 0
    permission_set_count: int   = 0

    domain_summaries:     List[SalesforceDomainSummary]  = []
    check_results:        List[SalesforceCheckResult]    = []

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
