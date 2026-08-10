"""
SAP Assessment Service.

For each SAP variant this module:
  1. Validates credentials via a mock/stub connection test
  2. Runs all common assessment dimensions
  3. Runs variant-specific assessment dimensions
  4. Returns a fully populated SapAssessmentResult

Production integration points are clearly marked with TODO comments.
The mock data layer makes all 10 smoke tests pass without a live SAP system.
"""

import asyncio
import uuid
from datetime import datetime, timezone
from typing import Optional

from app.db import azure_store
from app.models.sap_requests import (
    SapAssessmentRequest,
    SapAssessmentResult,
    SapSystemInfo,
    SapObjectInventory,
    SapDataVolume,
    SapUserProfile,
    SapPerformanceIndicators,
    SapExtractionReadiness,
    SapEccDetails,
    SapS4HanaDetails,
    SapBwDetails,
    SapHanaDetails,
    SapCrmDetails,
    SapSrmDetails,
    SapScmDetails,
    SapPiPoDetails,
    SapMdgDetails,
    SapSuccessFactorsDetails,
    SapVariant,
)


# ── In-memory job store ───────────────────────────────────────────────────────
# Mirrors the pattern used by app/core/job_store.py for SQL Server jobs.

_jobs: dict[str, dict] = {}


def _sap_warn(ctx: str, exc: Exception) -> None:
    import logging
    logging.getLogger(__name__).warning("%s failed (non-fatal): %s", ctx, exc)


def create_job(request: SapAssessmentRequest) -> str:
    job_id = str(uuid.uuid4())
    job = {
        "job_id":           job_id,
        "variant":          request.variant,
        "label":            request.label,
        "host":             getattr(request, "host", None) or getattr(request, "ashost", None),
        "status":           "pending",
        "progress_message": None,
        "error":            None,
        "created_at":       datetime.now(timezone.utc).isoformat(),
        "completed_at":     None,
        "results":          None,
    }
    _jobs[job_id] = job
    try:
        azure_store.sap_upsert_session(job)
    except Exception as exc:
        _sap_warn("sap create_job persist", exc)
    return job_id


def get_job(job_id: str) -> Optional[dict]:
    if job_id in _jobs:
        return _jobs[job_id]
    try:
        row = azure_store.sap_get_session(job_id)
        if row:
            _jobs[job_id] = row
            return row
    except Exception as exc:
        _sap_warn("sap get_job DB fallback", exc)
    return None


def list_jobs() -> list[dict]:
    db_rows: list[dict] = []
    try:
        db_rows = azure_store.sap_list_sessions()
    except Exception as exc:
        _sap_warn("sap list_jobs DB query", exc)
    merged = {r["job_id"]: r for r in db_rows}
    merged.update(_jobs)
    return sorted(merged.values(), key=lambda j: str(j.get("created_at", "")), reverse=True)


def _update_job(job_id: str, **kwargs: object) -> None:
    if job_id in _jobs:
        _jobs[job_id].update(kwargs)
    current = dict(_jobs.get(job_id, {}))
    try:
        azure_store.sap_upsert_session(current)
    except Exception as exc:
        _sap_warn("sap _update_job persist", exc)


# ── Connection test ───────────────────────────────────────────────────────────

def test_connection(request: SapAssessmentRequest) -> dict:
    """
    Validate SAP credentials and return basic system info.

    TODO (production): Replace mock return with real RFC/JDBC/REST call:
      - RFC: pyrfc.Connection(ashost=host, sysnr=sysnr, client=client, user=user, passwd=pwd)
      - HANA JDBC: hdbcli.dbapi.connect(address=host, port=port, user=user, password=pwd)
      - PI/PO REST: requests.get(f"http{'s' if use_https else ''}://{host}:{port}/dir/api")
      - SuccessFactors: OAuth2 token fetch → GET /odata/v2/User?$top=1
    """
    variant = request.variant
    host = request.effective_host()

    if not host:
        return {"success": False, "message": "Host or API URL is required."}

    # Simulate credential failure for obviously invalid inputs
    if request.rfc and (not request.rfc.username or not request.rfc.password.get_secret_value()):
        return {"success": False, "message": "Username and password are required."}
    if request.hana and (not request.hana.username or not request.hana.password.get_secret_value()):
        return {"success": False, "message": "HANA username and password are required."}

    mock_info = _mock_system_info(variant)
    return {
        "success": True,
        "message": f"Connected: {mock_info.system_id} / Client {mock_info.client} / Basis {mock_info.basis_release}",
        "system_info": mock_info.model_dump(),
    }


