"""
Pydantic models for Dataverse assessment requests and responses.
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class DataverseAuthMethod(str, Enum):
    CLIENT_CREDENTIALS = "client_credentials"
    USERNAME_PASSWORD  = "username_password"


class DataverseCredentials(BaseModel):
    auth_method:    DataverseAuthMethod = DataverseAuthMethod.CLIENT_CREDENTIALS
    environment_url: str                 # e.g. https://org.crm.dynamics.com
    tenant_id:      Optional[str] = None
    client_id:      Optional[str] = None
    client_secret:  Optional[str] = None
    username:       Optional[str] = None
    password:       Optional[str] = None


class DataverseAssessmentRequest(BaseModel):
    credentials:         DataverseCredentials
    label:               Optional[str] = None
    include_data_volume: bool = True
    include_data_quality: bool = True
    include_security:    bool = True
    include_flows:       bool = True
    include_plugins:     bool = True
    include_ui:          bool = True
    include_audit:       bool = True
    include_ai:          bool = True
    max_entities:        int = Field(default=500, ge=1, le=2000)


# ── Per-check result ──────────────────────────────────────────────────────────

class DataverseCheckResult(BaseModel):
    check_id:       str
    name:           str
    domain:         str
    risk:           Literal["critical", "high", "medium", "low"]
    status:         Literal["passed", "warning", "critical", "info", "error", "skipped"]
    count:          Optional[int]  = None
    value:          Optional[Any]  = None
    details:        Optional[str]  = None
    recommendation: Optional[str]  = None


# ── Domain-level rollup ───────────────────────────────────────────────────────

class DataverseDomainSummary(BaseModel):
    domain:       str
    total_checks: int
    critical:     int
    high:         int
    medium:       int
    low:          int
    passed:       int
    errors:       int
    score:        float   # 0–100


# ── Full assessment result ────────────────────────────────────────────────────

class DataverseAssessmentResult(BaseModel):
    job_id:               str
    status:               Literal["completed", "failed"]
    environment_url:      str
    organization_name:    Optional[str]  = None
    organization_version: Optional[str]  = None

    total_checks:      int   = 0
    critical_findings: int   = 0
    high_findings:     int   = 0
    medium_findings:   int   = 0
    low_findings:      int   = 0
    overall_score:     float = 0.0

    domain_summaries: List[DataverseDomainSummary]  = []
    check_results:    List[DataverseCheckResult]    = []

    errors:            List[str]     = []
    completed_at:      Optional[str] = None
    duration_seconds:  Optional[float] = None


# ── Job / session response models ─────────────────────────────────────────────

class DataverseJobResponse(BaseModel):
    job_id:  str
    status:  str
    message: str


class DataverseJobStatusResponse(BaseModel):
    job_id:           str
    status:           str
    label:            Optional[str] = None
    progress_message: Optional[str] = None
    error:            Optional[str] = None
    created_at:       str
    completed_at:     Optional[str] = None
    checks_completed: int   = 0
    total_checks:     int   = 0


class DataverseSessionRecord(BaseModel):
    job_id:            str
    status:            str
    label:             Optional[str]   = None
    environment_url:   str
    organization_name: Optional[str]   = None
    total_checks:      int             = 0
    critical_findings: int             = 0
    high_findings:     int             = 0
    overall_score:     float           = 0.0
    created_at:        str
    completed_at:      Optional[str]   = None
    duration_seconds:  Optional[float] = None
