"""
SAP assessment request and response models.

Connectivity protocols:
  - RFC  : ECC, S/4HANA (base), BW, CRM, SRM, SCM/APO, MDG
  - JDBC : SAP HANA standalone
  - REST : SAP PI/PO
  - OData/OAuth2: SAP SuccessFactors
"""

from typing import Literal, Optional
from pydantic import BaseModel, SecretStr, Field, HttpUrl

SapVariant = Literal[
    "ecc",
    "s4hana",
    "bw",
    "hana",
    "crm",
    "srm",
    "scm",
    "pi_po",
    "mdg",
    "successfactors",
]

RFC_VARIANTS: tuple[str, ...] = ("ecc", "s4hana", "bw", "crm", "srm", "scm", "mdg")


# ── Connection parameter sub-models ──────────────────────────────────────────

class SapRfcParams(BaseModel):
    """RFC connection parameters — used by ECC, S/4HANA, BW, CRM, SRM, SCM, MDG."""
    host: str = Field(..., description="Application server hostname or IP")
    sysnr: str = Field("00", description="2-digit system number (instance number)")
    client: str = Field("100", description="SAP client number (000–999)")
    username: str = Field(..., description="SAP dialog or RFC user")
    password: SecretStr = Field(..., description="SAP user password")


class SapODataParams(BaseModel):
    """Optional OData/REST endpoint for S/4HANA — Fiori apps, business functions."""
    api_base_url: str = Field("", description="OData API base URL (leave empty to skip)")


class SapHanaParams(BaseModel):
    """JDBC parameters for standalone SAP HANA."""
    host: str = Field(..., description="HANA server hostname or IP")
    port: int = Field(30015, description="HANA SQL/MDX port (default: 30015)")
    instance_number: str = Field("00", description="HANA instance number")
    default_schema: str = Field("SYSTEM", alias="schema", description="Default schema to inspect")
    username: str = Field(..., description="HANA database user")
    password: SecretStr = Field(..., description="HANA user password")

    model_config = {"populate_by_name": True}


class SapPiPoParams(BaseModel):
    """REST/HTTP parameters for SAP PI/PO Integration Directory and Monitoring APIs."""
    host: str = Field(..., description="PI/PO server hostname or IP")
    port: int = Field(50000, description="HTTP(S) port (50000 for HTTP, 50001 for HTTPS)")
    username: str = Field(..., description="PI/PO technical user")
    password: SecretStr = Field(..., description="PI/PO user password")
    use_https: bool = Field(True, description="Connect over HTTPS")


class SapSuccessFactorsParams(BaseModel):
    """OData + OAuth2 parameters for SAP SuccessFactors."""
    api_url: str = Field(..., description="SuccessFactors API base URL")
    company_id: str = Field(..., description="Company ID (tenant identifier)")
    client_id: str = Field(..., description="OAuth2 client ID")
    client_secret: SecretStr = Field(..., description="OAuth2 client secret")
    user_id: str = Field(..., description="Technical user ID for API calls")


# ── Top-level assessment request ──────────────────────────────────────────────

class SapAssessmentRequest(BaseModel):
    """Create a SAP system assessment job."""
    variant: SapVariant = Field(..., description="SAP system type to assess")
    label: Optional[str] = Field(None, description="Optional human-readable label")

    # Only one of these is populated, depending on variant
    rfc: Optional[SapRfcParams] = Field(None, description="RFC connection params (ECC, S/4HANA, BW, CRM, SRM, SCM, MDG)")
    odata: Optional[SapODataParams] = Field(None, description="OData extension for S/4HANA (optional)")
    hana: Optional[SapHanaParams] = Field(None, description="JDBC params for SAP HANA standalone")
    pi_po: Optional[SapPiPoParams] = Field(None, description="REST params for SAP PI/PO")
    successfactors: Optional[SapSuccessFactorsParams] = Field(None, description="OData/OAuth2 params for SuccessFactors")

    def effective_host(self) -> str:
        """Return the primary host for connectivity display."""
        if self.rfc:
            return self.rfc.host
        if self.hana:
            return self.hana.host
        if self.pi_po:
            return self.pi_po.host
        if self.successfactors:
            return self.successfactors.api_url
        return "unknown"


# ── Assessment result models ──────────────────────────────────────────────────

class SapSystemInfo(BaseModel):
    system_id: str
    client: str
    basis_release: str
    kernel_version: str
    os_platform: str
    db_layer: str


class SapObjectInventory(BaseModel):
    total_repository_objects: int
    custom_objects: int
    standard_objects: int
    custom_ratio_pct: float
    deprecated_objects: int


class SapDataVolume(BaseModel):
    key_object: str
    row_count: int
    size_mb: float


