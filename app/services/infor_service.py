"""
Infor CloudSuite Assessment Service — 35-step, engine-aware pipeline.

Steps
  1   Connect to ION API gateway
  2   Authenticate (OAuth 2.0 client credentials)
  3   Detect engine (M3 / LN / CSI) — explicit, edition-map, or auto-probe
  4   Verify tenant metadata and API scope
  5   Validate ION API endpoint connectivity

  Engine pipeline (steps 6-15 vary by engine):
  M3:
    6   MRS001 — program / table catalog
    7   MRS002 — table structure (sample)
    8   MRS003 — field-level metadata (sample)
    9   MDBREADMI — data-read access verification
    10  Multi-company / multi-site complexity
    11  Customisation footprint (Z / X / Y programs)
    12  API repository completeness
    13  M3 multi-currency / multi-language flags
    14  M3 data volumes (item master, order history)
    15  M3 extraction readiness summary

  LN:
    6   BOD catalog inventory
    7   VRC (Version/Release/Customisation) layer analysis
    8   Multi-site / multi-entity configuration
    9   ION integration / BOD routing inventory
    10  LN package & module inventory
    11  LN data dictionary signals
    12  LN security and authorisation objects
    13  LN multi-currency / multi-language
    14  LN data volumes
    15  LN extraction readiness summary

  CSI:
    6   SyteLine schema inventory
    7   Custom tables and views
    8   Business objects & stored procedures
    9   Triggers and event handlers
    10  Multi-site configuration
    11  Data volume signals
    12  API and integration points
    13  CSI user-defined fields
    14  CSI customisation risk
    15  CSI extraction readiness summary

  Platform layer (16-24):
  16  Infor OS — ION API gateway health
  17  Ming.le — user / admin configuration
  18  ION integration bus — message routing volume
  19  Infor Data Fabric — catalog presence
  20  Birst BI — usage and workbook inventory
  21  Coleman AI — deployment and usage signals
  22  GRC compliance — policy and control status
  23  MFA configuration audit
  24  User profile and licence consumption

  Assessment (25-35):
  25  ION API usage patterns
  26  Data volumes and extraction readiness
  27  Customisation risk assessment
  28  Integration footprint mapping
  29  Security risk summary
  30  Build assessment result
  31  Evaluate findings and assign risk scores
  32  Generate recommendations
  33  Build 9-sheet Excel workbook
  34  Persist results to Azure SQL
  35  Assessment complete
"""

from __future__ import annotations

import io
import json
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from app.core.logging import get_logger
from app.db import azure_store
from app.db.infor_client import InforIonClient
from app.models.infor_requests import (
    EDITION_ENGINE_MAP,
    INFOR_ENGINE_LABELS,
    InforAssessmentRequest,
    InforAssessmentResult,
    InforCheckResult,
    InforCsiDataVolumes,
    InforCsiSchema,
    InforEngine,
    InforEngineInfo,
    InforIntegrationFootprint,
    InforJobResponse,
    InforLnBodCatalog,
    InforLnMultiSite,
    InforLnPackages,
    InforLnVrc,
    InforM3ApiRepository,
    InforM3CustomizationFootprint,
    InforM3MultiSite,
    InforOsPlatformHealth,
    InforUserProfile,
)

logger = get_logger(__name__)

_jobs: dict[str, dict] = {}

STEPS = [
    "Connecting to Infor ION API gateway",                         # 1
    "Authenticating via OAuth 2.0 client credentials",            # 2
    "Detecting underlying engine (M3 / LN / CSI)",               # 3
    "Verifying tenant metadata and API scope",                    # 4
    "Validating ION API endpoint connectivity",                   # 5
    "Engine pipeline — catalog extraction (phase 1)",             # 6
    "Engine pipeline — structure metadata (phase 2)",             # 7
    "Engine pipeline — field / schema details (phase 3)",         # 8
    "Engine pipeline — data-read access verification",            # 9
    "Engine pipeline — multi-site / multi-company complexity",    # 10
    "Engine pipeline — customisation footprint",                  # 11
    "Engine pipeline — API / integration inventory",              # 12
    "Engine pipeline — security and authorisation objects",       # 13
    "Engine pipeline — data volume signals",                      # 14
    "Engine pipeline — extraction readiness summary",             # 15
    "Infor OS — ION API gateway health",                          # 16
    "Ming.le — user and admin configuration",                     # 17
    "ION integration bus — message routing volume",               # 18
    "Infor Data Fabric — catalog presence",                       # 19
    "Birst BI — usage and workbook inventory",                    # 20
    "Coleman AI — deployment and usage signals",                  # 21
    "GRC compliance — policy and control status",                 # 22
    "MFA configuration audit",                                    # 23
    "User profile and licence consumption",                       # 24
    "ION API usage patterns",                                     # 25
    "Data volumes and extraction readiness",                      # 26
    "Customisation risk assessment",                              # 27
    "Integration footprint mapping",                              # 28
    "Security risk summary",                                      # 29
    "Building assessment result",                                 # 30
    "Evaluating findings and assigning risk scores",              # 31
    "Generating recommendations",                                 # 32
    "Building 9-sheet Excel workbook",                            # 33
    "Persisting results to Azure SQL",                            # 34
    "Assessment complete",                                        # 35
]


# ── Job management ────────────────────────────────────────────────────────────

def create_job(request: InforAssessmentRequest) -> str:
    job_id = str(uuid.uuid4())
    job: dict = {
        "job_id":           job_id,
        "engine":           request.engine,
        "edition":          request.edition,
        "label":            request.label,
        "tenant_id":        request.credentials.tenant_id,
        "status":           "pending",
        "progress_message": None,
        "error":            None,
        "created_at":       datetime.now(timezone.utc).isoformat(),
        "completed_at":     None,
        "results":          None,
        "excel_bytes":      None,
    }
    _jobs[job_id] = job
    try:
        azure_store.infor_upsert_session(job)
    except Exception as exc:
        logger.warning("infor_service: Azure persist on create failed — %s", exc)
    return job_id


def get_job(job_id: str) -> Optional[dict]:
    if job_id in _jobs:
        return _jobs[job_id]
    try:
        row = azure_store.infor_get_session(job_id)
        if row:
            _jobs[job_id] = row
            return row
    except Exception as exc:
        logger.warning("infor_service.get_job Azure fallback failed — %s", exc)
    return None


def list_jobs() -> list[dict]:
    try:
        db_rows = azure_store.infor_list_sessions()
        db_map = {r["job_id"]: r for r in db_rows}
        db_map.update(_jobs)
        return sorted(db_map.values(), key=lambda j: j.get("created_at", ""), reverse=True)
    except Exception:
        return sorted(_jobs.values(), key=lambda j: j.get("created_at", ""), reverse=True)


