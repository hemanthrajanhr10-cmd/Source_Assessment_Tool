"""
Salesforce Assessment Service — Extensive Multi-API Assessment.

Orchestrates 35 assessment steps across 20 domains and 8+ Salesforce API surfaces:
  REST API, Metadata API, Tooling API, Bulk API v2, Analytics (Connect API),
  Security, Automation, Integrations, Org Limits, Packages, Operations, Data Quality,
  UI Components, Field Schema, Approval Processes, Monitoring, Experience Cloud,
  Business Objects, Compliance & Governance.

Steps:
  0.  Connect + authenticate
  1.  Retrieve org info & extended settings
  2.  sObject inventory — standard & custom objects
  3.  Field analysis — custom fields, validation rules
  4.  Relationships, record types, page layouts
  5.  Apex classes — count, validity, size analysis
  6.  Apex test coverage
  7.  Flows, Process Builder, Workflow rules
  8.  Users, profiles, permission sets
  9.  Roles & sharing
  10. Bulk API job history
  11. Analytics — reports & dashboards
  12. Connected Apps & Named Credentials
  13. Platform Events & Streaming
  14. Org Limits & API usage
  15. User Licenses & consumption
  16. Installed Packages
  17. Custom Metadata Types & Settings
  18. Flow version analysis & type distribution
  19. Duplicate & Assignment Rules
  20. Scheduled Jobs & Email Services
  21. Security policies & admin user audit
  22. Apex code patterns & complexity
  23. External Objects & Change Data Capture
  24. UI Components — VF, Aura, LWC, Lightning Pages
  25. Field Schema Deep Scan — formula, encrypted, external IDs, rollups
  26. Automation Deep Dive — approvals, email alerts, field updates
  27. Security Depth — perm groups, auth providers, MFA, login history
  28. Integration Extended — external services, streaming, push topics
  29. Reporting Extended — report types, folder counts
  30. Operations Monitoring — event logs, Apex logs, job failures
  31. Data Quality Extended — field types, history/feed tracking
  32. Experience Cloud & Content — sites, Chatter, Knowledge
  33. Business Objects — products, price books, stages, processes
  34. Score & report
"""

from __future__ import annotations

import io
import threading
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.db.salesforce_client import SalesforceClient
from app.db import azure_store
from app.models.salesforce_requests import (
    SalesforceAssessmentRequest,
    SalesforceAssessmentResult,
    SalesforceCheckResult,
    SalesforceDomainSummary,
    SalesforceSessionRecord,
)
from app.core.logging import get_logger

logger = get_logger(__name__)

# ── In-memory job store ───────────────────────────────────────────────────────
_jobs: Dict[str, Dict] = {}
_jobs_lock = threading.Lock()

STEPS = [
    "Connecting to Salesforce org…",                                   # 0
    "Retrieving organisation metadata…",                               # 1
    "Inventorying sObjects (standard & custom)…",                      # 2
    "Analysing custom fields & validation rules…",                     # 3
    "Mapping relationships & record types…",                           # 4
    "Inspecting Apex classes & triggers (Tooling API)…",               # 5
    "Checking Apex test coverage…",                                    # 6
    "Auditing Flows, Process Builder & Workflow rules…",               # 7
    "Profiling users, profiles & permission sets…",                    # 8
    "Reviewing roles & sharing rules…",                                # 9
    "Scanning Bulk API v2 job history…",                               # 10
    "Fetching Analytics reports & dashboards…",                        # 11
    "Examining Connected Apps & Named Credentials…",                   # 12
    "Checking Platform Events & Streaming…",                           # 13
    "Checking Org Limits & API usage…",                                # 14
    "Analysing User Licenses & consumption…",                          # 15
    "Scanning Installed Packages…",                                    # 16
    "Inventorying Custom Metadata Types & Settings…",                  # 17
    "Analysing all Flow versions & type distribution…",                # 18
    "Checking Duplicate & Assignment Rules…",                          # 19
    "Scanning Scheduled Jobs & Email Services…",                       # 20
    "Auditing Security Policies & Admin Users…",                       # 21
    "Analysing Apex code patterns & API versions…",                    # 22
    "Examining External Objects & Change Data Capture…",               # 23
    "Inventorying UI components (VF, Aura, LWC, Lightning Pages)…",   # 24
    "Field schema deep scan (formula, encrypted, rollup fields)…",     # 25
    "Automation deep dive (approvals, email alerts, field updates)…",  # 26
    "Security depth (perm groups, auth providers, MFA, audit)…",      # 27
    "Integration extended (external services, streaming, topics)…",    # 28
    "Reporting extended (report types, folder structure)…",            # 29
    "Operations monitoring (event logs, Apex logs, job failures)…",    # 30
    "Data quality extended (field types, history tracking)…",          # 31
    "Experience Cloud & content (sites, Chatter, Knowledge)…",         # 32
    "Business objects (products, price books, stages, processes)…",    # 33
    "Computing scores & generating report…",                           # 34
]


# ── Job CRUD ──────────────────────────────────────────────────────────────────

def create_job(request: SalesforceAssessmentRequest) -> str:
    job_id = str(uuid.uuid4())
    creds = request.credentials
    initial_url = creds.instance_url or creds.domain or "pending-auth"
    job: Dict = {
        "job_id":           job_id,
        "status":           "pending",
        "label":            request.label or f"Salesforce – {initial_url}",
        "instance_url":     initial_url,
        "progress_message": "Queued",
        "checks_completed": 0,
        "total_checks":     len(STEPS),
        "created_at":       datetime.now(timezone.utc).isoformat(),
        "completed_at":     None,
        "error":            None,
        "result":           None,
    }
    with _jobs_lock:
        _jobs[job_id] = job

    try:
        azure_store.sf_upsert_session(job)
    except Exception as exc:
        logger.warning("sf_upsert_session (create) failed (non-fatal): %s", exc)

    return job_id


def get_job(job_id: str) -> Optional[Dict]:
    """Return job from in-memory cache; fall back to Azure SQL on cache miss."""
    with _jobs_lock:
        if job_id in _jobs:
            return _jobs[job_id]

    try:
        row = azure_store.sf_get_session(job_id)
        if row:
            with _jobs_lock:
                _jobs[job_id] = row
            return row
    except Exception as exc:
        logger.warning("sf_get_session DB lookup failed: %s", exc)
    return None


def list_jobs() -> List[SalesforceSessionRecord]:
    """Return jobs: merge in-memory cache with persisted Azure SQL rows."""
    db_rows: List[Dict] = []
    try:
        db_rows = azure_store.sf_list_sessions()
    except Exception as exc:
        logger.warning("sf_list_sessions DB query failed, using in-memory only: %s", exc)

    with _jobs_lock:
        mem_jobs = dict(_jobs)

    merged: Dict[str, Dict] = {}
    for row in db_rows:
        merged[row["job_id"]] = row
    for job_id, j in mem_jobs.items():
        merged[job_id] = j

    records = []
    for j in merged.values():
        r: Optional[Dict] = j.get("result")
        org_name = (r.get("org_name")             if r else None) or j.get("org_name")
        org_type = (r.get("org_type")             if r else None) or j.get("org_type")
        total    = (r.get("total_checks", 0)      if r else 0)    or j.get("total_checks_run", 0)
        critical = (r.get("critical_findings", 0) if r else 0)    or j.get("critical_findings", 0)
        high     = (r.get("high_findings", 0)     if r else 0)    or j.get("high_findings", 0)
        score    = (r.get("overall_score", 0.0)   if r else 0.0)  or j.get("overall_score", 0.0)
        records.append(SalesforceSessionRecord(
            job_id=j["job_id"],
            status=j["status"],
            label=j.get("label"),
            instance_url=j.get("instance_url", ""),
            org_name=org_name,
            org_type=org_type,
            total_checks=total or 0,
            critical_findings=critical or 0,
            high_findings=high or 0,
            overall_score=score or 0.0,
            created_at=str(j["created_at"]),
            completed_at=str(j["completed_at"]) if j.get("completed_at") else None,
            duration_seconds=j.get("duration_seconds"),
        ))
    records.sort(key=lambda x: x.created_at, reverse=True)
    return records


def _update(job_id: str, **kwargs: Any) -> None:
    """Update in-memory state and persist to Azure SQL (non-blocking on DB failure)."""
    with _jobs_lock:
        if job_id in _jobs:
            _jobs[job_id].update(kwargs)
        current = _jobs.get(job_id, {})

    try:
        azure_store.sf_upsert_session(current)
    except Exception as exc:
        logger.warning("sf_upsert_session failed (non-fatal): %s", exc)


# ── Connection test ───────────────────────────────────────────────────────────

def test_connection(request: SalesforceAssessmentRequest) -> Dict:
    client = SalesforceClient(request.credentials)
    info   = client.test_connection()
    return {
        "success":     True,
        "org_id":      info.get("org_id"),
        "org_name":    info.get("org_name"),
        "org_type":    info.get("org_type"),
        "instance":    info.get("instance"),
        "api_version": request.credentials.api_version,
    }


# ── Assessment runner ─────────────────────────────────────────────────────────