class SapUserProfile(BaseModel):
    active_users: int
    locked_users: int
    dialog_users: int
    system_users: int
    role_count: int
    profile_count: int


class SapPerformanceIndicators(BaseModel):
    avg_response_ms: float
    active_background_jobs: int
    work_process_utilization_pct: float
    short_dumps_last_24h: int


class SapExtractionReadiness(BaseModel):
    supported_methods: list[str]
    delta_enabled_objects: int
    existing_extractors: int
    odp_available: bool
    slt_configured: bool


# ── Variant-specific result blocks ────────────────────────────────────────────

class SapEccDetails(BaseModel):
    z_table_count: int
    standard_table_count: int
    z_table_ratio_pct: float
    abap_program_count: int
    transport_landscape: list[str]
    module_volumes: dict[str, int]


class SapS4HanaDetails(BaseModel):
    activated_business_functions: int
    fiori_app_count: int
    embedded_hana: bool
    badi_count: int
    enhancement_spot_count: int
    migration_object_count: int


class SapBwDetails(BaseModel):
    info_cube_count: int
    dso_adso_count: int
    info_object_count: int
    composite_provider_count: int
    multi_provider_count: int
    process_chain_count: int
    transformation_count: int
    dtp_count: int
    source_system_connections: int
    query_workbook_count: int
    delta_mechanism_types: list[str]


class SapHanaDetails(BaseModel):
    schema_count: int
    row_store_tables: int
    column_store_tables: int
    calculation_views: int
    analytic_views: int
    attribute_views: int
    stored_procedures: int
    sql_script_objects: int
    replication_status: str
    total_data_volume_gb: float


class SapCrmDetails(BaseModel):
    business_partner_count: int
    ic_profiles: int
    campaign_objects: int
    middleware_queues: int
    custom_objects: int


class SapSrmDetails(BaseModel):
    vendor_master_count: int
    shopping_cart_count: int
    purchase_order_count: int
    catalog_items: int
    workflow_tasks: int
    backend_system_connections: int


class SapScmDetails(BaseModel):
    live_cache_status: str
    planning_area_count: int
    model_version_count: int
    cif_connected_systems: int
    data_object_count: int


class SapPiPoDetails(BaseModel):
    iflow_count: int
    interface_count: int
    adapter_types: list[str]
    avg_daily_messages: int
    error_rate_pct: float
    business_systems: int


class SapMdgDetails(BaseModel):
    governed_entity_types: int
    workflow_rule_count: int
    governance_model: str
    open_change_requests: int
    consolidation_rules: int


class SapSuccessFactorsDetails(BaseModel):
    active_modules: list[str]
    employee_count: int
    mdf_object_count: int
    integration_center_connections: int
    replication_status: str


# ── Top-level assessment result ───────────────────────────────────────────────

class SapAssessmentResult(BaseModel):
    job_id: str
    variant: SapVariant
    label: Optional[str] = None
    assessed_at: str
    status: Literal["completed", "failed"]
    error: Optional[str] = None

    # Common dimensions
    system_info: Optional[SapSystemInfo] = None
    object_inventory: Optional[SapObjectInventory] = None
    data_volumes: Optional[list[SapDataVolume]] = None
    user_profile: Optional[SapUserProfile] = None
    performance: Optional[SapPerformanceIndicators] = None
    extraction_readiness: Optional[SapExtractionReadiness] = None

    # Variant-specific blocks — at most one is populated per result
    ecc: Optional[SapEccDetails] = None
    s4hana: Optional[SapS4HanaDetails] = None
    bw: Optional[SapBwDetails] = None
    hana: Optional[SapHanaDetails] = None
    crm: Optional[SapCrmDetails] = None
    srm: Optional[SapSrmDetails] = None
    scm: Optional[SapScmDetails] = None
    pi_po: Optional[SapPiPoDetails] = None
    mdg: Optional[SapMdgDetails] = None
    successfactors: Optional[SapSuccessFactorsDetails] = None


# ── Job response ──────────────────────────────────────────────────────────────

class SapJobResponse(BaseModel):
    job_id: str
    status: str
    message: str


class SapJobStatusResponse(BaseModel):
    job_id: str
    status: str
    variant: SapVariant
    label: Optional[str] = None
    progress_message: Optional[str] = None
    error: Optional[str] = None
    created_at: str
    completed_at: Optional[str] = None


class SapSessionRecord(BaseModel):
    job_id: str
    variant: SapVariant
    label: Optional[str] = None
    status: str
    created_at: str
    completed_at: Optional[str] = None
    error: Optional[str] = None
    results: Optional[SapAssessmentResult] = None