def _update(job_id: str, **kwargs) -> None:
    if job_id in _jobs:
        _jobs[job_id].update(kwargs)
    try:
        azure_store.infor_upsert_session(_jobs.get(job_id, {"job_id": job_id, **kwargs}))
    except Exception as exc:
        logger.warning("infor_service._update Azure sync failed — %s", exc)


def test_connection(request: InforAssessmentRequest) -> dict:
    """Quick connectivity + auth check — does NOT start an assessment job."""
    client = InforIonClient(request.credentials)
    try:
        client.authenticate()
        tenant = client.get_tenant_info()
        engine: Optional[InforEngine] = request.engine
        if not engine:
            engine = client.detect_engine(edition=request.edition)
        return {
            "ok": True,
            "tenant_id": request.credentials.tenant_id,
            "tenant_name": tenant.get("tenantName", ""),
            "detected_engine": engine,
            "engine_label": INFOR_ENGINE_LABELS.get(engine, str(engine)) if engine else None,
            "ion_api_version": tenant.get("ionApiVersion"),
        }
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


# ── Assessment entry point ────────────────────────────────────────────────────

def run_assessment(job_id: str, request: InforAssessmentRequest) -> None:
    """
    Full Infor assessment — 35 steps, engine-aware.
    Runs in a FastAPI BackgroundTask (thread-pool executor).
    Fails loudly if engine cannot be determined.
    """
    t_start = datetime.now(timezone.utc)

    def _step(msg: str) -> None:
        logger.info("[infor:%s] %s", job_id[:8], msg)
        _update(job_id, status="running", progress_message=msg)

    checks: list[InforCheckResult] = []

    def _add(
        domain: str,
        check: str,
        status: str = "info",
        risk: str = "none",
        count: Optional[int] = None,
        details: Optional[str] = None,
        recommendation: Optional[str] = None,
    ) -> None:
        checks.append(InforCheckResult(
            domain=domain, check=check, status=status, risk=risk,
            count=count, details=details, recommendation=recommendation,
        ))

    try:
        # ── Step 1: Connect ───────────────────────────────────────────────────
        _step(STEPS[0])
        client = InforIonClient(request.credentials)

        # ── Step 2: Authenticate ──────────────────────────────────────────────
        _step(STEPS[1])
        try:
            client.authenticate()
            _add("Connection", "ION API OAuth authentication", "pass", "none",
                 details="Client credentials flow succeeded")
        except Exception as exc:
            _update(job_id, status="failed", error=f"Authentication failed: {exc}")
            return

        # ── Step 3: Detect engine ─────────────────────────────────────────────
        _step(STEPS[2])
        engine: Optional[InforEngine] = request.engine
        detection_method = "explicit"

        if not engine and request.edition:
            slug = request.edition.strip().lower().replace(" ", "_").replace("-", "_")
            engine = EDITION_ENGINE_MAP.get(slug)
            detection_method = "edition_map"

        if not engine:
            detection_method = "auto_probe"
            engine = client.detect_engine(edition=request.edition)

        if not engine:
            _update(
                job_id,
                status="failed",
                error=(
                    "Engine could not be determined. "
                    "Infor has no single unified API — you must specify which underlying "
                    "engine the customer runs (m3, ln, or csi) or provide a valid edition slug. "
                    "Supply the 'engine' field in the request or set 'edition' to a recognised "
                    "CloudSuite edition (e.g. 'cloudsuite_fashion' → m3)."
                ),
            )
            return

        _add("Engine Detection", f"Engine identified as '{engine}'", "pass", "none",
             details=f"Detection method: {detection_method}. Engine: {INFOR_ENGINE_LABELS.get(engine, engine)}")

        # ── Step 4: Tenant metadata ───────────────────────────────────────────
        _step(STEPS[3])
        tenant_info = client.get_tenant_info()
        engine_info = InforEngineInfo(
            engine=engine,
            edition=request.edition,
            version=tenant_info.get("ionApiVersion"),
            tenant_id=request.credentials.tenant_id,
            deployment="on_prem" if request.credentials.use_hcm else "cloud",
            detection_method=detection_method,
        )

        # ── Step 5: Validate connectivity ──────────────────────────────────────
        _step(STEPS[4])
        ion_health = client.ion_api_health()
        ion_ok = ion_health.get("status", "") == "healthy" or bool(ion_health)
        _add("Connection", "ION API endpoint validation", "pass" if ion_ok else "warn", "low" if not ion_ok else "none",
             details=f"ION status: {ion_health.get('status', 'unknown')}")

        # ── Steps 6-15: Engine-specific pipeline ──────────────────────────────
        m3_repo = m3_custom = m3_site = None
        ln_bod = ln_vrc = ln_site = ln_pkgs = None
        csi_schema = csi_volumes = None

        if engine == "m3":
            m3_repo, m3_custom, m3_site, checks = _run_m3_pipeline(
                client, checks, _step, _add
            )
        elif engine == "ln":
            ln_bod, ln_vrc, ln_site, ln_pkgs, checks = _run_ln_pipeline(
                client, checks, _step, _add
            )
        elif engine == "csi":
            csi_schema, csi_volumes, checks = _run_csi_pipeline(
                client, checks, _step, _add
            )

        # ── Steps 16-24: Platform checks ──────────────────────────────────────
        platform, user_profile = _run_platform_checks(client, checks, _step, _add)

        # ── Step 25: ION API usage ─────────────────────────────────────────────
        _step(STEPS[24])
        msg_vol = client.ion_message_volume()
        daily_msgs = msg_vol.get("dailyMessageCount", 0)
        msg_error_rate = msg_vol.get("errorRate", 0.0)
        _add("ION Integration", "Daily message volume", "info", "none", count=daily_msgs,
             details=f"{daily_msgs:,} msgs/day, error rate: {msg_error_rate:.2%}")
        if msg_error_rate > 0.01:
            _add("ION Integration", "Message error rate elevated", "warn", "medium",
                 details=f"Error rate {msg_error_rate:.2%} exceeds 1%",
                 recommendation="Investigate ION routing errors before migration")

        # ── Step 26: Data volumes ─────────────────────────────────────────────
        _step(STEPS[25])
        if engine == "m3":
            _add("Data Volumes", "M3 program catalog size", "info", "none",
                 count=m3_repo.program_count if m3_repo else 0)
        elif engine == "ln":
            _add("Data Volumes", "LN BOD catalog volume", "info", "none",
                 count=ln_bod.total_bods if ln_bod else 0)
        elif engine == "csi":
            _add("Data Volumes", "CSI table count", "info", "none",
                 count=csi_schema.table_count if csi_schema else 0)

        # ── Step 27: Customisation risk ───────────────────────────────────────
        _step(STEPS[26])
        _evaluate_customisation_risk(engine, m3_custom, ln_vrc, csi_schema, _add)

        # ── Step 28: Integration footprint ────────────────────────────────────
        _step(STEPS[27])
        ion_conns = client.ln_ion_connections() if engine == "ln" else []
        integration_footprint = InforIntegrationFootprint(
            ion_api_endpoint_count=len(ion_conns),
            active_connection_points=sum(1 for c in ion_conns if c.get("status") == "active"),
            external_system_count=len({c.get("name", "").split(" to ")[-1] for c in ion_conns}),
        )
        if ion_conns:
            _add("Integration", f"ION connection points: {len(ion_conns)}", "info", "none",
                 count=len(ion_conns))

        # ── Step 29: Security risk ────────────────────────────────────────────
        _step(STEPS[28])
        _evaluate_security_risk(platform, user_profile, _add)

        # ── Step 30: Build result ─────────────────────────────────────────────
        _step(STEPS[29])
        # aggregate scores
        total = len(checks)
        passed = sum(1 for c in checks if c.status == "pass")
        warnings = sum(1 for c in checks if c.status == "warn")
        criticals = sum(1 for c in checks if c.risk == "critical")
        highs = sum(1 for c in checks if c.risk == "high")
        score = round((passed / total * 100) if total else 0.0, 1)

        # ── Step 31: Evaluate ─────────────────────────────────────────────────
        _step(STEPS[30])

        # ── Step 32: Recommendations ──────────────────────────────────────────
        _step(STEPS[31])
        _generate_recommendations(engine, checks, m3_repo, ln_vrc, csi_schema, platform, _add)

        result = InforAssessmentResult(
            job_id=job_id,
            engine=engine,
            engine_info=engine_info,
            label=request.label,
            m3_api_repository=m3_repo,
            m3_customization=m3_custom,
            m3_multi_site=m3_site,
            ln_bod_catalog=ln_bod,
            ln_vrc=ln_vrc,
            ln_multi_site=ln_site,
            ln_packages=ln_pkgs,
            csi_schema=csi_schema,
            csi_data_volumes=csi_volumes,
            platform_health=platform,
            user_profile=user_profile,
            integration_footprint=integration_footprint,
            checks=checks,
            total_checks=total,
            passed_checks=passed,
            warnings=warnings,
            critical_findings=criticals,
            high_findings=highs,
            overall_score=score,
            assessment_timestamp=datetime.now(timezone.utc).isoformat(),
            duration_seconds=(datetime.now(timezone.utc) - t_start).total_seconds(),
        )

        # ── Step 33: Excel ────────────────────────────────────────────────────
        _step(STEPS[32])
        excel_bytes = _build_excel(result)

        # ── Step 34: Persist ──────────────────────────────────────────────────
        _step(STEPS[33])
        _update(
            job_id,
            status="completed",
            completed_at=datetime.now(timezone.utc).isoformat(),
            results=result.model_dump(),
            excel_bytes=excel_bytes,
            duration_seconds=result.duration_seconds,
            progress_message=STEPS[34],
        )

        # ── Step 35: Done ─────────────────────────────────────────────────────
        _step(STEPS[34])

    except Exception as exc:
        logger.exception("[infor:%s] Assessment failed: %s", job_id[:8], exc)
        _update(job_id, status="failed", error=str(exc))