def run_assessment(job_id: str, request: SalesforceAssessmentRequest) -> None:
    """Background task: full Salesforce assessment — 35 steps, 100+ checks, 8+ API surfaces."""
    start = time.time()

    def step(msg: str, idx: int) -> None:
        _update(job_id, progress_message=msg, checks_completed=idx, status="running")

    try:
        # ── Step 0: Connect ───────────────────────────────────────────────────
        step(STEPS[0], 0)
        client = SalesforceClient(request.credentials)
        _update(job_id, instance_url=client.instance_url)

        checks: List[SalesforceCheckResult] = []

        # ── Step 1: Org info & extended settings ──────────────────────────────
        step(STEPS[1], 1)
        org          = client.get_org_info()
        org_settings = client.get_org_settings()
        org_name     = org.get("Name", "")
        org_type     = "Sandbox" if org.get("IsSandbox") else org.get("OrganizationType", "Production")
        chatter_enabled = bool(org_settings.get("ChatterEnabled", False))

        # ── Step 2: sObject inventory ─────────────────────────────────────────
        step(STEPS[2], 2)
        all_sobjects   = client.get_sobject_list()
        custom_objs    = [o for o in all_sobjects if o.get("custom")] if request.include_objects else []
        standard_objs  = [o for o in all_sobjects if not o.get("custom") and o.get("queryable")] if request.include_objects else []
        custom_count   = len(custom_objs)
        standard_count = len(standard_objs)

        checks.append(SalesforceCheckResult(
            check_id="SF-OBJ-001", name="Custom Object Count",
            domain="sObjects", api_surface="Metadata API",
            risk="high" if custom_count > 500 else ("medium" if custom_count > 200 else "low"),
            status="critical" if custom_count > 500 else ("warning" if custom_count > 200 else "passed"),
            count=custom_count,
            details=f"{custom_count} custom objects, {standard_count} standard objects.",
            recommendation="Consider consolidating rarely-used custom objects to reduce schema complexity." if custom_count > 200 else None,
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-OBJ-002", name="Queryable Standard Objects",
            domain="sObjects", api_surface="Metadata API",
            risk="low", status="info", count=standard_count,
            details=f"{standard_count} queryable standard objects in the org.",
        ))

        # ── Step 3: Fields & validation rules ─────────────────────────────────
        step(STEPS[3], 3)
        total_custom_fields = 0
        if request.include_fields and custom_objs:
            for obj in custom_objs[:50]:
                fields = client.get_custom_fields_for_object(obj.get("name", ""))
                total_custom_fields += len(fields)

        validation_rules = client.get_validation_rules() if request.include_validation else []
        active_vr        = [v for v in validation_rules if v.get("Active")]
        inactive_vr      = [v for v in validation_rules if not v.get("Active")]

        checks.append(SalesforceCheckResult(
            check_id="SF-FLD-001", name="Custom Fields (sample 50 objects)",
            domain="Data Model", api_surface="Metadata API",
            risk="medium" if total_custom_fields > 5000 else "low",
            status="warning" if total_custom_fields > 5000 else "passed",
            count=total_custom_fields,
            details=f"{total_custom_fields} custom fields across sampled objects.",
            recommendation="Review field usage and retire unused custom fields to reduce schema clutter." if total_custom_fields > 5000 else None,
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-FLD-002", name="Active Validation Rules",
            domain="Data Model", api_surface="Metadata API",
            risk="low", status="info",
            count=len(active_vr),
            details=f"{len(active_vr)} active validation rules, {len(inactive_vr)} inactive across all objects.",
        ))

        # ── Step 4: Relationships & record types ──────────────────────────────
        step(STEPS[4], 4)
        record_types = client.get_record_types() if request.include_relationships else []
        page_layouts = client.get_page_layouts() if request.include_relationships else []
        inactive_rt  = [r for r in record_types if not r.get("IsActive")]

        checks.append(SalesforceCheckResult(
            check_id="SF-REL-001", name="Record Types",
            domain="Data Model", api_surface="Metadata API",
            risk="low", status="info", count=len(record_types),
            details=f"{len(record_types)} record types ({len(inactive_rt)} inactive).",
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-REL-002", name="Page Layouts",
            domain="Data Model", api_surface="Metadata API",
            risk="medium" if len(page_layouts) > 200 else "low",
            status="warning" if len(page_layouts) > 200 else "info",
            count=len(page_layouts),
            details=f"{len(page_layouts)} page layouts defined.",
            recommendation="Consolidate page layouts per object to simplify UX and maintenance." if len(page_layouts) > 200 else None,
        ))

        # ── Step 5: Apex classes & triggers ──────────────────────────────────
        step(STEPS[5], 5)
        apex_classes  = client.get_apex_classes()  if request.include_apex else []
        apex_triggers = client.get_apex_triggers() if request.include_apex else []

        invalid_classes  = [c for c in apex_classes  if not c.get("IsValid")]
        invalid_triggers = [t for t in apex_triggers if not t.get("IsValid")]
        active_classes   = [c for c in apex_classes  if c.get("Status") == "Active"]

        checks.append(SalesforceCheckResult(
            check_id="SF-APX-001", name="Apex Class Count",
            domain="Apex Code", api_surface="Tooling API",
            risk="low", status="info", count=len(apex_classes),
            details=f"{len(apex_classes)} Apex classes ({len(active_classes)} active, {len(invalid_classes)} invalid).",
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-APX-002", name="Invalid Apex Classes",
            domain="Apex Code", api_surface="Tooling API",
            risk="critical" if invalid_classes else "low",
            status="critical" if invalid_classes else "passed",
            count=len(invalid_classes),
            details=f"{len(invalid_classes)} Apex classes have compilation errors." if invalid_classes else "All Apex classes compile successfully.",
            recommendation="Fix compilation errors in Apex classes before any deployment to production." if invalid_classes else None,
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-APX-003", name="Apex Triggers",
            domain="Apex Code", api_surface="Tooling API",
            risk="medium" if invalid_triggers else "low",
            status="warning" if invalid_triggers else "info",
            count=len(apex_triggers),
            details=f"{len(apex_triggers)} Apex triggers ({len(invalid_triggers)} invalid).",
            recommendation="Fix invalid Apex triggers to prevent runtime errors on record operations." if invalid_triggers else None,
        ))

        # ── Step 6: Apex test coverage ────────────────────────────────────────
        step(STEPS[6], 6)
        coverage     = client.get_code_coverage()     if request.include_apex else []
        test_results = client.get_apex_test_results() if request.include_apex else []

        if coverage:
            covered     = sum(c.get("NumLinesCovered",   0) for c in coverage)
            uncovered   = sum(c.get("NumLinesUncovered", 0) for c in coverage)
            total_lines = covered + uncovered
            coverage_pct = round((covered / total_lines * 100) if total_lines else 0, 1)
        else:
            coverage_pct = 0

        failed_tests = sum(r.get("NumFailures", 0)  for r in test_results)
        total_tests  = sum(r.get("NumTestsRan", 0)  for r in test_results)
        passed_tests = total_tests - failed_tests

        checks.append(SalesforceCheckResult(
            check_id="SF-APX-004", name="Apex Code Coverage",
            domain="Apex Code", api_surface="Tooling API",
            risk="critical" if coverage_pct < 75 else ("high" if coverage_pct < 85 else "low"),
            status="critical" if coverage_pct < 75 else ("warning" if coverage_pct < 85 else "passed"),
            value=coverage_pct,
            details=f"Apex test coverage: {coverage_pct}% (Salesforce requires ≥75% for production deploy). {passed_tests} tests passed, {failed_tests} failed.",
            recommendation="Increase Apex test coverage to meet the mandatory 75% deployment threshold." if coverage_pct < 75 else None,
        ))

        # ── Step 7: Flows, Process Builder, Workflow rules ────────────────────
        step(STEPS[7], 7)
        flows    = client.get_flows()            if request.include_flows else []
        wf_rules = client.get_workflow_rules()   if request.include_flows else []
        pb       = client.get_process_builders() if request.include_flows else []

        active_flows = [f for f in flows    if f.get("Status") == "Active"]
        inactive_pb  = [p for p in pb       if p.get("Status") != "Active"]
        active_wf    = [w for w in wf_rules if w.get("IsActive")]

        checks.append(SalesforceCheckResult(
            check_id="SF-AUT-001", name="Active Flows",
            domain="Automation", api_surface="Tooling API",
            risk="low", status="info", count=len(active_flows),
            details=f"{len(active_flows)} active flows out of {len(flows)} total.",
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-AUT-002", name="Inactive Process Builders",
            domain="Automation", api_surface="Tooling API",
            risk="medium" if inactive_pb else "low",
            status="warning" if inactive_pb else "passed",
            count=len(inactive_pb),
            details=f"{len(inactive_pb)} inactive Process Builder processes found.",
            recommendation="Migrate legacy Process Builder to Flow and deactivate/remove inactive processes." if inactive_pb else None,
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-AUT-003", name="Workflow Rules (Legacy)",
            domain="Automation", api_surface="Tooling API",
            risk="medium" if active_wf else "low",
            status="warning" if active_wf else "passed",
            count=len(active_wf),
            details=f"{len(active_wf)} active legacy workflow rules. Salesforce is retiring workflow rules.",
            recommendation="Migrate all active workflow rules to Flow before Salesforce's retirement deadline." if active_wf else None,
        ))

        # ── Step 8: Users, profiles, permission sets ──────────────────────────
        step(STEPS[8], 8)
        active_users   = client.get_users()           if request.include_security else []
        inactive_users = client.get_inactive_users()  if request.include_security else []
        profiles       = client.get_profiles()        if request.include_security else []
        perm_sets      = client.get_permission_sets() if request.include_security else []

        never_logged   = [u for u in active_users if not u.get("LastLoginDate")]
        total_all_users = len(active_users) + len(inactive_users)
        inactive_ratio  = round(len(inactive_users) / max(total_all_users, 1) * 100, 1)

        checks.append(SalesforceCheckResult(
            check_id="SF-SEC-001", name="Active Users",
            domain="Security", api_surface="REST API",
            risk="low", status="info", count=len(active_users),
            details=f"{len(active_users)} active users, {len(inactive_users)} inactive ({inactive_ratio}% inactive ratio).",
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-SEC-002", name="Users Who Never Logged In",
            domain="Security", api_surface="REST API",
            risk="medium" if never_logged else "low",
            status="warning" if never_logged else "passed",
            count=len(never_logged),
            details=f"{len(never_logged)} active users have never logged in — potential orphaned licenses.",
            recommendation="Review and deactivate users who have never logged in to reclaim licenses." if never_logged else None,
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-SEC-003", name="Profile Count",
            domain="Security", api_surface="REST API",
            risk="medium" if len(profiles) > 50 else "low",
            status="warning" if len(profiles) > 50 else "passed",
            count=len(profiles),
            details=f"{len(profiles)} profiles defined.",
            recommendation="Consolidate profiles and rely more on permission sets for a cleaner, scalable security model." if len(profiles) > 50 else None,
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-SEC-004", name="Permission Sets",
            domain="Security", api_surface="REST API",
            risk="low", status="info", count=len(perm_sets),
            details=f"{len(perm_sets)} custom permission sets defined.",
        ))

        # ── Step 9: Roles & sharing ───────────────────────────────────────────
        step(STEPS[9], 9)
        roles = client.get_roles() if request.include_security else []

        checks.append(SalesforceCheckResult(
            check_id="SF-SEC-005", name="Role Hierarchy Depth",
            domain="Security", api_surface="REST API",
            risk="medium" if len(roles) > 100 else "low",
            status="warning" if len(roles) > 100 else "passed",
            count=len(roles),
            details=f"{len(roles)} roles defined in the role hierarchy.",
            recommendation="Flatten the role hierarchy to reduce sharing-rule evaluation complexity." if len(roles) > 100 else None,
        ))

        # ── Step 10: Bulk API ─────────────────────────────────────────────────
        step(STEPS[10], 10)
        bulk_ingest  = client.get_bulk_jobs()       if request.include_bulk else []
        bulk_query   = client.get_bulk_query_jobs() if request.include_bulk else []
        failed_bulk  = [j for j in bulk_ingest if j.get("state") == "Failed"]
        aborted_bulk = [j for j in bulk_ingest if j.get("state") == "Aborted"]

        checks.append(SalesforceCheckResult(
            check_id="SF-BLK-001", name="Bulk Ingest Jobs",
            domain="Bulk API", api_surface="Bulk API v2",
            risk="low", status="info", count=len(bulk_ingest),
            details=f"{len(bulk_ingest)} bulk ingest jobs, {len(bulk_query)} bulk query jobs in history.",
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-BLK-002", name="Failed Bulk Jobs",
            domain="Bulk API", api_surface="Bulk API v2",
            risk="high" if failed_bulk else "low",
            status="warning" if failed_bulk else "passed",
            count=len(failed_bulk),
            details=f"{len(failed_bulk)} failed bulk jobs, {len(aborted_bulk)} aborted.",
            recommendation="Investigate failed bulk jobs — check field mappings, governor limits, and error logs." if failed_bulk else None,
        ))

        # ── Step 11: Analytics ────────────────────────────────────────────────
        step(STEPS[11], 11)
        reports    = client.get_reports()    if request.include_analytics else []
        dashboards = client.get_dashboards() if request.include_analytics else []

        checks.append(SalesforceCheckResult(
            check_id="SF-ANA-001", name="Reports",
            domain="Analytics", api_surface="Analytics API",
            risk="medium" if len(reports) > 2000 else "low",
            status="warning" if len(reports) > 2000 else "info",
            count=len(reports),
            details=f"{len(reports)} reports in the org.",
            recommendation="Archive or delete unused reports to reduce folder clutter." if len(reports) > 2000 else None,
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-ANA-002", name="Dashboards",
            domain="Analytics", api_surface="Analytics API",
            risk="low", status="info", count=len(dashboards),
            details=f"{len(dashboards)} dashboards in the org.",
        ))

        # ── Step 12: Integrations ─────────────────────────────────────────────
        step(STEPS[12], 12)
        connected_apps = client.get_connected_apps()    if request.include_integrations else []
        named_creds    = client.get_named_credentials() if request.include_integrations else []

        checks.append(SalesforceCheckResult(
            check_id="SF-INT-001", name="Connected Apps",
            domain="Integrations", api_surface="Tooling API",
            risk="medium" if len(connected_apps) > 20 else "low",
            status="warning" if len(connected_apps) > 20 else "passed",
            count=len(connected_apps),
            details=f"{len(connected_apps)} connected apps registered.",
            recommendation="Audit connected apps and revoke OAuth access for unused apps." if len(connected_apps) > 20 else None,
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-INT-002", name="Named Credentials",
            domain="Integrations", api_surface="Tooling API",
            risk="low", status="info", count=len(named_creds),
            details=f"{len(named_creds)} named credentials defined.",
        ))

        # ── Step 13: Platform Events ──────────────────────────────────────────
        step(STEPS[13], 13)
        platform_events = client.get_platform_events() if request.include_integrations else []

        checks.append(SalesforceCheckResult(
            check_id="SF-INT-003", name="Platform Events",
            domain="Integrations", api_surface="REST API",
            risk="low", status="info", count=len(platform_events),
            details=f"{len(platform_events)} platform event objects (__e) defined.",
        ))

        # ── Step 14: Org Limits ───────────────────────────────────────────────
        step(STEPS[14], 14)
        org_limits = client.get_org_limits()

        api_limit   = org_limits.get("DailyApiRequests") or {}
        api_max     = api_limit.get("Max", 0)
        api_rem     = api_limit.get("Remaining", 0)
        api_used    = api_max - api_rem if api_max else 0
        api_pct     = round(api_used / api_max * 100, 1) if api_max else 0.0

        data_limit  = org_limits.get("DataStorageMB") or {}
        data_max    = data_limit.get("Max", 0)
        data_rem    = data_limit.get("Remaining", 0)
        data_used   = data_max - data_rem if data_max else 0
        data_pct    = round(data_used / data_max * 100, 1) if data_max else 0.0

        file_limit  = org_limits.get("FileStorageMB") or {}
        file_max    = file_limit.get("Max", 0)
        file_rem    = file_limit.get("Remaining", 0)
        file_used   = file_max - file_rem if file_max else 0
        file_pct    = round(file_used / file_max * 100, 1) if file_max else 0.0

        hourly_lim  = org_limits.get("HourlyApiRequests") or {}
        hourly_max  = hourly_lim.get("Max", 0)
        hourly_rem  = hourly_lim.get("Remaining", 0)

        bulk_lim    = org_limits.get("DailyBulkApiRequests") or {}
        bulk_api_max = bulk_lim.get("Max", 0)
        bulk_api_rem = bulk_lim.get("Remaining", 0)

        checks.append(SalesforceCheckResult(
            check_id="SF-LIM-001", name="Daily API Calls Usage",
            domain="Org Limits", api_surface="REST API",
            risk="critical" if api_pct > 90 else ("high" if api_pct > 75 else "low"),
            status="critical" if api_pct > 90 else ("warning" if api_pct > 75 else "passed"),
            value=api_pct,
            count=api_used,
            details=f"Daily API calls: {api_used:,} used of {api_max:,} ({api_pct}%). {api_rem:,} remaining.",
            recommendation="Optimise integration API call patterns or request a daily limit increase from Salesforce." if api_pct > 75 else None,
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-LIM-002", name="Data Storage Usage",
            domain="Org Limits", api_surface="REST API",
            risk="high" if data_pct > 90 else ("medium" if data_pct > 75 else "low"),
            status="critical" if data_pct > 90 else ("warning" if data_pct > 75 else "passed"),
            value=data_pct,
            count=data_used,
            details=f"Data storage: {data_used:,} MB used of {data_max:,} MB ({data_pct}%).",
            recommendation="Archive or delete unused records, or purchase additional data storage." if data_pct > 75 else None,
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-LIM-003", name="File Storage Usage",
            domain="Org Limits", api_surface="REST API",
            risk="high" if file_pct > 90 else ("medium" if file_pct > 75 else "low"),
            status="critical" if file_pct > 90 else ("warning" if file_pct > 75 else "passed"),
            value=file_pct,
            count=file_used,
            details=f"File storage: {file_used:,} MB used of {file_max:,} MB ({file_pct}%).",
            recommendation="Archive attachments/files to an external system or purchase additional file storage." if file_pct > 75 else None,
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-LIM-004", name="Hourly & Bulk API Budget",
            domain="Org Limits", api_surface="REST API",
            risk="low", status="info",
            count=hourly_rem,
            details=f"Hourly API: {hourly_rem:,} of {hourly_max:,} remaining. Bulk API (daily): {bulk_api_rem:,} of {bulk_api_max:,} remaining.",
        ))

        # ── Step 15: User Licenses ────────────────────────────────────────────
        step(STEPS[15], 15)
        user_licenses   = client.get_user_licenses()

        sf_lic          = next((l for l in user_licenses if l.get("LicenseDefinitionKey") == "SFDC"), None)
        sf_total        = sf_lic.get("TotalLicenses", 0) if sf_lic else 0
        sf_used         = sf_lic.get("UsedLicenses",  0) if sf_lic else 0
        sf_pct          = round(sf_used / sf_total * 100, 1) if sf_total else 0.0

        total_licenses  = sum(l.get("TotalLicenses", 0) for l in user_licenses)
        total_used_lics = sum(l.get("UsedLicenses",  0) for l in user_licenses)

        checks.append(SalesforceCheckResult(
            check_id="SF-LIC-001", name="User License Types",
            domain="Licenses", api_surface="REST API",
            risk="low", status="info", count=len(user_licenses),
            details=f"{len(user_licenses)} license types. Overall: {total_used_lics:,} of {total_licenses:,} licences assigned.",
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-LIC-002", name="Salesforce License Utilization",
            domain="Licenses", api_surface="REST API",
            risk="high" if sf_pct > 95 else ("medium" if sf_pct > 85 else "low"),
            status="warning" if sf_pct > 85 else "passed",
            value=sf_pct,
            count=sf_used,
            details=f"Salesforce (full) licences: {sf_used} of {sf_total} assigned ({sf_pct}%).",
            recommendation="Initiate procurement for additional Salesforce licences before reaching 100% utilisation." if sf_pct > 85 else None,
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-LIC-003", name="Inactive-to-Active User Balance",
            domain="Licenses", api_surface="REST API",
            risk="medium" if inactive_ratio > 30 else "low",
            status="warning" if inactive_ratio > 30 else "passed",
            value=inactive_ratio,
            count=len(inactive_users),
            details=f"{inactive_ratio}% of all users are inactive ({len(inactive_users)} inactive vs. {len(active_users)} active).",
            recommendation="Review inactive users — deactivate confirmed leavers to reclaim billable licences." if inactive_ratio > 30 else None,
        ))

        # ── Step 16: Installed Packages ───────────────────────────────────────
        step(STEPS[16], 16)
        packages = client.get_installed_packages()

        checks.append(SalesforceCheckResult(
            check_id="SF-PKG-001", name="Installed Managed Packages",
            domain="Packages", api_surface="Tooling API",
            risk="medium" if len(packages) > 15 else "low",
            status="warning" if len(packages) > 15 else "info",
            count=len(packages),
            details=f"{len(packages)} managed packages installed.",
            recommendation="Audit installed packages — uninstall unused packages and ensure all are on supported versions." if len(packages) > 15 else None,
        ))

        # ── Step 17: Custom Metadata Types & Settings ─────────────────────────
        step(STEPS[17], 17)
        cmt_types       = client.get_custom_metadata_types()
        custom_settings = client.get_custom_settings()

        checks.append(SalesforceCheckResult(
            check_id="SF-DM-001", name="Custom Metadata Types",
            domain="Data Model", api_surface="Metadata API",
            risk="low", status="info", count=len(cmt_types),
            details=f"{len(cmt_types)} custom metadata types (__mdt) defined.",
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-DM-002", name="Custom Settings",
            domain="Data Model", api_surface="Tooling API",
            risk="low", status="info", count=len(custom_settings),
            details=f"{len(custom_settings)} custom settings objects defined.",
        ))

        # ── Step 18: Flow version analysis ────────────────────────────────────
        step(STEPS[18], 18)
        all_flow_versions = client.get_all_flow_versions()

        flow_label_map: Dict[str, List] = {}
        for fv in all_flow_versions:
            label = fv.get("MasterLabel", "")
            flow_label_map.setdefault(label, []).append(fv)

        flow_types: Dict[str, int] = {}
        for fv in all_flow_versions:
            pt = fv.get("ProcessType", "Unknown")
            flow_types[pt] = flow_types.get(pt, 0) + 1

        obsolete_fv    = [f for f in all_flow_versions if f.get("Status") in ("Obsolete", "InvalidDraft")]
        screen_flows   = [f for f in all_flow_versions if f.get("ProcessType") == "Flow" and f.get("Status") == "Active"]
        rt_flows       = [f for f in all_flow_versions if f.get("Status") == "Active" and f.get("TriggerType") in ("RecordBeforeSave", "RecordAfterSave")]
        sched_flows    = [f for f in all_flow_versions if f.get("Status") == "Active" and f.get("TriggerType") == "Scheduled"]
        high_ver_flows = [lbl for lbl, vers in flow_label_map.items() if sum(1 for v in vers if v.get("Status") in ("Obsolete", "InvalidDraft")) > 5]

        checks.append(SalesforceCheckResult(
            check_id="SF-AUT-004", name="Obsolete Flow Version Accumulation",
            domain="Automation", api_surface="Tooling API",
            risk="medium" if len(obsolete_fv) > 100 else "low",
            status="warning" if len(obsolete_fv) > 100 else ("info" if obsolete_fv else "passed"),
            count=len(obsolete_fv),
            details=f"{len(obsolete_fv)} obsolete/draft flow versions across {len(flow_label_map)} unique flows. {len(high_ver_flows)} flows have >5 obsolete versions.",
            recommendation="Delete obsolete flow versions to reduce metadata size and improve org performance." if len(obsolete_fv) > 100 else None,
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-AUT-005", name="Screen Flows (Active)",
            domain="Automation", api_surface="Tooling API",
            risk="low", status="info", count=len(screen_flows),
            details=f"{len(screen_flows)} active Screen Flows. Total unique flow types: {len(flow_types)}.",
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-AUT-006", name="Record-Triggered Flows (Active)",
            domain="Automation", api_surface="Tooling API",
            risk="low", status="info", count=len(rt_flows),
            details=f"{len(rt_flows)} active record-triggered flows (before/after save). Flow type breakdown: {dict(list(sorted(flow_types.items(), key=lambda x: -x[1])[:5]))}.",
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-AUT-007", name="Scheduled Flows (Active)",
            domain="Automation", api_surface="Tooling API",
            risk="low", status="info", count=len(sched_flows),
            details=f"{len(sched_flows)} active scheduled flows.",
        ))

        # ── Step 19: Duplicate & Assignment Rules ─────────────────────────────
        step(STEPS[19], 19)
        dup_rules    = client.get_duplicate_rules()
        assign_rules = client.get_assignment_rules()

        active_dup    = [r for r in dup_rules    if r.get("IsActive")]
        active_assign = [r for r in assign_rules if r.get("Active")]

        checks.append(SalesforceCheckResult(
            check_id="SF-DAT-001", name="Duplicate Management Rules",
            domain="Data Quality", api_surface="Tooling API",
            risk="medium" if not active_dup else "low",
            status="warning" if not active_dup else "passed",
            count=len(dup_rules),
            details=f"{len(dup_rules)} duplicate rules defined ({len(active_dup)} active).",
            recommendation="Activate duplicate rules on key objects (Lead, Contact, Account) to enforce data quality." if not active_dup else None,
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-DAT-002", name="Assignment Rules",
            domain="Data Quality", api_surface="Tooling API",
            risk="low", status="info", count=len(assign_rules),
            details=f"{len(assign_rules)} assignment rules defined ({len(active_assign)} active).",
        ))

        # ── Step 20: Scheduled Jobs & Email Services ──────────────────────────
        step(STEPS[20], 20)
        scheduled_jobs = client.get_scheduled_jobs()
        email_services = client.get_email_services()
        queues         = client.get_queues()

        active_cron      = [j for j in scheduled_jobs if j.get("State") in ("WAITING", "ACQUIRED")]
        active_email_svc = [e for e in email_services if e.get("IsActive")]

        checks.append(SalesforceCheckResult(
            check_id="SF-OPS-001", name="Scheduled Apex Jobs",
            domain="Operations", api_surface="REST API",
            risk="medium" if len(scheduled_jobs) > 50 else "low",
            status="warning" if len(scheduled_jobs) > 50 else "info",
            count=len(scheduled_jobs),
            details=f"{len(scheduled_jobs)} scheduled jobs ({len(active_cron)} active/waiting). Salesforce limits to 100 concurrent scheduled jobs.",
            recommendation="Consolidate scheduled jobs — approaching the 100-job governor limit." if len(scheduled_jobs) > 50 else None,
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-OPS-002", name="Email Services",
            domain="Operations", api_surface="REST API",
            risk="low", status="info", count=len(email_services),
            details=f"{len(email_services)} email services ({len(active_email_svc)} active).",
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-OPS-003", name="Queues",
            domain="Operations", api_surface="REST API",
            risk="low", status="info", count=len(queues),
            details=f"{len(queues)} queues defined.",
        ))

        # ── Step 21: Security Policies & Admin Users ──────────────────────────
        step(STEPS[21], 21)
        admin_users  = client.get_admin_users()  if request.include_security else []
        login_policy = client.get_login_policy() if request.include_security else {}

        min_pwd_len  = login_policy.get("MinPasswordLength", 0)
        max_attempts = login_policy.get("MaxLoginAttempts", 0)
        complexity   = login_policy.get("ComplexityRequirement", "Unknown")
        expiration   = login_policy.get("PasswordExpiration", "Unknown")

        checks.append(SalesforceCheckResult(
            check_id="SF-SEC-006", name="System Administrator Users",
            domain="Security", api_surface="REST API",
            risk="critical" if len(admin_users) > 20 else ("high" if len(admin_users) > 10 else ("medium" if len(admin_users) > 5 else "low")),
            status="critical" if len(admin_users) > 20 else ("warning" if len(admin_users) > 5 else "passed"),
            count=len(admin_users),
            details=f"{len(admin_users)} active users hold the System Administrator profile.",
            recommendation="Reduce System Administrator headcount — apply least-privilege profiles for day-to-day work." if len(admin_users) > 5 else None,
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-SEC-007", name="Password Minimum Length",
            domain="Security", api_surface="REST API",
            risk="critical" if (min_pwd_len and min_pwd_len < 8) else ("medium" if (min_pwd_len and min_pwd_len < 10) else "low"),
            status="critical" if (min_pwd_len and min_pwd_len < 8) else ("warning" if (min_pwd_len and min_pwd_len < 10) else "passed"),
            value=min_pwd_len,
            details=f"Password minimum length: {min_pwd_len} characters. Complexity: {complexity}. Expiration: {expiration}.",
            recommendation="Set minimum password length to at least 10 characters and enforce uppercase + numeric + special characters." if (min_pwd_len and min_pwd_len < 10) else None,
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-SEC-008", name="Login Lockout Policy",
            domain="Security", api_surface="REST API",
            risk="medium" if (not max_attempts or max_attempts > 10) else "low",
            status="warning" if (not max_attempts or max_attempts > 10) else "passed",
            value=max_attempts,
            details=f"Max login attempts before account lockout: {max_attempts or 'Not configured'}.",
            recommendation="Configure account lockout after no more than 5 failed login attempts to reduce brute-force risk." if (not max_attempts or max_attempts > 10) else None,
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-SEC-009", name="Chatter / Communities Status",
            domain="Security", api_surface="REST API",
            risk="low", status="info",
            details=f"Chatter enabled: {'Yes' if chatter_enabled else 'No'}.",
        ))

        # ── Step 22: Apex Code Patterns ───────────────────────────────────────
        step(STEPS[22], 22)
        apex_sizes  = client.get_apex_class_sizes() if request.include_apex else []
        async_jobs  = client.get_async_apex_jobs()  if request.include_apex else []

        large_classes   = [c for c in apex_sizes if c.get("LengthWithoutComments", 0) > 10_000]
        very_large      = [c for c in apex_sizes if c.get("LengthWithoutComments", 0) > 30_000]
        old_api_classes = [c for c in apex_sizes if float(c.get("ApiVersion") or "99") < 40.0]
        total_apex_lines = sum(c.get("LengthWithoutComments", 0) for c in apex_sizes)

        test_classes     = [c for c in apex_classes if "test" in c.get("Name", "").lower()]
        test_ratio       = round(len(test_classes) / max(len(apex_classes), 1) * 100, 1)

        batch_jobs    = [j for j in async_jobs if j.get("JobType") == "BatchApex"]
        sched_async   = [j for j in async_jobs if j.get("JobType") == "ScheduledApex"]
        queueable     = [j for j in async_jobs if j.get("JobType") == "Queueable"]
        future_jobs   = [j for j in async_jobs if j.get("JobType") == "Future"]

        checks.append(SalesforceCheckResult(
            check_id="SF-APX-005", name="Large Apex Classes (>10k chars)",
            domain="Apex Code", api_surface="Tooling API",
            risk="medium" if very_large else "low",
            status="warning" if len(very_large) > 5 else ("info" if large_classes else "passed"),
            count=len(large_classes),
            details=f"{len(large_classes)} classes >10,000 chars ({len(very_large)} >30,000 chars). Total Apex: ~{total_apex_lines:,} chars.",
            recommendation="Refactor very large Apex classes into smaller, focused components using separation of concerns." if very_large else None,
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-APX-006", name="Apex Classes on Old API Versions (<v40)",
            domain="Apex Code", api_surface="Tooling API",
            risk="medium" if old_api_classes else "low",
            status="warning" if old_api_classes else "passed",
            count=len(old_api_classes),
            details=f"{len(old_api_classes)} Apex classes using API version < 40.0 (pre-Summer '17) — may rely on deprecated behaviour.",
            recommendation="Update legacy Apex classes to the current API version to avoid deprecated governor limits and behaviour." if old_api_classes else None,
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-APX-007", name="Test Class Ratio",
            domain="Apex Code", api_surface="Tooling API",
            risk="medium" if test_ratio < 20 else "low",
            status="warning" if test_ratio < 20 else "passed",
            value=test_ratio,
            count=len(test_classes),
            details=f"{len(test_classes)} test classes of {len(apex_classes)} total ({test_ratio}%).",
            recommendation="Increase test class count. Aim for at least 25% of Apex classes to be test classes." if test_ratio < 20 else None,
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-APX-008", name="Async Apex Job History (30 days)",
            domain="Apex Code", api_surface="Tooling API",
            risk="low", status="info",
            count=len(async_jobs),
            details=f"Last 30 days: {len(async_jobs)} async jobs — {len(batch_jobs)} batch, {len(sched_async)} scheduled, {len(queueable)} queueable, {len(future_jobs)} future.",
        ))

        # ── Step 23: External Objects & CDC ───────────────────────────────────
        step(STEPS[23], 23)
        external_objs = client.get_external_objects()
        cdc_objs      = client.get_change_data_capture_objects()

        checks.append(SalesforceCheckResult(
            check_id="SF-DM-003", name="External Objects (Salesforce Connect)",
            domain="Data Model", api_surface="Metadata API",
            risk="low", status="info", count=len(external_objs),
            details=f"{len(external_objs)} external objects (__x) defined via Salesforce Connect.",
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-DM-004", name="Change Data Capture Objects",
            domain="Data Model", api_surface="Metadata API",
            risk="low", status="info", count=len(cdc_objs),
            details=f"{len(cdc_objs)} Change Data Capture event objects (__ChangeEvent) enabled.",
        ))

        # ── Step 24: UI Components ────────────────────────────────────────────
        step(STEPS[24], 24)
        vf_pages        = client.get_visualforce_pages()
        vf_components   = client.get_visualforce_components()
        aura_comps      = client.get_aura_components()
        lwc_bundles     = client.get_lwc_bundles()
        static_res      = client.get_static_resources()
        email_templates = client.get_email_templates()
        lightning_pages = client.get_lightning_pages()
        custom_labels   = client.get_custom_labels()

        lp_types: Dict[str, int] = {}
        for lp in lightning_pages:
            t = lp.get("Type", "Unknown")
            lp_types[t] = lp_types.get(t, 0) + 1

        large_static = [r for r in static_res if r.get("BodyLength", 0) > 500_000]
        inactive_et  = [t for t in email_templates if not t.get("IsActive", True)]

        checks.append(SalesforceCheckResult(
            check_id="SF-UI-001", name="Visualforce Pages",
            domain="UI Components", api_surface="Tooling API",
            risk="medium" if len(vf_pages) > 100 else "low",
            status="warning" if len(vf_pages) > 100 else "info",
            count=len(vf_pages),
            details=f"{len(vf_pages)} Visualforce pages. Consider migrating to LWC for better performance.",
            recommendation="Audit Visualforce pages and migrate heavily-used ones to Lightning Web Components." if len(vf_pages) > 100 else None,
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-UI-002", name="Aura Components",
            domain="UI Components", api_surface="Tooling API",
            risk="low", status="info", count=len(aura_comps),
            details=f"{len(aura_comps)} Aura component bundles. {len(lwc_bundles)} Lightning Web Components.",
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-UI-003", name="Lightning Web Components (LWC)",
            domain="UI Components", api_surface="Tooling API",
            risk="low", status="passed" if lwc_bundles else "info",
            count=len(lwc_bundles),
            details=f"{len(lwc_bundles)} LWC bundles deployed.",
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-UI-004", name="Lightning Pages (FlexiPage)",
            domain="UI Components", api_surface="Tooling API",
            risk="low", status="info", count=len(lightning_pages),
            details=f"{len(lightning_pages)} Lightning pages. Types: {dict(list(sorted(lp_types.items(), key=lambda x: -x[1])[:5]))}.",
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-UI-005", name="Static Resources (large files)",
            domain="UI Components", api_surface="Tooling API",
            risk="medium" if large_static else "low",
            status="warning" if large_static else "info",
            count=len(static_res),
            details=f"{len(static_res)} static resources ({len(large_static)} over 500 KB).",
            recommendation="Move large static resources (>500 KB) to a CDN or external host to improve page load times." if large_static else None,
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-UI-006", name="Email Templates",
            domain="UI Components", api_surface="REST API",
            risk="low", status="info", count=len(email_templates),
            details=f"{len(email_templates)} email templates ({len(inactive_et)} inactive).",
        ))

        # ── Step 25: Field Schema Deep Scan ───────────────────────────────────
        step(STEPS[25], 25)
        formula_fields   = client.get_formula_fields()
        encrypted_fields = client.get_encrypted_fields()
        ext_id_fields    = client.get_external_id_fields()
        rollup_fields    = client.get_rollup_summary_fields()
        lookup_fields    = client.get_lookup_fields()
        geo_fields       = client.get_geolocation_fields()
        big_objects      = client.get_big_objects()
        field_sets       = client.get_field_sets()
        picklist_fields  = client.get_picklist_fields()
        mp_fields        = client.get_multi_picklist_fields()

        checks.append(SalesforceCheckResult(
            check_id="SF-SCH-001", name="Formula Fields",
            domain="Field Schema", api_surface="Tooling API",
            risk="medium" if len(formula_fields) > 500 else "low",
            status="warning" if len(formula_fields) > 500 else "info",
            count=len(formula_fields),
            details=f"{len(formula_fields)} formula fields across all objects.",
            recommendation="Excessive formula fields increase CPU governor limit exposure. Consider replacing with Apex triggers for complex calculations." if len(formula_fields) > 500 else None,
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-SCH-002", name="Encrypted Fields",
            domain="Field Schema", api_surface="Tooling API",
            risk="low", status="info", count=len(encrypted_fields),
            details=f"{len(encrypted_fields)} encrypted fields (Classic Encryption). Consider upgrading to Shield Platform Encryption.",
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-SCH-003", name="External ID Fields",
            domain="Field Schema", api_surface="Tooling API",
            risk="low", status="info", count=len(ext_id_fields),
            details=f"{len(ext_id_fields)} external ID fields — used for upsert operations and integration keys.",
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-SCH-004", name="Rollup Summary Fields",
            domain="Field Schema", api_surface="Tooling API",
            risk="medium" if len(rollup_fields) > 50 else "low",
            status="warning" if len(rollup_fields) > 50 else "info",
            count=len(rollup_fields),
            details=f"{len(rollup_fields)} rollup summary fields. Large numbers can slow DML operations on parent records.",
            recommendation="Review rollup summary fields — consider Apex-based aggregation for high-DML parent objects." if len(rollup_fields) > 50 else None,
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-SCH-005", name="Relationship Fields (Lookup / MasterDetail)",
            domain="Field Schema", api_surface="Tooling API",
            risk="low", status="info", count=len(lookup_fields),
            details=f"{len(lookup_fields)} lookup/master-detail/hierarchy relationship fields defined.",
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-SCH-006", name="Geolocation Fields",
            domain="Field Schema", api_surface="Tooling API",
            risk="low", status="info", count=len(geo_fields),
            details=f"{len(geo_fields)} geolocation (compound) fields.",
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-SCH-007", name="Big Objects",
            domain="Field Schema", api_surface="Metadata API",
            risk="low", status="info", count=len(big_objects),
            details=f"{len(big_objects)} Big Objects (__b) defined.",
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-SCH-008", name="Field Sets",
            domain="Field Schema", api_surface="Tooling API",
            risk="low", status="info", count=len(field_sets),
            details=f"{len(field_sets)} field sets defined.",
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-SCH-009", name="Picklist Fields",
            domain="Field Schema", api_surface="Tooling API",
            risk="medium" if len(picklist_fields) > 1000 else "low",
            status="warning" if len(picklist_fields) > 1000 else "info",
            count=len(picklist_fields),
            details=f"{len(picklist_fields)} custom picklist fields. {len(mp_fields)} multi-select picklist fields. Excessive picklist fields increase deploy complexity.",
        ))

        # ── Step 26: Automation Deep Dive ─────────────────────────────────────
        step(STEPS[26], 26)
        approval_procs   = client.get_approval_processes()
        email_alerts     = client.get_email_alerts()
        wf_field_updates = client.get_workflow_field_updates()
        outbound_msgs    = client.get_outbound_messages()
        esc_rules        = client.get_escalation_rules()
        entitlement_proc = client.get_entitlement_processes()
        macro_count      = client.get_macro_count()
        quick_text_count = client.get_quick_text_count()

        checks.append(SalesforceCheckResult(
            check_id="SF-AUT-008", name="Approval Processes",
            domain="Automation", api_surface="Tooling API",
            risk="low", status="info", count=len(approval_procs),
            details=f"{len(approval_procs)} approval processes defined.",
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-AUT-009", name="Workflow Email Alerts",
            domain="Automation", api_surface="Tooling API",
            risk="medium" if len(email_alerts) > 200 else "low",
            status="warning" if len(email_alerts) > 200 else "info",
            count=len(email_alerts),
            details=f"{len(email_alerts)} workflow email alerts. {len(wf_field_updates)} workflow field updates.",
            recommendation="Consolidate workflow actions — consider migrating to Flow to centralise automation." if len(email_alerts) > 200 else None,
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-AUT-010", name="Outbound Messages",
            domain="Automation", api_surface="Tooling API",
            risk="medium" if outbound_msgs else "low",
            status="warning" if outbound_msgs else "info",
            count=len(outbound_msgs),
            details=f"{len(outbound_msgs)} outbound messages (legacy SOAP integration mechanism). Consider replacing with REST-based Platform Events.",
            recommendation="Replace outbound messages with Platform Events or REST callouts (Outbound Messages are legacy)." if outbound_msgs else None,
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-AUT-011", name="Escalation & Entitlement Rules",
            domain="Automation", api_surface="Tooling API",
            risk="low", status="info",
            count=len(esc_rules),
            details=f"{len(esc_rules)} escalation rules, {len(entitlement_proc)} entitlement processes, {macro_count} macros, {quick_text_count} Quick Text records.",
        ))

        # ── Step 27: Security Depth ───────────────────────────────────────────
        step(STEPS[27], 27)
        perm_set_groups   = client.get_permission_set_groups()
        custom_perms      = client.get_custom_permissions()
        auth_providers    = client.get_auth_providers()
        certs             = client.get_certificates()
        mfa_count         = client.get_mfa_user_count()
        public_groups     = client.get_public_groups()
        audit_trail       = client.get_setup_audit_trail()
        trusted_ips       = client.get_trusted_ip_ranges()
        remote_sites      = client.get_remote_site_settings()
        cors_entries      = client.get_cors_whitelist()
        csp_sites         = client.get_csp_trusted_sites()
        expired_certs     = client.get_expired_certificates()
        modify_all_perms  = client.get_object_permissions_with_modify_all()
        risky_perm_sets   = client.get_risky_system_permissions()

        checks.append(SalesforceCheckResult(
            check_id="SF-SEC-010", name="Permission Set Groups",
            domain="Security", api_surface="REST API",
            risk="low", status="info", count=len(perm_set_groups),
            details=f"{len(perm_set_groups)} permission set groups and {len(custom_perms)} custom permissions defined.",
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-SEC-011", name="MFA-Enrolled Users",
            domain="Security", api_surface="REST API",
            risk="high" if mfa_count == 0 and len(active_users) > 0 else "low",
            status="warning" if mfa_count == 0 and len(active_users) > 0 else "passed",
            count=mfa_count,
            details=f"{mfa_count} users have MFA (TOTP/U2F/WebAuthn) enrolled.",
            recommendation="Enforce MFA for all users — Salesforce has mandated MFA for all platform users." if mfa_count == 0 else None,
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-SEC-012", name="Auth Providers & Certificates",
            domain="Security", api_surface="REST API",
            risk="low", status="info", count=len(auth_providers),
            details=f"{len(auth_providers)} auth providers, {len(certs)} certificates.",
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-SEC-013", name="Expiring Certificates (within 90 days)",
            domain="Security", api_surface="REST API",
            risk="critical" if expired_certs else "low",
            status="critical" if expired_certs else "passed",
            count=len(expired_certs),
            details=f"{len(expired_certs)} certificates expiring within 90 days or already expired.",
            recommendation="Renew expiring certificates immediately to prevent integration authentication failures." if expired_certs else None,
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-SEC-014", name="Remote Sites & CORS/CSP Entries",
            domain="Security", api_surface="Tooling API",
            risk="medium" if len(remote_sites) > 50 else "low",
            status="warning" if len(remote_sites) > 50 else "info",
            count=len(remote_sites),
            details=f"{len(remote_sites)} remote site settings, {len(cors_entries)} CORS origins, {len(csp_sites)} CSP trusted sites.",
            recommendation="Audit remote site settings — remove stale entries to reduce the attack surface." if len(remote_sites) > 50 else None,
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-SEC-015", name="Modify-All Permission Set Assignments",
            domain="Security", api_surface="REST API",
            risk="high" if len(modify_all_perms) > 10 else ("medium" if modify_all_perms else "low"),
            status="warning" if modify_all_perms else "passed",
            count=len(modify_all_perms),
            details=f"{len(modify_all_perms)} non-profile permission sets grant Modify All Records on at least one object.",
            recommendation="Apply least-privilege — replace Modify All Records with object/field-level security scoped to required objects only." if modify_all_perms else None,
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-SEC-016", name="Risky Permission Sets (Modify All Data)",
            domain="Security", api_surface="REST API",
            risk="critical" if len(risky_perm_sets) > 5 else ("high" if risky_perm_sets else "low"),
            status="critical" if len(risky_perm_sets) > 5 else ("warning" if risky_perm_sets else "passed"),
            count=len(risky_perm_sets),
            details=f"{len(risky_perm_sets)} non-profile permission sets have Modify All Data or View All Data.",
            recommendation="Restrict Modify All Data / View All Data to System Administrator profiles only." if risky_perm_sets else None,
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-SEC-017", name="Trusted IP Ranges",
            domain="Security", api_surface="REST API",
            risk="low", status="info", count=len(trusted_ips),
            details=f"{len(trusted_ips)} trusted IP ranges configured. {len(audit_trail)} recent setup audit trail entries.",
        ))

        # ── Step 28: Integration Extended ─────────────────────────────────────
        step(STEPS[28], 28)
        external_services   = client.get_external_services()
        streaming_channels  = client.get_streaming_channels()
        push_topics         = client.get_push_topics()
        event_bus_members   = client.get_event_bus_members()
        oauth_token_count   = client.get_oauth_token_count()

        active_push_topics  = [pt for pt in push_topics if pt.get("IsActive")]

        checks.append(SalesforceCheckResult(
            check_id="SF-INT-004", name="External Services (OpenAPI Integrations)",
            domain="Integrations", api_surface="Tooling API",
            risk="low", status="info", count=len(external_services),
            details=f"{len(external_services)} external services registered via OpenAPI spec.",
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-INT-005", name="Streaming Channels & Push Topics",
            domain="Integrations", api_surface="REST API",
            risk="low", status="info", count=len(streaming_channels),
            details=f"{len(streaming_channels)} streaming channels, {len(push_topics)} push topics ({len(active_push_topics)} active), {len(event_bus_members)} platform event subscriptions.",
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-INT-006", name="Active OAuth Tokens",
            domain="Integrations", api_surface="REST API",
            risk="medium" if oauth_token_count > 500 else "low",
            status="warning" if oauth_token_count > 500 else "info",
            count=oauth_token_count,
            details=f"{oauth_token_count} active OAuth tokens. Large numbers may indicate stale integration sessions.",
            recommendation="Audit active OAuth tokens — revoke tokens for retired integrations." if oauth_token_count > 500 else None,
        ))

        # ── Step 29: Reporting Extended ───────────────────────────────────────
        step(STEPS[29], 29)
        report_folders    = client.get_report_folders()
        dashboard_folders = client.get_dashboard_folders()
        doc_folders       = client.get_document_folders()
        db_component_count = client.get_dashboard_component_count()
        sharing_summary   = client.get_sharing_settings_summary()

        checks.append(SalesforceCheckResult(
            check_id="SF-ANA-003", name="Report & Dashboard Folders",
            domain="Analytics", api_surface="REST API",
            risk="low", status="info",
            count=len(report_folders),
            details=f"{len(report_folders)} report folders, {len(dashboard_folders)} dashboard folders, {len(doc_folders)} document folders.",
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-ANA-004", name="Dashboard Component Count",
            domain="Analytics", api_surface="REST API",
            risk="medium" if db_component_count > 500 else "low",
            status="warning" if db_component_count > 500 else "info",
            count=db_component_count,
            details=f"{db_component_count} dashboard components total.",
            recommendation="Archive unused dashboards and components — excess components increase page render time." if db_component_count > 500 else None,
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-ANA-005", name="Sharing Rules",
            domain="Analytics", api_surface="REST API",
            risk="medium" if sharing_summary.get("total", 0) > 100 else "low",
            status="warning" if sharing_summary.get("total", 0) > 100 else "info",
            count=sharing_summary.get("total", 0),
            details=f"Sharing rules: {sharing_summary.get('criteria_based_count', 0)} criteria-based, {sharing_summary.get('owner_based_count', 0)} owner-based.",
            recommendation="Excessive sharing rules degrade sharing recalculation performance. Evaluate role hierarchy alternatives." if sharing_summary.get("total", 0) > 100 else None,
        ))

        # ── Step 30: Operations Monitoring ────────────────────────────────────
        step(STEPS[30], 30)
        event_log_files   = client.get_event_log_files()
        apex_log_count    = client.get_apex_log_count()
        apex_log_size_mb  = client.get_apex_log_size_mb()
        flow_errors       = client.get_flow_interview_errors()
        apex_failures     = client.get_apex_job_failures_30d()
        batch_summary     = client.get_batch_job_summary()
        gov_events        = client.get_governor_event_count()
        debug_flags       = client.get_debug_log_retention()

        checks.append(SalesforceCheckResult(
            check_id="SF-OPS-004", name="Apex Debug Log Accumulation",
            domain="Operations", api_surface="Tooling API",
            risk="medium" if apex_log_count > 500 or apex_log_size_mb > 100 else "low",
            status="warning" if apex_log_count > 500 else "info",
            count=apex_log_count,
            value=apex_log_size_mb,
            details=f"{apex_log_count} Apex debug logs consuming ~{apex_log_size_mb:.1f} MB. {len(debug_flags)} active trace flags.",
            recommendation="Clear stale debug logs and deactivate trace flags not in use — they consume storage and may slow dev tools." if apex_log_count > 500 else None,
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-OPS-005", name="Flow Interview Errors",
            domain="Operations", api_surface="Tooling API",
            risk="high" if len(flow_errors) > 10 else ("medium" if flow_errors else "low"),
            status="critical" if len(flow_errors) > 50 else ("warning" if flow_errors else "passed"),
            count=len(flow_errors),
            details=f"{len(flow_errors)} flow interviews in Error status.",
            recommendation="Investigate errored flow interviews — check fault connectors and governor limits in affected flows." if flow_errors else None,
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-OPS-006", name="Async Apex Job Failures (30 days)",
            domain="Operations", api_surface="Tooling API",
            risk="high" if len(apex_failures) > 10 else ("medium" if apex_failures else "low"),
            status="warning" if apex_failures else "passed",
            count=len(apex_failures),
            details=f"{len(apex_failures)} Apex async jobs failed in the last 30 days.",
            recommendation="Investigate failed Apex jobs — check ExtendedStatus for root causes and add retry logic." if apex_failures else None,
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-OPS-007", name="Event Log Files (7 days)",
            domain="Operations", api_surface="REST API",
            risk="low", status="info", count=len(event_log_files),
            details=f"{len(event_log_files)} Event Log Files in the last 7 days. Governor limit events (ApexExecution): {gov_events}.",
        ))

        # ── Step 31: Data Quality Extended ────────────────────────────────────
        step(STEPS[31], 31)
        history_objs      = client.get_history_enabled_objects()
        feed_objs         = client.get_feed_enabled_objects()
        fh_tracking_count = client.get_field_history_tracking_count()
        data_class_count  = client.get_data_classification_count()
        language_settings = client.get_language_settings()
        login_flow_count  = client.get_login_flow_count()

        checks.append(SalesforceCheckResult(
            check_id="SF-DQ-001", name="History Tracking (Field-Level)",
            domain="Data Quality", api_surface="Metadata API",
            risk="low", status="info", count=len(history_objs),
            details=f"{len(history_objs)} objects with field history tracking. {fh_tracking_count} individual fields tracked. {data_class_count} fields with data classification labels.",
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-DQ-002", name="Chatter Feed-Enabled Objects",
            domain="Data Quality", api_surface="Metadata API",
            risk="low", status="info", count=len(feed_objs),
            details=f"{len(feed_objs)} objects with Chatter feed enabled.",
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-DQ-003", name="Multi-select Picklist Fields",
            domain="Data Quality", api_surface="Tooling API",
            risk="medium" if len(mp_fields) > 50 else "low",
            status="warning" if len(mp_fields) > 50 else "info",
            count=len(mp_fields),
            details=f"{len(mp_fields)} multi-select picklist (MSP) fields. MSP fields cannot be used in SOQL GROUP BY and hamper reporting.",
            recommendation="Minimise multi-select picklist usage — these fields cannot be aggregated in reports and create data quality issues." if len(mp_fields) > 50 else None,
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-DQ-004", name="Org Language & Localisation Settings",
            domain="Data Quality", api_surface="REST API",
            risk="low", status="info", count=len(language_settings),
            details=f"{len(language_settings)} active translation languages enabled. Login flows: {login_flow_count}.",
        ))

        # ── Step 32: Experience Cloud & Content ───────────────────────────────
        step(STEPS[32], 32)
        experience_sites     = client.get_experience_sites()
        chatter_groups       = client.get_chatter_groups()
        content_doc_count    = client.get_content_document_count()
        content_ver_count    = client.get_content_version_count()
        knowledge_count      = client.get_knowledge_article_count()
        document_count       = client.get_document_count()

        active_sites   = [s for s in experience_sites if s.get("Status") == "Live"]
        large_cg       = [g for g in chatter_groups if g.get("MemberCount", 0) > 500]

        checks.append(SalesforceCheckResult(
            check_id="SF-EXP-001", name="Experience Cloud Sites",
            domain="Experience Cloud", api_surface="REST API",
            risk="medium" if len(active_sites) > 5 else "low",
            status="info", count=len(experience_sites),
            details=f"{len(experience_sites)} sites total ({len(active_sites)} live).",
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-EXP-002", name="Chatter Groups",
            domain="Experience Cloud", api_surface="REST API",
            risk="low", status="info", count=len(chatter_groups),
            details=f"{len(chatter_groups)} Chatter groups ({len(large_cg)} with >500 members).",
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-EXP-003", name="Content & Files Storage",
            domain="Experience Cloud", api_surface="REST API",
            risk="medium" if content_doc_count > 50_000 else "low",
            status="warning" if content_doc_count > 50_000 else "info",
            count=content_doc_count,
            details=f"{content_doc_count:,} ContentDocuments ({content_ver_count:,} latest versions). {document_count:,} legacy documents.",
            recommendation="Implement a content archival strategy — large file counts impact storage quotas and search performance." if content_doc_count > 50_000 else None,
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-EXP-004", name="Knowledge Articles (Published)",
            domain="Experience Cloud", api_surface="REST API",
            risk="low", status="info", count=knowledge_count,
            details=f"{knowledge_count:,} published Knowledge articles.",
        ))

        # ── Step 33: Business Objects ─────────────────────────────────────────
        step(STEPS[33], 33)
        price_books       = client.get_price_books()
        active_products   = client.get_active_products()
        opp_stages        = client.get_opportunity_stages()
        case_statuses     = client.get_case_statuses()
        sales_processes   = client.get_sales_processes()
        fiscal_settings   = client.get_fiscal_year_settings()
        business_hours    = client.get_business_hours()
        territory_count   = client.get_territory_model_count()
        forecasting_types = client.get_forecasting_types()
        currency_settings = client.get_currency_settings()

        active_pbs   = [pb for pb in price_books if pb.get("IsActive")]
        closed_won   = [s for s in opp_stages if s.get("IsWon") and s.get("IsActive")]
        closed_lost  = [s for s in opp_stages if s.get("IsClosed") and not s.get("IsWon") and s.get("IsActive")]

        checks.append(SalesforceCheckResult(
            check_id="SF-BIZ-001", name="Price Books & Products",
            domain="Business Objects", api_surface="REST API",
            risk="low", status="info", count=len(price_books),
            details=f"{len(price_books)} price books ({len(active_pbs)} active), {len(active_products):,} active products.",
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-BIZ-002", name="Opportunity Stages",
            domain="Business Objects", api_surface="REST API",
            risk="medium" if len(opp_stages) > 15 else "low",
            status="warning" if len(opp_stages) > 15 else "passed",
            count=len(opp_stages),
            details=f"{len(opp_stages)} opportunity stages ({len(closed_won)} closed-won, {len(closed_lost)} closed-lost). {len(sales_processes)} sales processes.",
            recommendation="Simplify opportunity stages — too many stages create reporting complexity and user friction." if len(opp_stages) > 15 else None,
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-BIZ-003", name="Case Statuses",
            domain="Business Objects", api_surface="REST API",
            risk="low", status="info", count=len(case_statuses),
            details=f"{len(case_statuses)} case statuses.",
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-BIZ-004", name="Territory Management & Forecasting",
            domain="Business Objects", api_surface="REST API",
            risk="low", status="info", count=territory_count,
            details=f"{territory_count} Enterprise Territory Management models. {len(forecasting_types)} forecasting types. {len(currency_settings)} active currencies. Custom fiscal year: {'Yes' if not fiscal_settings.get('IsStandardYear') else 'No'}.",
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-BIZ-005", name="Business Hours Configurations",
            domain="Business Objects", api_surface="REST API",
            risk="low", status="info", count=len(business_hours),
            details=f"{len(business_hours)} business hours configurations.",
        ))

        # ── Step 34: Score ────────────────────────────────────────────────────
        step(STEPS[34], 34)
        domain_summaries = _compute_domain_summaries(checks)
        overall_score    = _compute_overall_score(checks)

        # ── Inventory lists ───────────────────────────────────────────────────
        apex_inv_src = apex_sizes if apex_sizes else apex_classes
        apex_inventory = [{
            "name":        c.get("Name", ""),
            "status":      c.get("Status", ""),
            "is_valid":    c.get("IsValid", True),
            "length":      c.get("LengthWithoutComments", 0),
            "api_version": str(c.get("ApiVersion", "")),
        } for c in apex_inv_src[:500]]

        flow_inventory = [{
            "label":          f.get("MasterLabel", ""),
            "type":           f.get("ProcessType", ""),
            "status":         f.get("Status", ""),
            "version":        f.get("VersionNumber", ""),
            "trigger_type":   f.get("TriggerType", ""),
            "trigger_object": f.get("TriggerObjectOrEventApiName", ""),
            "api_version":    str(f.get("ApiVersion", "")),
        } for f in all_flow_versions[:500]]

        user_inventory = [{
            "name":       u.get("Name", ""),
            "username":   u.get("Username", ""),
            "profile":    (u.get("Profile") or {}).get("Name", ""),
            "user_type":  u.get("UserType", ""),
            "last_login": str(u.get("LastLoginDate") or "Never"),
            "is_active":  u.get("IsActive", True),
        } for u in active_users[:300]]

        pkg_inventory = [{
            "name":      ((p.get("SubscriberPackage") or {}).get("Name") or ""),
            "namespace": ((p.get("SubscriberPackage") or {}).get("NamespacePrefix") or ""),
            "major":     ((p.get("SubscriberPackageVersion") or {}).get("MajorVersion") or ""),
            "minor":     ((p.get("SubscriberPackageVersion") or {}).get("MinorVersion") or ""),
        } for p in packages]

        lic_inventory = [{
            "name":  l.get("Name", ""),
            "key":   l.get("LicenseDefinitionKey", ""),
            "total": l.get("TotalLicenses", 0),
            "used":  l.get("UsedLicenses", 0),
        } for l in user_licenses]

        sched_inventory = [{
            "name":      ((j.get("CronJobDetail") or {}).get("Name") or ""),
            "type":      j.get("JobType", ""),
            "state":     j.get("State", ""),
            "next_fire": str(j.get("NextFireTime") or ""),
        } for j in scheduled_jobs]

        vf_inv = [{
            "name":        p.get("Name", ""),
            "label":       p.get("MasterLabel", ""),
            "api_version": str(p.get("ApiVersion", "")),
            "mobile":      p.get("IsAvailableInTouch", False),
        } for p in vf_pages[:300]]

        lwc_inv = [{
            "name":        b.get("DeveloperName", ""),
            "label":       b.get("MasterLabel", ""),
            "api_version": str(b.get("ApiVersion", "")),
        } for b in lwc_bundles[:300]]

        approval_inv = [{
            "name":   a.get("DeveloperName", ""),
            "object": a.get("TableEnumOrId", ""),
            "state":  a.get("State", ""),
        } for a in approval_procs[:200]]

        exp_site_inv = [{
            "name":   s.get("Name", ""),
            "status": s.get("Status", ""),
            "type":   s.get("Type", ""),
            "url":    s.get("UrlPathPrefix", ""),
        } for s in experience_sites]

        product_inv = [{
            "name":   p.get("Name", ""),
            "code":   p.get("ProductCode", ""),
            "family": p.get("Family", ""),
        } for p in active_products[:200]]

        result = SalesforceAssessmentResult(
            job_id=job_id,
            status="completed",
            instance_url=client.instance_url or request.credentials.instance_url or "",
            org_name=org_name,
            org_id=org.get("Id"),
            org_type=org_type,
            sf_version=request.credentials.api_version,
            total_checks=len(checks),
            critical_findings=sum(1 for c in checks if c.status == "critical"),
            high_findings=sum(1 for c in checks if c.status == "warning" and c.risk == "high"),
            medium_findings=sum(1 for c in checks if c.risk == "medium"),
            low_findings=sum(1 for c in checks if c.risk == "low"),
            overall_score=overall_score,
            # sObject inventory
            custom_object_count=custom_count,
            standard_object_count=standard_count,
            total_field_count=total_custom_fields,
            validation_rule_count=len(active_vr),
            record_type_count=len(record_types),
            page_layout_count=len(page_layouts),
            custom_metadata_type_count=len(cmt_types),
            custom_setting_count=len(custom_settings),
            external_object_count=len(external_objs),
            cdc_event_count=len(cdc_objs),
            # Apex
            apex_class_count=len(apex_classes),
            trigger_count=len(apex_triggers),
            total_apex_lines=total_apex_lines,
            # Automation
            flow_count=len(flows),
            active_flow_count=len(active_flows),
            workflow_rule_count=len(wf_rules),
            duplicate_rule_count=len(dup_rules),
            assignment_rule_count=len(assign_rules),
            # Security
            active_user_count=len(active_users),
            inactive_user_count=len(inactive_users),
            profile_count=len(profiles),
            permission_set_count=len(perm_sets),
            role_count=len(roles),
            admin_user_count=len(admin_users),
            # Bulk & Analytics
            bulk_job_count=len(bulk_ingest),
            report_count=len(reports),
            dashboard_count=len(dashboards),
            # Integrations
            connected_app_count=len(connected_apps),
            named_credential_count=len(named_creds),
            platform_event_count=len(platform_events),
            installed_package_count=len(packages),
            # Operations
            scheduled_job_count=len(scheduled_jobs),
            queue_count=len(queues),
            email_service_count=len(email_services),
            # Licenses & limits
            user_license_count=len(user_licenses),
            api_usage_pct=api_pct,
            data_storage_mb=data_used,
            file_storage_mb=file_used,
            # UI Components
            vf_page_count=len(vf_pages),
            vf_component_count=len(vf_components),
            aura_component_count=len(aura_comps),
            lwc_bundle_count=len(lwc_bundles),
            static_resource_count=len(static_res),
            email_template_count=len(email_templates),
            lightning_page_count=len(lightning_pages),
            custom_label_count=len(custom_labels),
            # Field Schema
            formula_field_count=len(formula_fields),
            encrypted_field_count=len(encrypted_fields),
            external_id_field_count=len(ext_id_fields),
            rollup_summary_field_count=len(rollup_fields),
            lookup_field_count=len(lookup_fields),
            picklist_field_count=len(picklist_fields),
            multi_picklist_field_count=len(mp_fields),
            history_enabled_obj_count=len(history_objs),
            feed_enabled_obj_count=len(feed_objs),
            # Security Deep
            permission_set_group_count=len(perm_set_groups),
            auth_provider_count=len(auth_providers),
            mfa_user_count=mfa_count,
            public_group_count=len(public_groups),
            custom_permission_count=len(custom_perms),
            trusted_ip_range_count=len(trusted_ips),
            remote_site_count=len(remote_sites),
            # Automation Deep
            approval_process_count=len(approval_procs),
            email_alert_count=len(email_alerts),
            workflow_field_update_count=len(wf_field_updates),
            outbound_message_count=len(outbound_msgs),
            escalation_rule_count=len(esc_rules),
            # Integration Extended
            external_service_count=len(external_services),
            push_topic_count=len(push_topics),
            streaming_channel_count=len(streaming_channels),
            # Reporting Extended
            report_folder_count=len(report_folders),
            dashboard_folder_count=len(dashboard_folders),
            dashboard_component_count=db_component_count,
            # Operations Monitoring
            apex_log_count=apex_log_count,
            apex_log_size_mb=apex_log_size_mb,
            flow_interview_error_count=len(flow_errors),
            event_log_file_count=len(event_log_files),
            # Experience Cloud
            experience_site_count=len(experience_sites),
            chatter_group_count=len(chatter_groups),
            content_document_count=content_doc_count,
            knowledge_article_count=knowledge_count,
            # Business Objects
            price_book_count=len(price_books),
            active_product_count=len(active_products),
            opportunity_stage_count=len(opp_stages),
            case_status_count=len(case_statuses),
            territory_model_count=territory_count,
            # Inventory lists
            apex_inventory=apex_inventory,
            flow_inventory=flow_inventory,
            user_inventory=user_inventory,
            package_inventory=pkg_inventory,
            user_license_inventory=lic_inventory,
            scheduled_job_inventory=sched_inventory,
            vf_page_inventory=vf_inv,
            lwc_inventory=lwc_inv,
            approval_process_inventory=approval_inv,
            experience_site_inventory=exp_site_inv,
            product_inventory=product_inv,
            domain_summaries=domain_summaries,
            check_results=checks,
            completed_at=datetime.now(timezone.utc).isoformat(),
            duration_seconds=round(time.time() - start, 2),
        )

        _update(
            job_id,
            status="completed",
            result=result.model_dump(),
            completed_at=result.completed_at,
            duration_seconds=result.duration_seconds,
            progress_message=f"Complete — {overall_score:.0f}/100 ({len(checks)} checks across 20 domains)",
            checks_completed=len(STEPS),
        )

    except Exception as exc:
        logger.error("Salesforce assessment %s failed: %s", job_id, exc, exc_info=True)
        _update(
            job_id,
            status="failed",
            error=str(exc),
            completed_at=datetime.now(timezone.utc).isoformat(),
        )


