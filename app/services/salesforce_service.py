"""
Salesforce Assessment Service.

Orchestrates 10 assessment domains across 8 Salesforce API surfaces:
  REST API, Metadata API, Tooling API, Bulk API v2, Analytics (Connect API),
  Security, Automation, Integrations.

Steps:
  1.  Connect + retrieve org info (REST API)
  2.  sObject inventory — standard & custom objects (Metadata/REST)
  3.  Field analysis — custom fields, validation rules (Metadata)
  4.  Relationships & record types (Metadata)
  5.  Apex code — classes, triggers, coverage (Tooling API)
  6.  Flows, process builder, workflow rules (Tooling / Automation)
  7.  Security — users, profiles, permission sets, roles (REST / Security)
  8.  Bulk API — job history, data volumes (Bulk API v2)
  9.  Analytics — reports & dashboards (Connect API)
  10. Integrations — connected apps, named creds, platform events
  11. Score & report
"""

from __future__ import annotations

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
    "Connecting to Salesforce org…",
    "Retrieving organisation metadata…",
    "Inventorying sObjects (standard & custom)…",
    "Analysing custom fields & validation rules…",
    "Mapping relationships & record types…",
    "Inspecting Apex classes & triggers (Tooling API)…",
    "Checking Apex test coverage…",
    "Auditing Flows, Process Builder & Workflow rules…",
    "Profiling users, profiles & permission sets (Security)…",
    "Reviewing roles & sharing rules…",
    "Scanning Bulk API v2 job history…",
    "Fetching Analytics reports & dashboards…",
    "Examining Connected Apps & Named Credentials…",
    "Checking Platform Events & Streaming…",
    "Computing scores & generating report…",
]


# ── Job CRUD ──────────────────────────────────────────────────────────────────

def create_job(request: SalesforceAssessmentRequest) -> str:
    job_id = str(uuid.uuid4())
    creds = request.credentials
    # For username_password the real instance_url is unknown until OAuth completes;
    # use domain as a placeholder so the label and NOT NULL column are never empty.
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

    # Persist initial row to Azure SQL (non-fatal)
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

    # Cache miss — attempt DB lookup (happens after server restart)
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
    # Attempt to load all sessions from DB to cover server-restart case
    db_rows: List[Dict] = []
    try:
        db_rows = azure_store.sf_list_sessions()
    except Exception as exc:
        logger.warning("sf_list_sessions DB query failed, using in-memory only: %s", exc)

    with _jobs_lock:
        mem_jobs = dict(_jobs)

    # Merge: in-memory takes priority (it has live progress state)
    merged: Dict[str, Dict] = {}
    for row in db_rows:
        merged[row["job_id"]] = row
    for job_id, j in mem_jobs.items():
        merged[job_id] = j  # override with live state

    records = []
    for j in merged.values():
        r: Optional[Dict] = j.get("result")
        # DB rows use result columns directly; in-memory uses nested result dict
        org_name    = (r.get("org_name")          if r else None) or j.get("org_name")
        org_type    = (r.get("org_type")          if r else None) or j.get("org_type")
        total       = (r.get("total_checks", 0)   if r else 0)    or j.get("total_checks_run", 0)
        critical    = (r.get("critical_findings", 0) if r else 0) or j.get("critical_findings", 0)
        high        = (r.get("high_findings", 0)  if r else 0)    or j.get("high_findings", 0)
        score       = (r.get("overall_score", 0.0) if r else 0.0) or j.get("overall_score", 0.0)
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

    # Persist to Azure SQL asynchronously-safe (called from background thread already)
    try:
        azure_store.sf_upsert_session(current)
    except Exception as exc:
        logger.warning("sf_upsert_session failed (non-fatal, data still in memory): %s", exc)


# ── Connection test ───────────────────────────────────────────────────────────

def test_connection(request: SalesforceAssessmentRequest) -> Dict:
    client = SalesforceClient(request.credentials)
    info   = client.test_connection()
    return {
        "success":   True,
        "org_id":    info.get("org_id"),
        "org_name":  info.get("org_name"),
        "org_type":  info.get("org_type"),
        "instance":  info.get("instance"),
        "api_version": request.credentials.api_version,
    }


# ── Assessment runner ─────────────────────────────────────────────────────────