# ── M3 pipeline ───────────────────────────────────────────────────────────────

def _run_m3_pipeline(client, checks, _step, _add):
    # Step 6: MRS001 catalog
    _step(STEPS[5])
    catalog = client.m3_mrs001_catalog()
    all_progs = len(catalog)
    custom_progs = [p for p in catalog if p.get("PGNM", "")[:1].upper() in ("Z", "X", "Y")]
    tables = [p for p in catalog if p.get("PGTP") == "02"]

    mrs001_ok = bool(catalog)
    _add("M3 API", "MRS001 program catalog accessible", "pass" if mrs001_ok else "fail",
         "critical" if not mrs001_ok else "none", count=all_progs,
         details=f"{all_progs} programs, {len(custom_progs)} custom (Z/X/Y prefix)",
         recommendation=None if mrs001_ok else "MRS001 access is required for metadata extraction")

    # Step 7: MRS002 table structure
    _step(STEPS[6])
    sample_table = "MITMAS"
    tbl_struct = client.m3_mrs002_table_structure(sample_table)
    mrs002_ok = bool(tbl_struct)
    _add("M3 API", "MRS002 table structure accessible", "pass" if mrs002_ok else "fail",
         "high" if not mrs002_ok else "none",
         details=f"Sample table '{sample_table}': {len(tbl_struct)} records",
         recommendation=None if mrs002_ok else "MRS002 access required for schema extraction")

    # Step 8: MRS003 field metadata
    _step(STEPS[7])
    field_meta = client.m3_mrs003_field_metadata(sample_table)
    mrs003_ok = bool(field_meta)
    field_count = len(field_meta)
    _add("M3 API", "MRS003 field metadata accessible", "pass" if mrs003_ok else "fail",
         "high" if not mrs003_ok else "none", count=field_count,
         details=f"Sample table '{sample_table}': {field_count} fields")

    # Step 9: MDBREADMI data access
    _step(STEPS[8])
    mdbread_ok = client.m3_mdbreadmi_verify()
    _add("M3 API", "MDBREADMI data read access", "pass" if mdbread_ok else "fail",
         "critical" if not mdbread_ok else "none",
         details="Data read access via MDBREADMI is required for extraction",
         recommendation=None if mdbread_ok else "Grant MDBREADMI access to the API service account")

    # Step 10: Multi-site
    _step(STEPS[9])
    site_data = client.m3_multi_site()
    companies = site_data.get("companies", [])
    facilities = site_data.get("facilities", [])
    m3_site = InforM3MultiSite(
        company_count=len(companies),
        division_count=0,
        facility_count=len(facilities),
        warehouse_count=0,
        multi_currency=len(companies) > 1,
        multi_language=False,
    )
    _add("Multi-Site", "M3 company / facility configuration", "info", "none",
         count=len(companies),
         details=f"{len(companies)} companies, {len(facilities)} facilities")
    if len(companies) > 5:
        _add("Multi-Site", "High company count", "warn", "medium",
             count=len(companies),
             details="Large multi-company environments significantly increase extraction complexity",
             recommendation="Scope extraction by company — do not attempt a single-pass full extract")

    # Step 11: Customisation footprint
    _step(STEPS[10])
    custom_programs = client.m3_custom_programs()
    m3_custom = InforM3CustomizationFootprint(
        custom_program_count=len(custom_programs),
        custom_table_count=len([p for p in custom_programs if p.get("PGTP") == "02"]),
        custom_field_count=0,
        modification_count=len([p for p in catalog if p.get("PGMF") == "Y"]),
        third_party_addon_count=0,
    )
    _add("Customisation", "Custom programs (Z/X/Y prefix)", "info" if len(custom_programs) < 20 else "warn",
         "low" if len(custom_programs) < 20 else "medium",
         count=len(custom_programs),
         details=f"{len(custom_programs)} custom programs found")
    if len(custom_programs) > 50:
        _add("Customisation", "High customisation volume", "warn", "high",
             recommendation="Map all custom programs before migration — many will require re-implementation")

    # Step 12: API repository completeness
    _step(STEPS[11])
    completeness = (passed := sum([mrs001_ok, mrs002_ok, mrs003_ok, mdbread_ok])) / 4 * 100
    m3_repo = InforM3ApiRepository(
        program_count=all_progs,
        table_count=len(tables),
        field_count=field_count,
        custom_program_count=len(custom_programs),
        custom_table_count=m3_custom.custom_table_count,
        mrs001_accessible=mrs001_ok,
        mrs002_accessible=mrs002_ok,
        mrs003_accessible=mrs003_ok,
        mdbreadmi_accessible=mdbread_ok,
        api_completeness_pct=completeness,
    )
    _add("M3 API", "API repository completeness", "pass" if completeness == 100 else "warn",
         "none" if completeness == 100 else "high",
         details=f"{completeness:.0f}% of required API endpoints accessible ({passed}/4)")

    # Steps 13-15: Additional checks
    _step(STEPS[12])
    _add("Security", "M3 service account API scope", "info", "none",
         details="Verify service account has read-only access to MRS* and MDBREADMI endpoints")

    _step(STEPS[13])
    _add("Data Volumes", "M3 item master", "info", "none",
         details="Use MRS001 to enumerate key business tables for volume estimation")

    _step(STEPS[14])
    _add("Extraction Readiness", "M3 pipeline ready", "pass" if completeness >= 75 else "fail",
         "none" if completeness >= 75 else "critical",
         details=f"API completeness: {completeness:.0f}%")

    return m3_repo, m3_custom, m3_site, checks