# ── Scoring helpers ───────────────────────────────────────────────────────────

def _compute_overall_score(checks: List[SalesforceCheckResult]) -> float:
    """Weighted score: critical=−15, high=−8, medium=−3; floor 0, ceiling 100."""
    score = 100.0
    for c in checks:
        if c.status == "critical":
            score -= 15
        elif c.status == "warning":
            if c.risk == "high":
                score -= 8
            elif c.risk == "medium":
                score -= 3
    return round(max(0.0, min(100.0, score)), 1)


def _compute_domain_summaries(checks: List[SalesforceCheckResult]) -> List[SalesforceDomainSummary]:
    domain_map: Dict[str, List[SalesforceCheckResult]] = {}
    for c in checks:
        domain_map.setdefault(c.domain, []).append(c)

    summaries = []
    for domain, items in domain_map.items():
        api_surface = items[0].api_surface if items else ""
        summaries.append(SalesforceDomainSummary(
            domain=domain,
            api_surface=api_surface,
            total_checks=len(items),
            critical=sum(1 for c in items if c.status == "critical"),
            high=sum(1 for c in items if c.status == "warning" and c.risk == "high"),
            medium=sum(1 for c in items if c.risk == "medium" and c.status != "critical"),
            low=sum(1 for c in items if c.risk == "low"),
            passed=sum(1 for c in items if c.status == "passed"),
            errors=sum(1 for c in items if c.status == "error"),
            score=_compute_overall_score(items),
        ))
    return summaries