def run_assessment(job_id: str, request: SalesforceAssessmentRequest) -> None:
    """Background task: full Salesforce assessment across 8 API surfaces."""
    start = time.time()

    def step(msg: str, idx: int) -> None:
        _update(job_id, progress_message=msg, checks_completed=idx, status="running")

    try:
        step(STEPS[0], 0)
        client = SalesforceClient(request.credentials)
        # After OAuth the client has the real instance_url — update the job row now
        # so the DB reflects the actual org URL instead of the domain placeholder.
        _update(job_id, instance_url=client.instance_url)

        # ── Step 1: Org info ──────────────────────────────────────────────────
        step(STEPS[1], 1)
        org = client.get_org_info()
        org_name = org.get("Name", "")
        org_type = "Sandbox" if org.get("IsSandbox") else org.get("OrganizationType", "Production")

        checks: List[SalesforceCheckResult] = []

        # ── Step 2: sObject inventory ─────────────────────────────────────────
        step(STEPS[2], 2)
        custom_objs   = client.get_custom_objects()  if request.include_objects else []
        standard_objs = client.get_standard_objects() if request.include_objects else []
        custom_count   = len(custom_objs)
        standard_count = len(standard_objs)

        checks.append(SalesforceCheckResult(
            check_id="SF-OBJ-001", name="Custom Object Count",
            domain="sObjects (Metadata API)", api_surface="Metadata API",
            risk="medium" if custom_count > 200 else "low",
            status="warning" if custom_count > 200 else "passed",
            count=custom_count,
            details=f"{custom_count} custom objects, {standard_count} standard objects.",
            recommendation="Consider consolidating rarely-used custom objects to reduce schema complexity." if custom_count > 200 else None,
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-OBJ-002", name="Queryable Standard Objects",
            domain="sObjects (Metadata API)", api_surface="Metadata API",
            risk="low", status="info", count=standard_count,
            details=f"{standard_count} standard objects are queryable.",
        ))

        # ── Step 3: Fields & validation rules ─────────────────────────────────
        step(STEPS[3], 3)
        total_custom_fields = 0
        if request.include_fields and custom_objs:
            sample = custom_objs[:50]
            for obj in sample:
                fields = client.get_custom_fields_for_object(obj.get("name", ""))
                total_custom_fields += len(fields)

        validation_rules = client.get_validation_rules() if request.include_validation else []
        active_vr = [v for v in validation_rules if v.get("Active")]

        checks.append(SalesforceCheckResult(
            check_id="SF-FLD-001", name="Custom Fields (sample 50 objects)",
            domain="Fields (Metadata API)", api_surface="Metadata API",
            risk="medium" if total_custom_fields > 5000 else "low",
            status="warning" if total_custom_fields > 5000 else "passed",
            count=total_custom_fields,
            details=f"{total_custom_fields} custom fields across sampled objects.",
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-FLD-002", name="Active Validation Rules",
            domain="Fields (Metadata API)", api_surface="Metadata API",
            risk="low", status="info",
            count=len(active_vr),
            details=f"{len(active_vr)} active validation rules across all objects.",
        ))

        # ── Step 4: Relationships & record types ──────────────────────────────
        step(STEPS[4], 4)
        record_types = client.get_record_types() if request.include_relationships else []
        page_layouts = client.get_page_layouts() if request.include_relationships else []

        checks.append(SalesforceCheckResult(
            check_id="SF-REL-001", name="Record Types",
            domain="Relationships (Metadata API)", api_surface="Metadata API",
            risk="low", status="info", count=len(record_types),
            details=f"{len(record_types)} record types defined.",
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-REL-002", name="Page Layouts",
            domain="Relationships (Metadata API)", api_surface="Metadata API",
            risk="low", status="info", count=len(page_layouts),
            details=f"{len(page_layouts)} page layouts defined.",
        ))

        # ── Step 5: Apex classes & triggers ──────────────────────────────────
        step(STEPS[5], 5)
        apex_classes  = client.get_apex_classes()  if request.include_apex else []
        apex_triggers = client.get_apex_triggers() if request.include_apex else []

        invalid_classes = [c for c in apex_classes  if not c.get("IsValid")]
        invalid_triggers = [t for t in apex_triggers if not t.get("IsValid")]

        checks.append(SalesforceCheckResult(
            check_id="SF-APX-001", name="Apex Class Count",
            domain="Apex Code (Tooling API)", api_surface="Tooling API",
            risk="low", status="info", count=len(apex_classes),
            details=f"{len(apex_classes)} Apex classes found.",
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-APX-002", name="Invalid Apex Classes",
            domain="Apex Code (Tooling API)", api_surface="Tooling API",
            risk="critical" if invalid_classes else "low",
            status="critical" if invalid_classes else "passed",
            count=len(invalid_classes),
            details=f"{len(invalid_classes)} Apex classes have compilation errors." if invalid_classes else "All Apex classes compile successfully.",
            recommendation="Fix compilation errors in Apex classes before deployment." if invalid_classes else None,
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-APX-003", name="Apex Triggers",
            domain="Apex Code (Tooling API)", api_surface="Tooling API",
            risk="low", status="info", count=len(apex_triggers),
            details=f"{len(apex_triggers)} Apex triggers ({len(invalid_triggers)} invalid).",
        ))

        # ── Step 6: Apex test coverage ────────────────────────────────────────
        step(STEPS[6], 6)
        coverage = client.get_code_coverage() if request.include_apex else []
        test_results = client.get_apex_test_results() if request.include_apex else []

        if coverage:
            covered   = sum(c.get("NumLinesCovered", 0) for c in coverage)
            uncovered = sum(c.get("NumLinesUncovered", 0) for c in coverage)
            total_lines = covered + uncovered
            coverage_pct = round((covered / total_lines * 100) if total_lines else 0, 1)
        else:
            coverage_pct = 0

        checks.append(SalesforceCheckResult(
            check_id="SF-APX-004", name="Apex Code Coverage",
            domain="Apex Code (Tooling API)", api_surface="Tooling API",
            risk="critical" if coverage_pct < 75 else ("high" if coverage_pct < 85 else "low"),
            status="critical" if coverage_pct < 75 else ("warning" if coverage_pct < 85 else "passed"),
            value=coverage_pct,
            details=f"Apex test coverage: {coverage_pct}% (Salesforce requires ≥75% for production deploy).",
            recommendation="Increase Apex test coverage to meet the 75% deployment threshold." if coverage_pct < 75 else None,
        ))

        # ── Step 7: Flows, Process Builder, Workflow rules ────────────────────
        step(STEPS[7], 7)
        flows    = client.get_flows()            if request.include_flows else []
        wf_rules = client.get_workflow_rules()   if request.include_flows else []
        pb       = client.get_process_builders() if request.include_flows else []

        active_flows  = [f for f in flows  if f.get("Status") == "Active"]
        inactive_pb   = [p for p in pb     if p.get("Status") != "Active"]
        active_wf     = [w for w in wf_rules if w.get("IsActive")]

        checks.append(SalesforceCheckResult(
            check_id="SF-AUT-001", name="Active Flows",
            domain="Automation (Tooling API)", api_surface="Tooling API",
            risk="low", status="info", count=len(active_flows),
            details=f"{len(active_flows)} active flows out of {len(flows)} total.",
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-AUT-002", name="Inactive Process Builders",
            domain="Automation (Tooling API)", api_surface="Tooling API",
            risk="medium" if inactive_pb else "low",
            status="warning" if inactive_pb else "passed",
            count=len(inactive_pb),
            details=f"{len(inactive_pb)} inactive Process Builder processes found.",
            recommendation="Migrate legacy Process Builder to Flow and remove inactive processes." if inactive_pb else None,
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-AUT-003", name="Workflow Rules (Legacy)",
            domain="Automation (Tooling API)", api_surface="Tooling API",
            risk="medium" if active_wf else "low",
            status="warning" if active_wf else "passed",
            count=len(active_wf),
            details=f"{len(active_wf)} active legacy workflow rules. Salesforce is retiring workflow rules.",
            recommendation="Migrate active workflow rules to Flow before retirement." if active_wf else None,
        ))

        # ── Step 8: Users, profiles, permission sets ──────────────────────────
        step(STEPS[8], 8)
        active_users   = client.get_users()           if request.include_security else []
        inactive_users = client.get_inactive_users()  if request.include_security else []
        profiles       = client.get_profiles()        if request.include_security else []
        perm_sets      = client.get_permission_sets() if request.include_security else []

        # Check for users who have never logged in
        never_logged = [u for u in active_users if not u.get("LastLoginDate")]

        checks.append(SalesforceCheckResult(
            check_id="SF-SEC-001", name="Active Users",
            domain="Security (REST API)", api_surface="REST API",
            risk="low", status="info", count=len(active_users),
            details=f"{len(active_users)} active users, {len(inactive_users)} inactive.",
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-SEC-002", name="Users Who Never Logged In",
            domain="Security (REST API)", api_surface="REST API",
            risk="medium" if never_logged else "low",
            status="warning" if never_logged else "passed",
            count=len(never_logged),
            details=f"{len(never_logged)} active users have never logged in — potential orphaned licenses.",
            recommendation="Review and deactivate active users who have never logged in." if never_logged else None,
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-SEC-003", name="Profile Count",
            domain="Security (REST API)", api_surface="REST API",
            risk="medium" if len(profiles) > 50 else "low",
            status="warning" if len(profiles) > 50 else "passed",
            count=len(profiles),
            details=f"{len(profiles)} profiles defined.",
            recommendation="Consolidate profiles and rely more on permission sets for a cleaner security model." if len(profiles) > 50 else None,
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-SEC-004", name="Permission Sets",
            domain="Security (REST API)", api_surface="REST API",
            risk="low", status="info", count=len(perm_sets),
            details=f"{len(perm_sets)} custom permission sets defined.",
        ))

        # ── Step 9: Roles & sharing ───────────────────────────────────────────
        step(STEPS[9], 9)
        roles = client.get_roles() if request.include_security else []

        checks.append(SalesforceCheckResult(
            check_id="SF-SEC-005", name="Role Hierarchy Depth",
            domain="Security (REST API)", api_surface="REST API",
            risk="medium" if len(roles) > 100 else "low",
            status="warning" if len(roles) > 100 else "passed",
            count=len(roles),
            details=f"{len(roles)} roles defined in the role hierarchy.",
            recommendation="Flatten the role hierarchy to reduce complexity and improve sharing rule performance." if len(roles) > 100 else None,
        ))

        # ── Step 10: Bulk API ─────────────────────────────────────────────────
        step(STEPS[10], 10)
        bulk_ingest = client.get_bulk_jobs()       if request.include_bulk else []
        bulk_query  = client.get_bulk_query_jobs() if request.include_bulk else []

        failed_bulk = [j for j in bulk_ingest if j.get("state") == "Failed"]

        checks.append(SalesforceCheckResult(
            check_id="SF-BLK-001", name="Bulk Ingest Jobs",
            domain="Bulk API v2", api_surface="Bulk API v2",
            risk="low", status="info", count=len(bulk_ingest),
            details=f"{len(bulk_ingest)} bulk ingest jobs in history, {len(bulk_query)} bulk query jobs.",
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-BLK-002", name="Failed Bulk Jobs",
            domain="Bulk API v2", api_surface="Bulk API v2",
            risk="high" if failed_bulk else "low",
            status="warning" if failed_bulk else "passed",
            count=len(failed_bulk),
            details=f"{len(failed_bulk)} bulk jobs in Failed state.",
            recommendation="Investigate and resolve failed bulk jobs." if failed_bulk else None,
        ))

        # ── Step 11: Analytics ────────────────────────────────────────────────
        step(STEPS[11], 11)
        reports    = client.get_reports()    if request.include_analytics else []
        dashboards = client.get_dashboards() if request.include_analytics else []

        checks.append(SalesforceCheckResult(
            check_id="SF-ANA-001", name="Reports Count",
            domain="Analytics (Connect API)", api_surface="Analytics API",
            risk="low", status="info", count=len(reports),
            details=f"{len(reports)} reports found.",
        ))
        checks.append(SalesforceCheckResult(
            check_id="SF-ANA-002", name="Dashboards Count",
            domain="Analytics (Connect API)", api_surface="Analytics API",
            risk="low", status="info", count=len(dashboards),
            details=f"{len(dashboards)} dashboards found.",
        ))

        # ── Step 12: Integrations ─────────────────────────────────────────────
        step(STEPS[12], 12)
        connected_apps   = client.get_connected_apps()    if request.include_integrations else []
        named_creds      = client.get_named_credentials() if request.include_integrations else []

        checks.append(SalesforceCheckResult(
            check_id="SF-INT-001", name="Connected Apps",
            domain="Integrations", api_surface="Tooling API",
            risk="medium" if len(connected_apps) > 20 else "low",
            status="warning" if len(connected_apps) > 20 else "passed",
            count=len(connected_apps),
            details=f"{len(connected_apps)} connected apps registered.",
            recommendation="Audit connected apps and remove unused OAuth clients." if len(connected_apps) > 20 else None,
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
            details=f"{len(platform_events)} platform event objects defined.",
        ))

        # ── Step 14: Score ────────────────────────────────────────────────────
        step(STEPS[14], 14)
        domain_summaries = _compute_domain_summaries(checks)
        overall_score    = _compute_overall_score(checks)

        result = SalesforceAssessmentResult(
            job_id=job_id,
            status="completed",
            instance_url=request.credentials.instance_url,
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
            custom_object_count=custom_count,
            standard_object_count=standard_count,
            total_field_count=total_custom_fields,
            apex_class_count=len(apex_classes),
            flow_count=len(flows),
            active_user_count=len(active_users),
            profile_count=len(profiles),
            permission_set_count=len(perm_sets),
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
            progress_message=f"Complete — {overall_score:.0f}/100",
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
            medium=sum(1 for c in items if c.risk == "medium" and c.status not in ("critical",)),
            low=sum(1 for c in items if c.risk == "low"),
            passed=sum(1 for c in items if c.status == "passed"),
            errors=sum(1 for c in items if c.status == "error"),
            score=_compute_overall_score(items),
        ))
    return summaries