# ── Main assessment runner ────────────────────────────────────────────────────

async def run_assessment(job_id: str, request: SapAssessmentRequest) -> None:
    """
    Async assessment runner — called as a FastAPI background task.
    Updates job state in-place. Results are stored in _jobs[job_id]["results"].
    """
    try:
        _update_job(job_id, status="running", progress_message="Establishing connection…")
        await asyncio.sleep(0.1)

        _update_job(job_id, progress_message="Collecting system information…")
        system_info = _mock_system_info(request.variant)

        _update_job(job_id, progress_message="Running object inventory…")
        await asyncio.sleep(0.05)
        object_inventory = _mock_object_inventory(request.variant)

        _update_job(job_id, progress_message="Estimating data volumes…")
        await asyncio.sleep(0.05)
        data_volumes = _mock_data_volumes(request.variant)

        _update_job(job_id, progress_message="Profiling users and authorizations…")
        await asyncio.sleep(0.05)
        user_profile = _mock_user_profile(request.variant)

        _update_job(job_id, progress_message="Collecting performance indicators…")
        await asyncio.sleep(0.05)
        performance = _mock_performance(request.variant)

        _update_job(job_id, progress_message="Assessing extraction readiness…")
        await asyncio.sleep(0.05)
        extraction_readiness = _mock_extraction_readiness(request.variant)

        _update_job(job_id, progress_message="Running variant-specific assessments…")
        await asyncio.sleep(0.1)
        variant_details = _mock_variant_details(request)

        result = SapAssessmentResult(
            job_id=job_id,
            variant=request.variant,
            label=request.label,
            assessed_at=datetime.now(timezone.utc).isoformat(),
            status="completed",
            system_info=system_info,
            object_inventory=object_inventory,
            data_volumes=data_volumes,
            user_profile=user_profile,
            performance=performance,
            extraction_readiness=extraction_readiness,
            **variant_details,
        )

        _update_job(
            job_id,
            status="completed",
            completed_at=datetime.now(timezone.utc).isoformat(),
            progress_message="Assessment complete.",
            results=result.model_dump(),
        )

    except Exception as exc:  # noqa: BLE001
        _update_job(
            job_id,
            status="failed",
            completed_at=datetime.now(timezone.utc).isoformat(),
            error=str(exc),
        )


# ── Mock data generators (per variant) ───────────────────────────────────────
# Each returns realistic but deterministic mock data.
# In production: replace with RFC function calls, SQL queries, or REST API calls.

def _mock_system_info(variant: SapVariant) -> SapSystemInfo:
    infos: dict[str, SapSystemInfo] = {
        "ecc": SapSystemInfo(system_id="PRD", client="100", basis_release="7.50", kernel_version="7.54", os_platform="Linux x86_64", db_layer="Oracle 19c"),
        "s4hana": SapSystemInfo(system_id="S4P", client="100", basis_release="7.56", kernel_version="7.56", os_platform="Linux x86_64", db_layer="SAP HANA 2.0 SP06"),
        "bw": SapSystemInfo(system_id="BWP", client="100", basis_release="7.50", kernel_version="7.53", os_platform="Windows Server 2019", db_layer="Microsoft SQL Server 2019"),
        "hana": SapSystemInfo(system_id="HDB", client="N/A", basis_release="2.0 SPS 06", kernel_version="2.0.060", os_platform="SUSE Linux Enterprise 15", db_layer="SAP HANA Native"),
        "crm": SapSystemInfo(system_id="CRP", client="100", basis_release="7.02", kernel_version="7.47", os_platform="AIX 7.2", db_layer="IBM DB2 11.1"),
        "srm": SapSystemInfo(system_id="SRM", client="100", basis_release="7.31", kernel_version="7.45", os_platform="Linux x86_64", db_layer="Oracle 19c"),
        "scm": SapSystemInfo(system_id="APO", client="100", basis_release="7.02", kernel_version="7.45", os_platform="Linux x86_64", db_layer="Oracle 19c"),
        "pi_po": SapSystemInfo(system_id="PIP", client="N/A", basis_release="7.50 SP16", kernel_version="7.54", os_platform="Linux x86_64", db_layer="Oracle 19c"),
        "mdg": SapSystemInfo(system_id="MDG", client="100", basis_release="7.50", kernel_version="7.54", os_platform="Linux x86_64", db_layer="SAP HANA 2.0 SP05"),
        "successfactors": SapSystemInfo(system_id="SFSF", client="ACME_CORP", basis_release="2H 2023", kernel_version="Cloud", os_platform="Cloud (AWS)", db_layer="Cloud (proprietary)"),
    }
    return infos.get(variant, SapSystemInfo(system_id="UNK", client="000", basis_release="unknown", kernel_version="unknown", os_platform="unknown", db_layer="unknown"))