# ── Excel export ──────────────────────────────────────────────────────────────

def build_excel_report(result: dict, label: str) -> bytes:
    """
    Build a 15-sheet Excel workbook from a completed Salesforce assessment result dict.

    Sheets:
      1.  Summary            — key metrics & org identity
      2.  All Checks         — complete check table
      3.  Domain Summary     — per-domain rollup
      4.  Apex Code          — class inventory
      5.  Automation         — flow version inventory
      6.  Security           — user inventory
      7.  User Licenses      — licence type breakdown
      8.  Integrations       — packages & connected apps
      9.  Operations         — scheduled jobs
      10. Recommendations    — all actionable findings
      11. UI Components      — VF pages & LWC bundles
      12. Extended Automation— approvals, email alerts
      13. Data Quality       — field type breakdown
      14. Experience Cloud   — sites, content
      15. Business Objects   — products, price books
    """
    try:
        import openpyxl
        from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
        from openpyxl.utils import get_column_letter
    except ImportError:
        raise RuntimeError("openpyxl not installed")

    wb = openpyxl.Workbook()
    wb.remove(wb.active)

    # ── Palette ───────────────────────────────────────────────────────────────
    CLR_HEADER   = "0F766E"   # teal (matching app theme)
    CLR_CRITICAL = "DC2626"   # red
    CLR_WARNING  = "D97706"   # amber
    CLR_PASSED   = "16A34A"   # green
    CLR_INFO     = "2563EB"   # blue
    CLR_ALT      = "F0FDFA"   # very light teal
    CLR_BORDER   = "CCFBF1"

    thin = Side(style="thin", color=CLR_BORDER)
    border = Border(left=thin, right=thin, top=thin, bottom=thin)

    STATUS_FILL: Dict[str, str] = {
        "critical": CLR_CRITICAL,
        "warning":  CLR_WARNING,
        "passed":   CLR_PASSED,
        "info":     CLR_INFO,
        "error":    CLR_CRITICAL,
        "skipped":  "9CA3AF",
    }

    def _hfont() -> Font:
        return Font(bold=True, color="FFFFFF", size=10)

    def _hfill(color: str = CLR_HEADER) -> PatternFill:
        return PatternFill("solid", fgColor=color)

    def _add_sheet(
        name: str,
        headers: List[str],
        rows: List[List],
        col_widths: Optional[List[int]] = None,
        header_color: str = CLR_HEADER,
        status_col: Optional[int] = None,
    ) -> None:
        ws = wb.create_sheet(title=name[:31])
        ws.freeze_panes = "A2"

        ws.append(headers)
        ws.row_dimensions[1].height = 26
        for cell in ws[1]:
            cell.font      = _hfont()
            cell.fill      = _hfill(header_color)
            cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
            cell.border    = border

        alt_fill = PatternFill("solid", fgColor=CLR_ALT)
        for ri, row in enumerate(rows, start=2):
            safe_row = [("" if v is None else v) for v in row]
            ws.append(safe_row)
            if ri % 2 == 0:
                for cell in ws[ri]:
                    cell.fill = alt_fill
            for ci, cell in enumerate(ws[ri]):
                cell.border    = border
                cell.alignment = Alignment(vertical="center", wrap_text=False)
                # Colour status column if requested
                if status_col is not None and ci == status_col:
                    raw = str(safe_row[ci]).lower()
                    color = STATUS_FILL.get(raw)
                    if color:
                        cell.fill = PatternFill("solid", fgColor=color)
                        cell.font = Font(bold=True, color="FFFFFF", size=10)

        widths = col_widths or [22] * len(headers)
        for ci, w in enumerate(widths, start=1):
            ws.column_dimensions[get_column_letter(ci)].width = w

    checks       = result.get("check_results", [])
    domains      = result.get("domain_summaries", [])
    apex_inv     = result.get("apex_inventory", [])
    flow_inv     = result.get("flow_inventory", [])
    user_inv     = result.get("user_inventory", [])
    pkg_inv      = result.get("package_inventory", [])
    lic_inv      = result.get("user_license_inventory", [])
    sched_inv    = result.get("scheduled_job_inventory", [])
    vf_inv       = result.get("vf_page_inventory", [])
    lwc_inv      = result.get("lwc_inventory", [])
    appr_inv     = result.get("approval_process_inventory", [])
    exp_inv      = result.get("experience_site_inventory", [])
    prod_inv     = result.get("product_inventory", [])

    score_color = (
        CLR_CRITICAL if result.get("overall_score", 100) < 60 else
        CLR_WARNING  if result.get("overall_score", 100) < 80 else
        CLR_PASSED
    )

    # ── 1. Summary ────────────────────────────────────────────────────────────
    _add_sheet("Summary", ["Metric", "Value"], [
        ["Org Name",                    result.get("org_name", "")],
        ["Org Type",                    result.get("org_type", "")],
        ["Instance URL",                result.get("instance_url", "")],
        ["Salesforce API Version",      result.get("sf_version", "")],
        ["Assessment Label",            label],
        ["Completed At",                result.get("completed_at", "")],
        ["Duration (seconds)",          result.get("duration_seconds", "")],
        ["", ""],
        ["Overall Score",               f"{result.get('overall_score', 0)}/100"],
        ["Total Checks",                result.get("total_checks", 0)],
        ["Critical Findings",           result.get("critical_findings", 0)],
        ["High Findings",               result.get("high_findings", 0)],
        ["Medium Findings",             result.get("medium_findings", 0)],
        ["", ""],
        ["Custom Objects",              result.get("custom_object_count", 0)],
        ["Standard Objects",            result.get("standard_object_count", 0)],
        ["Custom Fields (sampled)",     result.get("total_field_count", 0)],
        ["Validation Rules (active)",   result.get("validation_rule_count", 0)],
        ["Record Types",                result.get("record_type_count", 0)],
        ["Page Layouts",                result.get("page_layout_count", 0)],
        ["Custom Metadata Types",       result.get("custom_metadata_type_count", 0)],
        ["Custom Settings",             result.get("custom_setting_count", 0)],
        ["External Objects",            result.get("external_object_count", 0)],
        ["CDC Event Objects",           result.get("cdc_event_count", 0)],
        ["", ""],
        ["Apex Classes",                result.get("apex_class_count", 0)],
        ["Apex Triggers",               result.get("trigger_count", 0)],
        ["Total Apex Lines (approx.)",  result.get("total_apex_lines", 0)],
        ["", ""],
        ["Active Flows",                result.get("active_flow_count", 0)],
        ["Total Flow Versions",         result.get("flow_count", 0)],
        ["Workflow Rules",              result.get("workflow_rule_count", 0)],
        ["Duplicate Rules",             result.get("duplicate_rule_count", 0)],
        ["Assignment Rules",            result.get("assignment_rule_count", 0)],
        ["", ""],
        ["Active Users",                result.get("active_user_count", 0)],
        ["Inactive Users",              result.get("inactive_user_count", 0)],
        ["System Admin Users",          result.get("admin_user_count", 0)],
        ["Profiles",                    result.get("profile_count", 0)],
        ["Permission Sets",             result.get("permission_set_count", 0)],
        ["Roles",                       result.get("role_count", 0)],
        ["", ""],
        ["Reports",                     result.get("report_count", 0)],
        ["Dashboards",                  result.get("dashboard_count", 0)],
        ["Bulk Jobs",                   result.get("bulk_job_count", 0)],
        ["Connected Apps",              result.get("connected_app_count", 0)],
        ["Named Credentials",           result.get("named_credential_count", 0)],
        ["Platform Events",             result.get("platform_event_count", 0)],
        ["Installed Packages",          result.get("installed_package_count", 0)],
        ["Scheduled Jobs",              result.get("scheduled_job_count", 0)],
        ["Queues",                      result.get("queue_count", 0)],
        ["Email Services",              result.get("email_service_count", 0)],
        ["", ""],
        ["Daily API Usage %",           f"{result.get('api_usage_pct', 0)}%"],
        ["Data Storage Used (MB)",      result.get("data_storage_mb", 0)],
        ["File Storage Used (MB)",      result.get("file_storage_mb", 0)],
        ["User License Types",          result.get("user_license_count", 0)],
        ["", ""],
        ["Visualforce Pages",           result.get("vf_page_count", 0)],
        ["Visualforce Components",      result.get("vf_component_count", 0)],
        ["Aura Components",             result.get("aura_component_count", 0)],
        ["LWC Bundles",                 result.get("lwc_bundle_count", 0)],
        ["Static Resources",            result.get("static_resource_count", 0)],
        ["Email Templates",             result.get("email_template_count", 0)],
        ["Lightning Pages",             result.get("lightning_page_count", 0)],
        ["Custom Labels",               result.get("custom_label_count", 0)],
        ["", ""],
        ["Formula Fields",              result.get("formula_field_count", 0)],
        ["Encrypted Fields",            result.get("encrypted_field_count", 0)],
        ["External ID Fields",          result.get("external_id_field_count", 0)],
        ["Rollup Summary Fields",       result.get("rollup_summary_field_count", 0)],
        ["Lookup/MasterDetail Fields",  result.get("lookup_field_count", 0)],
        ["Picklist Fields",             result.get("picklist_field_count", 0)],
        ["Multi-select Picklist Fields",result.get("multi_picklist_field_count", 0)],
        ["History-Tracked Objects",     result.get("history_enabled_obj_count", 0)],
        ["Feed-Enabled Objects",        result.get("feed_enabled_obj_count", 0)],
        ["", ""],
        ["Permission Set Groups",       result.get("permission_set_group_count", 0)],
        ["Auth Providers",              result.get("auth_provider_count", 0)],
        ["MFA-Enrolled Users",          result.get("mfa_user_count", 0)],
        ["Public Groups",               result.get("public_group_count", 0)],
        ["Trusted IP Ranges",           result.get("trusted_ip_range_count", 0)],
        ["Remote Sites",                result.get("remote_site_count", 0)],
        ["", ""],
        ["Approval Processes",          result.get("approval_process_count", 0)],
        ["Workflow Email Alerts",       result.get("email_alert_count", 0)],
        ["Workflow Field Updates",      result.get("workflow_field_update_count", 0)],
        ["Outbound Messages",           result.get("outbound_message_count", 0)],
        ["External Services",           result.get("external_service_count", 0)],
        ["Push Topics",                 result.get("push_topic_count", 0)],
        ["Streaming Channels",          result.get("streaming_channel_count", 0)],
        ["", ""],
        ["Report Folders",              result.get("report_folder_count", 0)],
        ["Dashboard Folders",           result.get("dashboard_folder_count", 0)],
        ["Dashboard Components",        result.get("dashboard_component_count", 0)],
        ["Apex Debug Logs",             result.get("apex_log_count", 0)],
        ["Apex Log Size (MB)",          result.get("apex_log_size_mb", 0)],
        ["Flow Interview Errors",       result.get("flow_interview_error_count", 0)],
        ["Event Log Files (7d)",        result.get("event_log_file_count", 0)],
        ["", ""],
        ["Experience Cloud Sites",      result.get("experience_site_count", 0)],
        ["Chatter Groups",              result.get("chatter_group_count", 0)],
        ["Content Documents",           result.get("content_document_count", 0)],
        ["Knowledge Articles",          result.get("knowledge_article_count", 0)],
        ["Price Books",                 result.get("price_book_count", 0)],
        ["Active Products",             result.get("active_product_count", 0)],
        ["Opportunity Stages",          result.get("opportunity_stage_count", 0)],
        ["Case Statuses",               result.get("case_status_count", 0)],
        ["Territory Models",            result.get("territory_model_count", 0)],
    ], col_widths=[36, 24])

    # ── 2. All Checks ─────────────────────────────────────────────────────────
    _add_sheet(
        "All Checks",
        ["Check ID", "Name", "Domain", "API Surface", "Status", "Risk", "Count / Value", "Details"],
        [[
            c.get("check_id", ""), c.get("name", ""), c.get("domain", ""),
            c.get("api_surface", ""), c.get("status", ""), c.get("risk", ""),
            c.get("count") if c.get("count") is not None else (c.get("value") or ""),
            c.get("details", ""),
        ] for c in checks],
        col_widths=[14, 30, 18, 14, 10, 10, 14, 60],
        status_col=4,
    )

    # ── 3. Domain Summary ─────────────────────────────────────────────────────
    _add_sheet(
        "Domain Summary",
        ["Domain", "API Surface", "Total Checks", "Critical", "High", "Medium", "Low", "Passed", "Score"],
        [[
            d.get("domain", ""), d.get("api_surface", ""), d.get("total_checks", 0),
            d.get("critical", 0), d.get("high", 0), d.get("medium", 0),
            d.get("low", 0), d.get("passed", 0), f"{d.get('score', 0):.1f}",
        ] for d in domains],
        col_widths=[22, 16, 13, 10, 10, 10, 10, 10, 10],
    )

    # ── 4. Apex Code ──────────────────────────────────────────────────────────
    _add_sheet(
        "Apex Code",
        ["Class Name", "Status", "Valid", "Length (chars)", "API Version"],
        [[
            a.get("name", ""), a.get("status", ""),
            "Yes" if a.get("is_valid", True) else "No",
            a.get("length", 0), a.get("api_version", ""),
        ] for a in apex_inv],
        col_widths=[40, 12, 8, 16, 12],
    )

    # ── 5. Automation (Flows) ─────────────────────────────────────────────────
    _add_sheet(
        "Automation",
        ["Flow Label", "Process Type", "Status", "Version", "Trigger Type", "Trigger Object", "API Version"],
        [[
            f.get("label", ""), f.get("type", ""), f.get("status", ""),
            f.get("version", ""), f.get("trigger_type", ""),
            f.get("trigger_object", ""), f.get("api_version", ""),
        ] for f in flow_inv],
        col_widths=[36, 20, 14, 10, 18, 30, 12],
        status_col=2,
    )

    # ── 6. Security (Users) ───────────────────────────────────────────────────
    _add_sheet(
        "Security",
        ["Full Name", "Username", "Profile", "User Type", "Last Login", "Active"],
        [[
            u.get("name", ""), u.get("username", ""), u.get("profile", ""),
            u.get("user_type", ""), u.get("last_login", ""),
            "Yes" if u.get("is_active", True) else "No",
        ] for u in user_inv],
        col_widths=[28, 36, 24, 14, 20, 8],
    )

    # ── 7. User Licenses ──────────────────────────────────────────────────────
    _add_sheet(
        "User Licenses",
        ["License Name", "Definition Key", "Total", "Used", "Available", "Utilization %"],
        [[
            l.get("name", ""), l.get("key", ""),
            l.get("total", 0), l.get("used", 0),
            max(0, l.get("total", 0) - l.get("used", 0)),
            f"{round(l.get('used', 0) / max(l.get('total', 1), 1) * 100, 1)}%",
        ] for l in lic_inv],
        col_widths=[30, 22, 10, 10, 12, 14],
    )

    # ── 8. Integrations ───────────────────────────────────────────────────────
    _add_sheet(
        "Integrations",
        ["Package Name", "Namespace", "Major Version", "Minor Version"],
        [[
            p.get("name", ""), p.get("namespace", ""),
            p.get("major", ""), p.get("minor", ""),
        ] for p in pkg_inv],
        col_widths=[40, 20, 14, 14],
    )

    # ── 9. Operations ─────────────────────────────────────────────────────────
    _add_sheet(
        "Operations",
        ["Job Name", "Job Type", "State", "Next Fire Time"],
        [[
            s.get("name", ""), s.get("type", ""),
            s.get("state", ""), s.get("next_fire", ""),
        ] for s in sched_inv],
        col_widths=[36, 18, 14, 24],
    )

    # ── 10. Recommendations ───────────────────────────────────────────────────
    rec_rows = [
        [
            c.get("check_id", ""), c.get("name", ""), c.get("domain", ""),
            c.get("status", ""), c.get("risk", ""), c.get("recommendation", ""),
        ]
        for c in checks if c.get("recommendation")
    ]
    _add_sheet(
        "Recommendations",
        ["Check ID", "Check Name", "Domain", "Status", "Risk", "Recommendation"],
        rec_rows,
        col_widths=[14, 30, 18, 10, 10, 70],
        status_col=3,
    )

    # ── 11. UI Components ─────────────────────────────────────────────────────
    vf_rows  = [[v.get("name",""), v.get("label",""), v.get("api_version",""), "Yes" if v.get("mobile") else "No"] for v in vf_inv]
    lwc_rows = [[l.get("name",""), l.get("label",""), l.get("api_version","")] for l in lwc_inv]
    # Combine into one sheet with a divider
    combined_ui = [["=== Visualforce Pages ===", "", "", ""]] + vf_rows + \
                  [["", "", "", ""], ["=== Lightning Web Components ===", "", "", ""]] + \
                  [[l[0], l[1], l[2], ""] for l in lwc_rows]
    _add_sheet(
        "UI Components",
        ["Name", "Label / Master Label", "API Version", "Mobile / Notes"],
        combined_ui,
        col_widths=[40, 36, 12, 14],
    )

    # ── 12. Extended Automation ───────────────────────────────────────────────
    appr_rows = [[a.get("name",""), a.get("object",""), a.get("state","")] for a in appr_inv]
    _add_sheet(
        "Extended Automation",
        ["Approval Process", "Object", "State"],
        appr_rows,
        col_widths=[40, 28, 14],
    )

    # ── 13. Data Quality ──────────────────────────────────────────────────────
    dq_rows = [
        ["Formula Fields",            result.get("formula_field_count", 0)],
        ["Encrypted Fields",          result.get("encrypted_field_count", 0)],
        ["External ID Fields",        result.get("external_id_field_count", 0)],
        ["Rollup Summary Fields",     result.get("rollup_summary_field_count", 0)],
        ["Lookup / MasterDetail",     result.get("lookup_field_count", 0)],
        ["Picklist Fields",           result.get("picklist_field_count", 0)],
        ["Multi-Select Picklists",    result.get("multi_picklist_field_count", 0)],
        ["History-Tracked Objects",   result.get("history_enabled_obj_count", 0)],
        ["Feed-Enabled Objects",      result.get("feed_enabled_obj_count", 0)],
    ]
    _add_sheet(
        "Data Quality",
        ["Field / Object Type", "Count"],
        dq_rows,
        col_widths=[36, 14],
    )

    # ── 14. Experience Cloud ──────────────────────────────────────────────────
    exp_rows = [[e.get("name",""), e.get("status",""), e.get("type",""), e.get("url","")] for e in exp_inv]
    _add_sheet(
        "Experience Cloud",
        ["Site Name", "Status", "Type", "URL Prefix"],
        exp_rows,
        col_widths=[30, 14, 20, 30],
        status_col=1,
    )

    # ── 15. Business Objects ──────────────────────────────────────────────────
    prod_rows = [[p.get("name",""), p.get("code",""), p.get("family","")] for p in prod_inv]
    _add_sheet(
        "Business Objects",
        ["Product Name", "Product Code", "Family"],
        prod_rows,
        col_widths=[40, 20, 20],
    )

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