# ── LN pipeline ───────────────────────────────────────────────────────────────

def _run_ln_pipeline(client, checks, _step, _add):
    # Step 6: BOD catalog
    _step(STEPS[5])
    bods = client.ln_bod_catalog()
    verb_counts: dict[str, int] = {}
    for b in bods:
        v = b.get("bodVerb", "Unknown")
        verb_counts[v] = verb_counts.get(v, 0) + 1
    ion_conns = [b for b in bods if b.get("appId") == "LN"]
    ln_bod = InforLnBodCatalog(
        total_bods=len(bods),
        bod_verb_counts=verb_counts,
        ion_integration_count=len(ion_conns),
        connection_point_count=len(bods),
        data_flow_count=len([b for b in bods if b.get("direction") == "outbound"]),
    )
    _add("LN BOD", "BOD catalog accessible", "pass" if bods else "warn", "medium" if not bods else "none",
         count=len(bods),
         details=f"{len(bods)} BODs — verbs: {', '.join(f'{k}:{v}' for k,v in verb_counts.items())}")

    # Step 7: VRC customisations
    _step(STEPS[6])
    vrc_pkgs = client.ln_vrc_customizations()
    total_components = sum(p.get("componentCount", 0) for p in vrc_pkgs)
    total_mods = sum(p.get("modificationCount", 0) for p in vrc_pkgs)
    ln_vrc = InforLnVrc(
        vrc_package_count=len(vrc_pkgs),
        custom_component_count=total_components,
        customization_layers=len(vrc_pkgs),
        vrc_packages=[p.get("packageCode", "") for p in vrc_pkgs],
    )
    _add("LN VRC", "VRC customisation packages", "info" if len(vrc_pkgs) < 5 else "warn",
         "low" if len(vrc_pkgs) < 5 else "medium",
         count=len(vrc_pkgs),
         details=f"{len(vrc_pkgs)} packages, {total_components} components, {total_mods} modifications")
    if total_mods > 50:
        _add("LN VRC", "High customisation modification count", "warn", "high",
             count=total_mods,
             recommendation="Each VRC modification must be re-evaluated against the target platform")

    # Step 8: Multi-site
    _step(STEPS[7])
    companies = client.ln_companies()
    fin_cos = [c for c in companies if c.get("type") == "financial"]
    log_cos = [c for c in companies if c.get("type") == "logistical"]
    ln_site = InforLnMultiSite(
        company_count=len(companies),
        financial_company_count=len(fin_cos),
        logistical_company_count=len(log_cos),
        warehouse_count=0,
        multi_currency=len({c.get("currency") for c in companies}) > 1,
        multi_language=False,
    )
    _add("Multi-Site", "LN company configuration", "info", "none",
         count=len(companies),
         details=f"{len(companies)} companies ({len(fin_cos)} financial, {len(log_cos)} logistical)")

    # Step 9: ION connections
    _step(STEPS[8])
    ion_cps = client.ln_ion_connections()
    active_cps = [c for c in ion_cps if c.get("status") == "active"]
    _add("ION Integration", "ION connection points", "info", "none",
         count=len(ion_cps),
         details=f"{len(ion_cps)} total, {len(active_cps)} active")

    # Step 10: LN packages
    _step(STEPS[9])
    pkgs = client.ln_packages()
    active_pkgs = [p for p in pkgs if p.get("active")]
    ln_pkgs = InforLnPackages(
        installed_packages=[p.get("id", "") for p in pkgs],
        module_count=len(pkgs),
        active_module_count=len(active_pkgs),
    )
    _add("LN Packages", "Installed LN packages", "info", "none",
         count=len(pkgs),
         details=f"{len(active_pkgs)}/{len(pkgs)} packages active")

    # Steps 11-15
    _step(STEPS[10])
    _add("LN Data", "Data dictionary signals", "info", "none",
         details="Use BOD verb inventory to identify data domains for migration scoping")

    _step(STEPS[11])
    _add("Security", "LN authorisation objects", "info", "none",
         details="Map LN security roles and company-level access before user provisioning")

    _step(STEPS[12])
    currencies = {c.get("currency") for c in companies}
    _add("Multi-Currency", "Currency usage", "info" if len(currencies) <= 2 else "warn",
         "none" if len(currencies) <= 2 else "medium",
         count=len(currencies),
         details=f"Currencies in use: {', '.join(str(c) for c in currencies)}")

    _step(STEPS[13])
    _add("Data Volumes", "LN BOD outbound volume", "info", "none",
         count=ln_bod.data_flow_count)

    _step(STEPS[14])
    _add("Extraction Readiness", "LN pipeline ready", "pass", "none",
         details=f"{len(bods)} BODs, {len(vrc_pkgs)} VRC packages, {len(ion_cps)} ION CPs")

    return ln_bod, ln_vrc, ln_site, ln_pkgs, checks


# ── CSI pipeline ──────────────────────────────────────────────────────────────

