"""
Infor CloudSuite assessment request and response models.

Connectivity:
  - All editions authenticate via Infor ION API (OAuth 2.0 client credentials)
  - Engine determines the real data model and API surface:
      m3  → MRS001 / MRS002 / MRS003 + MDBREADMI
      ln  → BOD catalog + VRC customizations + ION integration bus
      csi → SyteLine schema (SaaS on AWS, no Hybrid Connection needed)

Edition → Engine mapping is maintained in EDITION_ENGINE_MAP (not hardcoded inline)
so the 60+ micro-verticals can be updated without touching pipeline logic.
"""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field, SecretStr

# ── Engine type ───────────────────────────────────────────────────────────────

InforEngine = Literal["m3", "ln", "csi"]

# ── Edition → Engine mapping ──────────────────────────────────────────────────
# Key  = edition slug (lower-case, underscored) that a customer or admin would
#        specify when setting up the assessment.
# Value = the underlying engine that handles that edition's data model.
# Infor CloudSuite is a *vertical packaging label*, not a data model; the engine
# (M3, LN, or CSI/SyteLine) is what determines real API surface.

EDITION_ENGINE_MAP: dict[str, InforEngine] = {
    # ── M3 editions ──────────────────────────────────────────────────────────
    "cloudsuite_fashion":                       "m3",
    "cloudsuite_food_beverage":                 "m3",
    "cloudsuite_food_and_beverage":             "m3",
    "cloudsuite_distribution":                  "m3",
    "cloudsuite_distribution_sem":              "m3",
    "cloudsuite_retail":                        "m3",
    "cloudsuite_rental":                        "m3",
    "cloudsuite_equipment":                     "m3",
    "m3":                                       "m3",
    "movex":                                    "m3",
    # ── LN editions ──────────────────────────────────────────────────────────
    "cloudsuite_automotive":                    "ln",
    "cloudsuite_aerospace":                     "ln",
    "cloudsuite_aerospace_defense":             "ln",
    "cloudsuite_industrial_enterprise":         "ln",
    "cloudsuite_defense":                       "ln",
    "ln":                                       "ln",
    "baan":                                     "ln",
    # ── CSI / SyteLine editions ───────────────────────────────────────────────
    "cloudsuite_industrial":                    "csi",
    "cloudsuite_industrial_csi":                "csi",
    "syteline":                                 "csi",
    "csi":                                      "csi",
    "cloudsuite_industrial_enterprise_csi":     "csi",
}

INFOR_ENGINE_LABELS: dict[InforEngine, str] = {
    "m3":  "Infor M3 (MRS / MDBREADMI)",
    "ln":  "Infor LN (BOD / VRC)",
    "csi": "Infor CSI / SyteLine",
}


# ── ION API credentials ───────────────────────────────────────────────────────

class InforIonCredentials(BaseModel):
    """OAuth 2.0 client-credentials for Infor ION API Gateway."""
    tenant_id: str = Field(..., description="Infor ION tenant ID (e.g. ACME_TST)")
    ion_api_url: str = Field(..., description="ION API Gateway base URL (e.g. https://mingle-ionapi.inforcloudsuite.com)")
    client_id: str = Field(..., description="OAuth2 client_id from ION API authorisation app")
    client_secret: SecretStr = Field(..., description="OAuth2 client_secret from ION API authorisation app")
    username: Optional[str] = Field(None, description="Service account username (resource-owner flow if ION requires it)")
    password: Optional[SecretStr] = Field(None, description="Service account password")
    use_hcm: bool = Field(False, description="Route calls via Azure Relay Hybrid Connection (on-prem M3 / LN)")
    hcm_local_host: Optional[str] = Field(None, description="Local HCM listener host (when use_hcm=True)")
    hcm_local_port: Optional[int] = Field(None, description="Local HCM listener port (when use_hcm=True)")


# ── Top-level assessment request ──────────────────────────────────────────────

class InforAssessmentRequest(BaseModel):
    """Create an Infor CloudSuite assessment job."""
    engine: Optional[InforEngine] = Field(
        None,
        description=(
            "Underlying engine (m3 / ln / csi). "
            "If omitted, the connector auto-detects via ION tenant catalog. "
            "Must be set explicitly when auto-detect cannot determine the engine."
        ),
    )
    edition: Optional[str] = Field(
        None,
        description="CloudSuite edition label (e.g. 'cloudsuite_fashion'). "
                    "Used for auto-detection when engine is not supplied.",
    )
    label: Optional[str] = Field(None, description="Human-readable label for this assessment")
    credentials: InforIonCredentials


# ── Per-check result ──────────────────────────────────────────────────────────

class InforCheckResult(BaseModel):
    domain: str
    check: str
    status: Literal["pass", "warn", "fail", "info", "n/a"] = "info"
    risk: Literal["critical", "high", "medium", "low", "none"] = "none"
    count: Optional[int] = None
    details: Optional[str] = None
    recommendation: Optional[str] = None


# ── Engine-info block (detected/confirmed) ────────────────────────────────────

class InforEngineInfo(BaseModel):
    engine: InforEngine
    edition: Optional[str] = None
    version: Optional[str] = None
    tenant_id: str = ""
    deployment: Literal["cloud", "on_prem", "hybrid"] = "cloud"
    ion_api_version: Optional[str] = None
    detection_method: Literal["explicit", "edition_map", "auto_probe"] = "explicit"


# ── M3-specific result blocks ─────────────────────────────────────────────────