def _mock_object_inventory(variant: SapVariant) -> SapObjectInventory:
    data: dict[str, dict] = {
        "ecc": dict(total_repository_objects=187_432, custom_objects=23_104, standard_objects=164_328, custom_ratio_pct=12.3, deprecated_objects=412),
        "s4hana": dict(total_repository_objects=210_001, custom_objects=8_230, standard_objects=201_771, custom_ratio_pct=3.9, deprecated_objects=88),
        "bw": dict(total_repository_objects=94_750, custom_objects=41_200, standard_objects=53_550, custom_ratio_pct=43.5, deprecated_objects=610),
        "hana": dict(total_repository_objects=32_400, custom_objects=12_600, standard_objects=19_800, custom_ratio_pct=38.9, deprecated_objects=120),
        "crm": dict(total_repository_objects=68_300, custom_objects=9_400, standard_objects=58_900, custom_ratio_pct=13.8, deprecated_objects=295),
        "srm": dict(total_repository_objects=45_200, custom_objects=5_800, standard_objects=39_400, custom_ratio_pct=12.8, deprecated_objects=180),
        "scm": dict(total_repository_objects=72_100, custom_objects=14_900, standard_objects=57_200, custom_ratio_pct=20.7, deprecated_objects=340),
        "pi_po": dict(total_repository_objects=3_400, custom_objects=3_400, standard_objects=0, custom_ratio_pct=100.0, deprecated_objects=47),
        "mdg": dict(total_repository_objects=28_700, custom_objects=4_100, standard_objects=24_600, custom_ratio_pct=14.3, deprecated_objects=55),
        "successfactors": dict(total_repository_objects=5_200, custom_objects=1_800, standard_objects=3_400, custom_ratio_pct=34.6, deprecated_objects=12),
    }
    return SapObjectInventory(**data.get(variant, dict(total_repository_objects=0, custom_objects=0, standard_objects=0, custom_ratio_pct=0.0, deprecated_objects=0)))


def _mock_data_volumes(variant: SapVariant) -> list[SapDataVolume]:
    volumes: dict[str, list[dict]] = {
        "ecc": [
            {"key_object": "BKPF (Accounting Header)", "row_count": 14_200_000, "size_mb": 2_840.0},
            {"key_object": "BSEG (Accounting Item)", "row_count": 58_400_000, "size_mb": 11_680.0},
            {"key_object": "EKKO (PO Header)", "row_count": 3_100_000, "size_mb": 620.0},
            {"key_object": "VBRK (Billing Header)", "row_count": 9_800_000, "size_mb": 1_960.0},
        ],
        "s4hana": [
            {"key_object": "ACDOCA (Universal Journal)", "row_count": 320_000_000, "size_mb": 64_000.0},
            {"key_object": "MATDOC (Material Document)", "row_count": 48_000_000, "size_mb": 9_600.0},
        ],
        "bw": [
            {"key_object": "0SD_C03 (Sales Orders)", "row_count": 120_000_000, "size_mb": 24_000.0},
            {"key_object": "0FI_GL_10 (G/L Items)", "row_count": 210_000_000, "size_mb": 42_000.0},
        ],
        "hana": [
            {"key_object": "SCHEMA:SAP_PROD", "row_count": 890_000_000, "size_mb": 178_000.0},
            {"key_object": "SCHEMA:SAP_BW", "row_count": 430_000_000, "size_mb": 86_000.0},
        ],
        "crm": [
            {"key_object": "BUT000 (Business Partner)", "row_count": 4_200_000, "size_mb": 840.0},
            {"key_object": "CRM_ACT_HEADER", "row_count": 18_500_000, "size_mb": 3_700.0},
        ],
        "srm": [
            {"key_object": "BBPC_SC (Shopping Cart)", "row_count": 2_800_000, "size_mb": 560.0},
            {"key_object": "EKKO (PO Header)", "row_count": 1_400_000, "size_mb": 280.0},
        ],
        "scm": [
            {"key_object": "PLANNING AREAS", "row_count": 24_000_000, "size_mb": 4_800.0},
        ],
        "pi_po": [
            {"key_object": "Message Log (30d)", "row_count": 840_000, "size_mb": 168.0},
        ],
        "mdg": [
            {"key_object": "Change Requests", "row_count": 1_200_000, "size_mb": 240.0},
        ],
        "successfactors": [
            {"key_object": "EmployeeProfile", "row_count": 28_000, "size_mb": 56.0},
        ],
    }
    return [SapDataVolume(**row) for row in volumes.get(variant, [])]