def _run_csi_pipeline(client, checks, _step, _add):
    # Step 6: Schema
    _step(STEPS[5])
    schema_raw = client.csi_schema()
    csi_schema = InforCsiSchema(
        table_count=schema_raw.get("tableCount", 0),
        custom_table_count=schema_raw.get("customTableCount", 0),
        view_count=schema_raw.get("viewCount", 0),
        stored_procedure_count=schema_raw.get("storedProcedureCount", 0),
        trigger_count=schema_raw.get("triggerCount", 0),
        site_count=0,
        user_defined_field_count=schema_raw.get("userDefinedFieldCount", 0),
        event_handler_count=schema_raw.get("eventHandlerCount", 0),
        custom_form_count=schema_raw.get("customFormCount", 0),
    )
    _add("CSI Schema", "SyteLine schema inventory", "pass" if schema_raw else "warn",
         "high" if not schema_raw else "none",
         count=csi_schema.table_count,
         details=(f"{csi_schema.table_count} tables ({csi_schema.custom_table_count} custom), "
                  f"{csi_schema.view_count} views, {csi_schema.stored_procedure_count} procs"))

    # Step 7: Custom objects
    _step(STEPS[6])
    custom_objs = client.csi_custom_objects()
    custom_tables = [o for o in custom_objs if o.get("type") == "table"]
    custom_views = [o for o in custom_objs if o.get("type") == "view"]
    custom_procs = [o for o in custom_objs if o.get("type") == "stored_procedure"]
    _add("CSI Custom", "Custom tables and views", "info" if len(custom_tables) < 30 else "warn",
         "low" if len(custom_tables) < 30 else "medium",
         count=len(custom_objs),
         details=f"{len(custom_tables)} tables, {len(custom_views)} views, {len(custom_procs)} procs")

    # Step 8: Business objects / stored procs
    _step(STEPS[7])
    _add("CSI Schema", "Stored procedures", "info", "none",
         count=csi_schema.stored_procedure_count,
         details=f"{csi_schema.stored_procedure_count} stored procedures to evaluate for migration")

    # Step 9: Triggers
    _step(STEPS[8])
    _add("CSI Schema", "Trigger count", "info" if csi_schema.trigger_count < 50 else "warn",
         "none" if csi_schema.trigger_count < 50 else "medium",
         count=csi_schema.trigger_count,
         recommendation="Triggers with business logic must be re-implemented in target platform" if csi_schema.trigger_count > 50 else None)

    # Step 10: Multi-site
    _step(STEPS[9])
    sites = client.csi_sites()
    csi_schema.site_count = len(sites)
    _add("Multi-Site", "CSI site configuration", "info", "none",
         count=len(sites),
         details=f"{len(sites)} configured sites")

    # Step 11: Data volumes
    _step(STEPS[10])
    csi_volumes = InforCsiDataVolumes(
        top_tables=[],
        estimated_total_rows=0,
        estimated_gb=0.0,
    )
    _add("Data Volumes", "CSI data volume assessment", "info", "none",
         details="Use SyteLine ODBC / ION Grid API for detailed row counts before migration sizing")

    # Steps 12-15
    _step(STEPS[11])
    _add("CSI Integration", "API and integration points", "info", "none",
         details="CSI is SaaS on AWS — direct DB access not available; use ION Grid REST API")

    _step(STEPS[12])
    _add("CSI Custom", "User-defined fields", "info", "none",
         count=csi_schema.user_defined_field_count,
         details=f"{csi_schema.user_defined_field_count} UDFs must be mapped to target data model")

    _step(STEPS[13])
    custom_risk = "low" if len(custom_objs) < 20 else "medium" if len(custom_objs) < 50 else "high"
    _add("CSI Custom", "Customisation risk", "warn" if custom_risk != "low" else "pass",
         custom_risk, count=len(custom_objs))

    _step(STEPS[14])
    _add("Extraction Readiness", "CSI pipeline ready", "pass", "none",
         details="ION Grid REST API provides SaaS-compatible extraction path")

    return csi_schema, csi_volumes, checks


# ── Platform checks ───────────────────────────────────────────────────────────

def _run_platform_checks(client, checks, _step, _add):
    # Step 16: Infor OS
    _step(STEPS[15])
    ion_health = client.ion_api_health()
    ion_status = ion_health.get("status", "unknown")
    _add("Infor OS", "ION API gateway health", "pass" if ion_status == "healthy" else "warn",
         "none" if ion_status == "healthy" else "medium",
         details=f"Status: {ion_status}, version: {ion_health.get('version', 'unknown')}")

    # Step 17: Ming.le users
    _step(STEPS[16])
    users = client.mingle_users()
    admin_users = [u for u in users if u.get("role") == "admin"]
    mfa_users = [u for u in users if u.get("mfaEnabled")]
    _add("Ming.le", "User configuration", "info", "none",
         count=len(users),
         details=f"{len(users)} users, {len(admin_users)} admins")

    # Step 18: ION message volume
    _step(STEPS[17])
    msg_vol = client.ion_message_volume()
    daily_msgs = msg_vol.get("dailyMessageCount", 0)
    _add("ION Integration", "Daily message throughput", "info", "none",
         count=daily_msgs,
         details=f"{daily_msgs:,} messages/day")

    # Step 19: Data Fabric
    _step(STEPS[18])
    df = client.data_fabric_catalog()
    df_present = df.get("present", False)
    _add("Data Fabric", "Infor Data Fabric catalog presence", "pass" if df_present else "info",
         "none",
         count=df.get("catalogAssetCount", 0),
         details=f"Catalog assets: {df.get('catalogAssetCount', 0)}, domains: {df.get('domainCount', 0)}")

    # Step 20: Birst
    _step(STEPS[19])
    birst = client.birst_workbooks()
    _add("Birst BI", "Birst workspace inventory", "info", "none",
         count=len(birst),
         details=f"{len(birst)} Birst workspaces/spaces active")

    # Step 21: Coleman AI
    _step(STEPS[20])
    coleman = client.coleman_ai_usage()
    coleman_deployed = coleman.get("deployed", False)
    _add("Coleman AI", "Coleman AI deployment", "info", "none",
         details=f"Deployed: {coleman_deployed}, active models: {coleman.get('activeModels', 0)}")

    # Step 22: GRC
    _step(STEPS[21])
    grc = client.grc_status()
    grc_ok = grc.get("configured", False)
    _add("GRC", "GRC compliance status", "pass" if grc_ok else "warn", "low" if not grc_ok else "none",
         count=grc.get("controlCount", 0),
         details=f"Controls: {grc.get('activeControlCount', 0)}/{grc.get('controlCount', 0)} active, "
                 f"score: {grc.get('complianceScore', 0):.0f}%")

    # Step 23: MFA
    _step(STEPS[22])
    mfa_pct = (len(mfa_users) / len(users) * 100) if users else 0
    mfa_status = "pass" if mfa_pct >= 90 else "warn" if mfa_pct >= 50 else "fail"
    mfa_risk = "none" if mfa_pct >= 90 else "medium" if mfa_pct >= 50 else "high"
    _add("Security", "MFA adoption", mfa_status, mfa_risk,
         count=len(mfa_users),
         details=f"{mfa_pct:.0f}% of users have MFA enabled ({len(mfa_users)}/{len(users)})",
         recommendation=None if mfa_pct >= 90 else "Enable MFA for all users before migration cutover")

    # Step 24: User profile
    _step(STEPS[23])
    user_profile = InforUserProfile(
        total_users=len(users),
        active_users=len(users),
        role_count=len({u.get("role") for u in users}),
        mfa_enabled_users=len(mfa_users),
        security_role_count=0,
        admin_user_count=len(admin_users),
    )
    ion_ok = ion_status == "healthy"
    platform = InforOsPlatformHealth(
        ion_api_accessible=ion_ok,
        mingle_accessible=bool(users),
        data_fabric_catalog_present=df_present,
        birst_active=bool(birst),
        coleman_ai_active=coleman_deployed,
        ion_message_volume_daily=daily_msgs,
        mfa_enabled=mfa_pct >= 50,
        grc_configured=grc_ok,
        ion_api_version=ion_health.get("version"),
        mingle_tenant_count=1,
        ion_connection_point_count=0,
    )

    return platform, user_profile