class InforM3ApiRepository(BaseModel):
    program_count: int = 0
    table_count: int = 0
    field_count: int = 0
    custom_program_count: int = 0
    custom_table_count: int = 0
    mrs001_accessible: bool = False
    mrs002_accessible: bool = False
    mrs003_accessible: bool = False
    mdbreadmi_accessible: bool = False
    api_completeness_pct: float = 0.0


class InforM3CustomizationFootprint(BaseModel):
    custom_program_count: int = 0
    custom_table_count: int = 0
    custom_field_count: int = 0
    modification_count: int = 0
    third_party_addon_count: int = 0


class InforM3MultiSite(BaseModel):
    company_count: int = 0
    division_count: int = 0
    facility_count: int = 0
    warehouse_count: int = 0
    multi_currency: bool = False
    multi_language: bool = False


# ── LN-specific result blocks ─────────────────────────────────────────────────

class InforLnBodCatalog(BaseModel):
    total_bods: int = 0
    bod_verb_counts: Dict[str, int] = Field(default_factory=dict)
    ion_integration_count: int = 0
    connection_point_count: int = 0
    data_flow_count: int = 0


class InforLnVrc(BaseModel):
    vrc_package_count: int = 0
    custom_component_count: int = 0
    customization_layers: int = 0
    vrc_packages: List[str] = Field(default_factory=list)


class InforLnMultiSite(BaseModel):
    company_count: int = 0
    financial_company_count: int = 0
    logistical_company_count: int = 0
    warehouse_count: int = 0
    multi_currency: bool = False
    multi_language: bool = False


class InforLnPackages(BaseModel):
    installed_packages: List[str] = Field(default_factory=list)
    module_count: int = 0
    active_module_count: int = 0


# ── CSI / SyteLine-specific result blocks ────────────────────────────────────

class InforCsiSchema(BaseModel):
    table_count: int = 0
    custom_table_count: int = 0
    view_count: int = 0
    stored_procedure_count: int = 0
    trigger_count: int = 0
    site_count: int = 0
    user_defined_field_count: int = 0
    event_handler_count: int = 0
    custom_form_count: int = 0


class InforCsiDataVolumes(BaseModel):
    top_tables: List[Dict[str, Any]] = Field(default_factory=list)
    estimated_total_rows: int = 0
    estimated_gb: float = 0.0


# ── Platform checks (all engines) ─────────────────────────────────────────────

class InforOsPlatformHealth(BaseModel):
    ion_api_accessible: bool = False
    mingle_accessible: bool = False
    data_fabric_catalog_present: bool = False
    birst_active: bool = False
    coleman_ai_active: bool = False
    ion_message_volume_daily: Optional[int] = None
    mfa_enabled: bool = False
    grc_configured: bool = False
    ion_api_version: Optional[str] = None
    mingle_tenant_count: int = 0
    ion_connection_point_count: int = 0


class InforUserProfile(BaseModel):
    total_users: int = 0
    active_users: int = 0
    role_count: int = 0
    mfa_enabled_users: int = 0
    security_role_count: int = 0
    admin_user_count: int = 0


class InforIntegrationFootprint(BaseModel):
    ion_api_endpoint_count: int = 0
    active_connection_points: int = 0
    external_system_count: int = 0
    middleware_types: List[str] = Field(default_factory=list)
    webhook_count: int = 0


# ── Top-level result ──────────────────────────────────────────────────────────

class InforAssessmentResult(BaseModel):
    job_id: str
    engine: InforEngine
    engine_info: Optional[InforEngineInfo] = None
    label: Optional[str] = None

    # M3 blocks (populated when engine == "m3")
    m3_api_repository: Optional[InforM3ApiRepository] = None
    m3_customization: Optional[InforM3CustomizationFootprint] = None
    m3_multi_site: Optional[InforM3MultiSite] = None

    # LN blocks (populated when engine == "ln")
    ln_bod_catalog: Optional[InforLnBodCatalog] = None
    ln_vrc: Optional[InforLnVrc] = None
    ln_multi_site: Optional[InforLnMultiSite] = None
    ln_packages: Optional[InforLnPackages] = None

    # CSI blocks (populated when engine == "csi")
    csi_schema: Optional[InforCsiSchema] = None
    csi_data_volumes: Optional[InforCsiDataVolumes] = None

    # Platform (all engines)
    platform_health: Optional[InforOsPlatformHealth] = None
    user_profile: Optional[InforUserProfile] = None
    integration_footprint: Optional[InforIntegrationFootprint] = None

    # All checks, flat list
    checks: List[InforCheckResult] = Field(default_factory=list)

    # Aggregates
    total_checks: int = 0
    passed_checks: int = 0
    warnings: int = 0
    critical_findings: int = 0
    high_findings: int = 0
    overall_score: Optional[float] = None

    assessment_timestamp: str = ""
    duration_seconds: Optional[float] = None
    error: Optional[str] = None


# ── Job response / status models ──────────────────────────────────────────────

class InforJobResponse(BaseModel):
    job_id: str
    status: str = "pending"
    message: str = ""


class InforJobStatusResponse(BaseModel):
    job_id: str
    status: str
    engine: Optional[InforEngine] = None
    label: Optional[str] = None
    progress_message: Optional[str] = None
    error: Optional[str] = None
    created_at: str
    completed_at: Optional[str] = None


class InforSessionRecord(BaseModel):
    job_id: str
    engine: Optional[InforEngine] = None
    label: Optional[str] = None
    tenant_id: Optional[str] = None
    status: str
    created_at: str
    completed_at: Optional[str] = None
    error: Optional[str] = None
    results: Optional[InforAssessmentResult] = None