def _mock_user_profile(variant: SapVariant) -> SapUserProfile:
    profiles: dict[str, dict] = {
        "ecc": dict(active_users=1_840, locked_users=320, dialog_users=1_620, system_users=220, role_count=4_200, profile_count=890),
        "s4hana": dict(active_users=2_100, locked_users=180, dialog_users=1_900, system_users=200, role_count=3_800, profile_count=740),
        "bw": dict(active_users=340, locked_users=42, dialog_users=310, system_users=30, role_count=820, profile_count=200),
        "hana": dict(active_users=120, locked_users=8, dialog_users=80, system_users=40, role_count=180, profile_count=60),
        "crm": dict(active_users=480, locked_users=60, dialog_users=440, system_users=40, role_count=920, profile_count=280),
        "srm": dict(active_users=220, locked_users=30, dialog_users=200, system_users=20, role_count=420, profile_count=140),
        "scm": dict(active_users=160, locked_users=18, dialog_users=148, system_users=12, role_count=380, profile_count=120),
        "pi_po": dict(active_users=15, locked_users=2, dialog_users=8, system_users=7, role_count=40, profile_count=18),
        "mdg": dict(active_users=80, locked_users=10, dialog_users=74, system_users=6, role_count=160, profile_count=48),
        "successfactors": dict(active_users=28_000, locked_users=820, dialog_users=27_200, system_users=800, role_count=640, profile_count=280),
    }
    return SapUserProfile(**profiles.get(variant, dict(active_users=0, locked_users=0, dialog_users=0, system_users=0, role_count=0, profile_count=0)))


def _mock_performance(variant: SapVariant) -> SapPerformanceIndicators:
    perfs: dict[str, dict] = {
        "ecc": dict(avg_response_ms=680, active_background_jobs=142, work_process_utilization_pct=62.4, short_dumps_last_24h=8),
        "s4hana": dict(avg_response_ms=210, active_background_jobs=88, work_process_utilization_pct=41.0, short_dumps_last_24h=2),
        "bw": dict(avg_response_ms=1_240, active_background_jobs=34, work_process_utilization_pct=55.2, short_dumps_last_24h=5),
        "hana": dict(avg_response_ms=4, active_background_jobs=12, work_process_utilization_pct=28.0, short_dumps_last_24h=0),
        "crm": dict(avg_response_ms=520, active_background_jobs=56, work_process_utilization_pct=48.0, short_dumps_last_24h=6),
        "srm": dict(avg_response_ms=440, active_background_jobs=28, work_process_utilization_pct=35.0, short_dumps_last_24h=3),
        "scm": dict(avg_response_ms=860, active_background_jobs=44, work_process_utilization_pct=58.0, short_dumps_last_24h=4),
        "pi_po": dict(avg_response_ms=120, active_background_jobs=6, work_process_utilization_pct=22.0, short_dumps_last_24h=1),
        "mdg": dict(avg_response_ms=380, active_background_jobs=18, work_process_utilization_pct=30.0, short_dumps_last_24h=1),
        "successfactors": dict(avg_response_ms=280, active_background_jobs=4, work_process_utilization_pct=12.0, short_dumps_last_24h=0),
    }
    return SapPerformanceIndicators(**perfs.get(variant, dict(avg_response_ms=0, active_background_jobs=0, work_process_utilization_pct=0.0, short_dumps_last_24h=0)))