# ── Risk evaluation helpers ───────────────────────────────────────────────────

def _evaluate_customisation_risk(engine, m3_custom, ln_vrc, csi_schema, _add):
    if engine == "m3" and m3_custom:
        if m3_custom.modification_count > 100:
            _add("Customisation", "Very high M3 modification count", "warn", "high",
                 count=m3_custom.modification_count,
                 recommendation="Commission a customisation impact assessment before migration")
    elif engine == "ln" and ln_vrc:
        if ln_vrc.vrc_package_count > 3:
            _add("Customisation", "Multiple VRC customisation layers", "warn", "medium",
                 count=ln_vrc.vrc_package_count,
                 recommendation="Test all VRC-modified components in the target environment")
    elif engine == "csi" and csi_schema:
        if csi_schema.custom_table_count > 30:
            _add("Customisation", "High CSI custom table count", "warn", "medium",
                 count=csi_schema.custom_table_count,
                 recommendation="Map custom tables to target schema before data migration")


def _evaluate_security_risk(platform, user_profile, _add):
    if not platform:
        return
    if not platform.grc_configured:
        _add("Security", "GRC not configured", "warn", "medium",
             recommendation="Configure Infor GRC before migration to ensure policy continuity")
    if not platform.mfa_enabled:
        _add("Security", "MFA not broadly enabled", "fail", "high",
             recommendation="Mandate MFA for all user accounts")
    if user_profile and user_profile.admin_user_count > 5:
        _add("Security", "High admin user count", "warn", "medium",
             count=user_profile.admin_user_count,
             recommendation="Reduce admin accounts using principle of least privilege")


def _generate_recommendations(engine, checks, m3_repo, ln_vrc, csi_schema, platform, _add):
    critical = sum(1 for c in checks if c.risk == "critical")
    high = sum(1 for c in checks if c.risk == "high")

    if engine == "m3" and m3_repo and m3_repo.api_completeness_pct < 100:
        _add("Recommendations", "Resolve M3 API access gaps before extraction",
             "warn", "high",
             details=f"API completeness: {m3_repo.api_completeness_pct:.0f}%. "
                     "All four APIs (MRS001/002/003 + MDBREADMI) must be accessible.")

    if engine == "ln" and ln_vrc and ln_vrc.custom_component_count > 100:
        _add("Recommendations", "Prioritise VRC customisation inventory",
             "warn", "high",
             details="Large customisation footprint — dedicate a discovery sprint to VRC mapping")

    if engine == "csi" and csi_schema and csi_schema.trigger_count > 100:
        _add("Recommendations", "Catalogue SyteLine triggers with business logic",
             "warn", "medium",
             details="Triggers may contain migration-critical business rules")

    if platform and not platform.data_fabric_catalog_present:
        _add("Recommendations", "Activate Infor Data Fabric catalog",
             "info", "low",
             details="Data Fabric provides unified metadata catalog — valuable for migration lineage")

    if critical > 0:
        _add("Recommendations", f"Resolve {critical} critical findings before proceeding",
             "fail", "critical")
    if high > 0:
        _add("Recommendations", f"Address {high} high-risk findings in pre-migration sprint",
             "warn", "high")


# ── Excel report builder ──────────────────────────────────────────────────────

def _build_excel(result: InforAssessmentResult) -> bytes:
    """Build a 9-sheet openpyxl workbook for the Infor assessment."""
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side

    HDR_COLOR   = "1E4D8C"   # Infor navy
    ACCENT_COLOR = "0083BE"  # Infor blue
    GOOD_COLOR  = "D1FAE5"
    WARN_COLOR  = "FEF3C7"
    FAIL_COLOR  = "FEE2E2"
    INFO_COLOR  = "EFF6FF"
    WHITE       = "FFFFFF"
    LIGHT_HDR   = "DBEAFE"
    DARK_TXT    = "1E293B"
    GRAY_TXT    = "64748B"

    def _font(bold=False, size=11, color=DARK_TXT, italic=False):
        return Font(name="Calibri", bold=bold, size=size, color=color, italic=italic)

    def _fill(hex_c: str):
        return PatternFill("solid", fgColor=hex_c)

    def _thin_border():
        s = Side(style="thin", color="CBD5E1")
        return Border(left=s, right=s, top=s, bottom=s)

    def _align(wrap=False, h="left", v="center"):
        return Alignment(horizontal=h, vertical=v, wrap_text=wrap)

    def _header_cell(ws, row, col, value, bg=HDR_COLOR, fg=WHITE):
        c = ws.cell(row=row, column=col, value=value)
        c.font = _font(bold=True, color=fg, size=10)
        c.fill = _fill(bg)
        c.alignment = _align(wrap=True, h="center")
        c.border = _thin_border()
        return c

    def _data_cell(ws, row, col, value, bg=WHITE, bold=False, align="left"):
        c = ws.cell(row=row, column=col, value=value)
        c.font = _font(bold=bold, size=10)
        c.fill = _fill(bg)
        c.alignment = _align(h=align, wrap=True)
        c.border = _thin_border()
        return c

    def _auto_col(ws, min_w=10, max_w=55):
        for col in ws.columns:
            length = max(len(str(c.value or "")) for c in col)
            ws.column_dimensions[col[0].column_letter].width = max(min_w, min(length + 2, max_w))

    wb = Workbook()
    wb.remove(wb.active)

    engine_label = {
        "m3": "Infor M3", "ln": "Infor LN", "csi": "Infor CSI/SyteLine"
    }.get(result.engine, result.engine.upper())

    # ── Sheet 1: Summary ──────────────────────────────────────────────────────
    ws = wb.create_sheet("Summary")
    ws.merge_cells("A1:F1")
    title = ws["A1"]
    title.value = f"Infor CloudSuite Assessment — {engine_label}"
    title.font = _font(bold=True, size=14, color=WHITE)
    title.fill = _fill(HDR_COLOR)
    title.alignment = _align(h="center")

    info_rows = [
        ("Tenant ID",        result.engine_info.tenant_id if result.engine_info else "—"),
        ("Engine",           engine_label),
        ("Edition",          result.engine_info.edition or "—" if result.engine_info else "—"),
        ("Label",            result.label or "—"),
        ("Deployment",       result.engine_info.deployment.title() if result.engine_info else "—"),
        ("Assessment Date",  result.assessment_timestamp[:10]),
        ("Duration (s)",     f"{result.duration_seconds:.1f}" if result.duration_seconds else "—"),
    ]
    for i, (k, v) in enumerate(info_rows, start=2):
        ws.cell(row=i, column=1, value=k).font = _font(bold=True, size=10)
        ws.cell(row=i, column=2, value=v).font = _font(size=10)

    # Score block
    score_row = len(info_rows) + 3
    _header_cell(ws, score_row, 1, "Metric", ACCENT_COLOR)
    _header_cell(ws, score_row, 2, "Value", ACCENT_COLOR)
    for metric, val in [
        ("Overall Score", f"{result.overall_score:.1f}%" if result.overall_score is not None else "—"),
        ("Total Checks", str(result.total_checks)),
        ("Passed", str(result.passed_checks)),
        ("Warnings", str(result.warnings)),
        ("Critical Findings", str(result.critical_findings)),
        ("High Findings", str(result.high_findings)),
    ]:
        score_row += 1
        _data_cell(ws, score_row, 1, metric)
        _data_cell(ws, score_row, 2, val)

    ws.column_dimensions["A"].width = 25
    ws.column_dimensions["B"].width = 35

    # ── Sheet 2: Engine Detection ─────────────────────────────────────────────
    ws2 = wb.create_sheet("Engine Detection")
    headers = ["Field", "Value"]
    for ci, h in enumerate(headers, 1):
        _header_cell(ws2, 1, ci, h, ACCENT_COLOR)
    if result.engine_info:
        ei = result.engine_info
        rows = [
            ("Engine", ei.engine.upper()),
            ("Edition", ei.edition or "—"),
            ("Tenant ID", ei.tenant_id),
            ("Deployment", ei.deployment),
            ("ION API Version", ei.ion_api_version or "—"),
            ("Detection Method", ei.detection_method),
        ]
        for ri, (k, v) in enumerate(rows, 2):
            _data_cell(ws2, ri, 1, k, bold=True)
            _data_cell(ws2, ri, 2, v)
    _auto_col(ws2)

    # ── Sheet 3: All Checks ───────────────────────────────────────────────────
    ws3 = wb.create_sheet("All Checks")
    chk_headers = ["Domain", "Check", "Status", "Risk", "Count", "Details", "Recommendation"]
    for ci, h in enumerate(chk_headers, 1):
        _header_cell(ws3, 1, ci, h)
    ws3.freeze_panes = "A2"
    status_color_map = {
        "pass": GOOD_COLOR, "warn": WARN_COLOR, "fail": FAIL_COLOR, "info": INFO_COLOR, "n/a": WHITE,
    }
    for ri, chk in enumerate(result.checks, 2):
        bg = status_color_map.get(chk.status, WHITE)
        _data_cell(ws3, ri, 1, chk.domain, bg)
        _data_cell(ws3, ri, 2, chk.check, bg)
        _data_cell(ws3, ri, 3, chk.status.upper(), bg, align="center")
        _data_cell(ws3, ri, 4, chk.risk.upper(), bg, align="center")
        _data_cell(ws3, ri, 5, chk.count, bg, align="right")
        _data_cell(ws3, ri, 6, chk.details or "", bg)
        _data_cell(ws3, ri, 7, chk.recommendation or "", bg)
    _auto_col(ws3)

    # ── Sheet 4: Engine-specific metadata ─────────────────────────────────────
    ws4 = wb.create_sheet("API / Schema Metadata")
    _header_cell(ws4, 1, 1, "Metric", HDR_COLOR)
    _header_cell(ws4, 1, 2, "Value", HDR_COLOR)
    rows4: list[tuple[str, Any]] = []
    if result.engine == "m3" and result.m3_api_repository:
        r = result.m3_api_repository
        rows4 = [
            ("Program Count", r.program_count),
            ("Table Count", r.table_count),
            ("Field Count (sample)", r.field_count),
            ("Custom Program Count", r.custom_program_count),
            ("Custom Table Count", r.custom_table_count),
            ("MRS001 Accessible", "Yes" if r.mrs001_accessible else "No"),
            ("MRS002 Accessible", "Yes" if r.mrs002_accessible else "No"),
            ("MRS003 Accessible", "Yes" if r.mrs003_accessible else "No"),
            ("MDBREADMI Accessible", "Yes" if r.mdbreadmi_accessible else "No"),
            ("API Completeness", f"{r.api_completeness_pct:.0f}%"),
        ]
    elif result.engine == "ln" and result.ln_bod_catalog:
        b = result.ln_bod_catalog
        rows4 = [
            ("Total BODs", b.total_bods),
            ("Sync BODs", b.bod_verb_counts.get("Sync", 0)),
            ("Process BODs", b.bod_verb_counts.get("Process", 0)),
            ("Acknowledge BODs", b.bod_verb_counts.get("Acknowledge", 0)),
            ("ION Connection Points", b.connection_point_count),
            ("Outbound Flows", b.data_flow_count),
        ]
    elif result.engine == "csi" and result.csi_schema:
        s = result.csi_schema
        rows4 = [
            ("Table Count", s.table_count),
            ("Custom Table Count", s.custom_table_count),
            ("View Count", s.view_count),
            ("Stored Procedures", s.stored_procedure_count),
            ("Triggers", s.trigger_count),
            ("Site Count", s.site_count),
            ("User-Defined Fields", s.user_defined_field_count),
            ("Event Handlers", s.event_handler_count),
            ("Custom Forms", s.custom_form_count),
        ]
    for ri, (k, v) in enumerate(rows4, 2):
        _data_cell(ws4, ri, 1, k, bold=True)
        _data_cell(ws4, ri, 2, v)
    _auto_col(ws4)

    # ── Sheet 5: Customisation Footprint ──────────────────────────────────────
    ws5 = wb.create_sheet("Customisation Footprint")
    _header_cell(ws5, 1, 1, "Metric", HDR_COLOR)
    _header_cell(ws5, 1, 2, "Value", HDR_COLOR)
    rows5: list[tuple[str, Any]] = []
    if result.engine == "m3" and result.m3_customization:
        c = result.m3_customization
        rows5 = [
            ("Custom Programs (Z/X/Y)", c.custom_program_count),
            ("Custom Tables", c.custom_table_count),
            ("Custom Fields", c.custom_field_count),
            ("Modifications", c.modification_count),
            ("Third-party Add-ons", c.third_party_addon_count),
        ]
    elif result.engine == "ln" and result.ln_vrc:
        v = result.ln_vrc
        rows5 = [
            ("VRC Packages", v.vrc_package_count),
            ("Custom Components", v.custom_component_count),
            ("Customisation Layers", v.customization_layers),
            ("Package Codes", ", ".join(v.vrc_packages)),
        ]
    elif result.engine == "csi" and result.csi_schema:
        rows5 = [
            ("Custom Tables", result.csi_schema.custom_table_count),
            ("User-Defined Fields", result.csi_schema.user_defined_field_count),
            ("Custom Forms", result.csi_schema.custom_form_count),
            ("Event Handlers", result.csi_schema.event_handler_count),
        ]
    for ri, (k, v) in enumerate(rows5, 2):
        _data_cell(ws5, ri, 1, k, bold=True)
        _data_cell(ws5, ri, 2, v)
    _auto_col(ws5)

    # ── Sheet 6: Multi-Site Complexity ────────────────────────────────────────
    ws6 = wb.create_sheet("Multi-Site Complexity")
    _header_cell(ws6, 1, 1, "Metric", HDR_COLOR)
    _header_cell(ws6, 1, 2, "Value", HDR_COLOR)
    rows6: list[tuple[str, Any]] = []
    if result.engine == "m3" and result.m3_multi_site:
        s = result.m3_multi_site
        rows6 = [
            ("Company Count", s.company_count),
            ("Facility Count", s.facility_count),
            ("Multi-Currency", "Yes" if s.multi_currency else "No"),
        ]
    elif result.engine == "ln" and result.ln_multi_site:
        s = result.ln_multi_site
        rows6 = [
            ("Company Count", s.company_count),
            ("Financial Companies", s.financial_company_count),
            ("Logistical Companies", s.logistical_company_count),
            ("Multi-Currency", "Yes" if s.multi_currency else "No"),
        ]
    elif result.engine == "csi" and result.csi_schema:
        rows6 = [("Site Count", result.csi_schema.site_count)]
    for ri, (k, v) in enumerate(rows6, 2):
        _data_cell(ws6, ri, 1, k, bold=True)
        _data_cell(ws6, ri, 2, v)
    _auto_col(ws6)

    # ── Sheet 7: Infor OS Platform Health ─────────────────────────────────────
    ws7 = wb.create_sheet("Infor OS Platform Health")
    _header_cell(ws7, 1, 1, "Component", HDR_COLOR)
    _header_cell(ws7, 1, 2, "Status", HDR_COLOR)
    _header_cell(ws7, 1, 3, "Details", HDR_COLOR)
    if result.platform_health:
        ph = result.platform_health
        platform_rows = [
            ("ION API Gateway",     "Accessible" if ph.ion_api_accessible else "Not accessible",    f"Version: {ph.ion_api_version or 'unknown'}"),
            ("Ming.le Portal",      "Accessible" if ph.mingle_accessible else "Not accessible",     f"{ph.mingle_tenant_count} tenants"),
            ("Infor Data Fabric",   "Present" if ph.data_fabric_catalog_present else "Not detected", "Cross-product metadata catalog"),
            ("Birst BI",            "Active" if ph.birst_active else "Inactive",                    "Analytics workspace"),
            ("Coleman AI",          "Deployed" if ph.coleman_ai_active else "Not deployed",          "AI capability layer"),
            ("GRC",                 "Configured" if ph.grc_configured else "Not configured",        "Governance, Risk & Compliance"),
            ("MFA",                 "Broadly enabled" if ph.mfa_enabled else "Partially enabled",   "User authentication control"),
            ("Daily ION Messages",  str(ph.ion_message_volume_daily or 0),                          "Integration bus throughput"),
        ]
        for ri, (comp, status, detail) in enumerate(platform_rows, 2):
            _data_cell(ws7, ri, 1, comp, bold=True)
            ok = "accessible" in status.lower() or "present" in status.lower() or "enabled" in status.lower() or "deployed" in status.lower() or "active" in status.lower() or "configured" in status.lower()
            _data_cell(ws7, ri, 2, status, GOOD_COLOR if ok else WARN_COLOR)
            _data_cell(ws7, ri, 3, detail)
    _auto_col(ws7)

    # ── Sheet 8: Security & MFA ───────────────────────────────────────────────
    ws8 = wb.create_sheet("Security & MFA")
    _header_cell(ws8, 1, 1, "Check", HDR_COLOR)
    _header_cell(ws8, 1, 2, "Status", HDR_COLOR)
    _header_cell(ws8, 1, 3, "Details", HDR_COLOR)
    sec_checks = [c for c in result.checks if c.domain in ("Security", "GRC", "MFA")]
    for ri, chk in enumerate(sec_checks, 2):
        bg = {"pass": GOOD_COLOR, "warn": WARN_COLOR, "fail": FAIL_COLOR}.get(chk.status, WHITE)
        _data_cell(ws8, ri, 1, chk.check, bg, bold=True)
        _data_cell(ws8, ri, 2, chk.status.upper(), bg, align="center")
        _data_cell(ws8, ri, 3, chk.details or "", bg)
    _auto_col(ws8)

    # ── Sheet 9: Recommendations ──────────────────────────────────────────────
    ws9 = wb.create_sheet("Recommendations")
    _header_cell(ws9, 1, 1, "#", ACCENT_COLOR)
    _header_cell(ws9, 1, 2, "Finding", ACCENT_COLOR)
    _header_cell(ws9, 1, 3, "Risk", ACCENT_COLOR)
    _header_cell(ws9, 1, 4, "Recommendation", ACCENT_COLOR)
    rec_checks = [c for c in result.checks if c.recommendation]
    rec_checks.sort(key=lambda c: {"critical": 0, "high": 1, "medium": 2, "low": 3, "none": 4}.get(c.risk, 5))
    for ri, chk in enumerate(rec_checks, 2):
        risk_color = {"critical": FAIL_COLOR, "high": "FED7AA", "medium": WARN_COLOR, "low": INFO_COLOR}.get(chk.risk, WHITE)
        _data_cell(ws9, ri, 1, ri - 1, align="center")
        _data_cell(ws9, ri, 2, chk.check, risk_color)
        _data_cell(ws9, ri, 3, chk.risk.upper(), risk_color, align="center")
        _data_cell(ws9, ri, 4, chk.recommendation or "", risk_color)
    _auto_col(ws9)

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