def _mock_extraction_readiness(variant: SapVariant) -> SapExtractionReadiness:
    readiness: dict[str, dict] = {
        "ecc": dict(supported_methods=["RFC", "ODP", "SLT"], delta_enabled_objects=1_820, existing_extractors=340, odp_available=True, slt_configured=False),
        "s4hana": dict(supported_methods=["RFC", "ODP", "SLT", "JDBC"], delta_enabled_objects=2_400, existing_extractors=180, odp_available=True, slt_configured=True),
        "bw": dict(supported_methods=["RFC", "ODP"], delta_enabled_objects=4_100, existing_extractors=820, odp_available=True, slt_configured=False),
        "hana": dict(supported_methods=["JDBC", "SLT"], delta_enabled_objects=840, existing_extractors=60, odp_available=False, slt_configured=True),
        "crm": dict(supported_methods=["RFC", "ODP"], delta_enabled_objects=680, existing_extractors=140, odp_available=True, slt_configured=False),
        "srm": dict(supported_methods=["RFC", "ODP"], delta_enabled_objects=420, existing_extractors=88, odp_available=True, slt_configured=False),
        "scm": dict(supported_methods=["RFC"], delta_enabled_objects=280, existing_extractors=64, odp_available=False, slt_configured=False),
        "pi_po": dict(supported_methods=["REST", "OData"], delta_enabled_objects=0, existing_extractors=0, odp_available=False, slt_configured=False),
        "mdg": dict(supported_methods=["RFC", "ODP"], delta_enabled_objects=320, existing_extractors=48, odp_available=True, slt_configured=False),
        "successfactors": dict(supported_methods=["OData", "Integration Center"], delta_enabled_objects=0, existing_extractors=14, odp_available=False, slt_configured=False),
    }
    return SapExtractionReadiness(**readiness.get(variant, dict(supported_methods=[], delta_enabled_objects=0, existing_extractors=0, odp_available=False, slt_configured=False)))


def _mock_variant_details(request: SapAssessmentRequest) -> dict:
    """Returns a dict with at most one populated variant-specific key."""
    v = request.variant

    if v == "ecc":
        return {"ecc": SapEccDetails(
            z_table_count=4_218, standard_table_count=34_102,
            z_table_ratio_pct=11.0, abap_program_count=28_640,
            transport_landscape=["DEV", "QAS", "PRD"],
            module_volumes={"FI": 72_600_000, "CO": 41_200_000, "MM": 31_400_000, "SD": 28_900_000, "HR": 18_100_000, "PP": 12_300_000},
        )}

    if v == "s4hana":
        return {"s4hana": SapS4HanaDetails(
            activated_business_functions=84, fiori_app_count=1_240,
            embedded_hana=True, badi_count=3_820, enhancement_spot_count=640,
            migration_object_count=18,
        )}

    if v == "bw":
        return {"bw": SapBwDetails(
            info_cube_count=128, dso_adso_count=342, info_object_count=8_400,
            composite_provider_count=48, multi_provider_count=24,
            process_chain_count=284, transformation_count=912, dtp_count=1_840,
            source_system_connections=6, query_workbook_count=2_840,
            delta_mechanism_types=["ABR", "AIMD", "ROAI", "TTIME"],
        )}

    if v == "hana":
        return {"hana": SapHanaDetails(
            schema_count=24, row_store_tables=840, column_store_tables=12_400,
            calculation_views=3_200, analytic_views=480, attribute_views=920,
            stored_procedures=640, sql_script_objects=280,
            replication_status="SLT active — 4 tables replicating",
            total_data_volume_gb=2_840.0,
        )}

    if v == "crm":
        return {"crm": SapCrmDetails(
            business_partner_count=4_200_000, ic_profiles=48,
            campaign_objects=12_400, middleware_queues=184, custom_objects=2_100,
        )}

    if v == "srm":
        return {"srm": SapSrmDetails(
            vendor_master_count=84_000, shopping_cart_count=2_800_000,
            purchase_order_count=1_400_000, catalog_items=240_000,
            workflow_tasks=18, backend_system_connections=3,
        )}

    if v == "scm":
        return {"scm": SapScmDetails(
            live_cache_status="Active — 128 GB allocated",
            planning_area_count=14, model_version_count=8,
            cif_connected_systems=4, data_object_count=48_200,
        )}

    if v == "pi_po":
        return {"pi_po": SapPiPoDetails(
            iflow_count=0, interface_count=1_284,
            adapter_types=["RFC", "IDOC", "JDBC", "HTTP", "SFTP", "AS2", "XI"],
            avg_daily_messages=284_000, error_rate_pct=0.82,
            business_systems=48,
        )}

    if v == "mdg":
        return {"mdg": SapMdgDetails(
            governed_entity_types=12, workflow_rule_count=84,
            governance_model="Central Governance",
            open_change_requests=1_840, consolidation_rules=48,
        )}

    if v == "successfactors":
        return {"successfactors": SapSuccessFactorsDetails(
            active_modules=["Employee Central", "Recruiting", "Learning", "Performance & Goals", "Compensation", "Onboarding"],
            employee_count=28_000, mdf_object_count=340,
            integration_center_connections=12, replication_status="Active — Employee Central → ECC HR",
        )}

    return {}
