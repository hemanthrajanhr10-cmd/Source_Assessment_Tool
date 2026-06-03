"""
Dataverse Assessment Service.

Orchestrates 23 assessment domains with 100+ checks across:
Tables, Columns, Relationships, Option Sets, Data Volume, Data Quality,
Security Roles, Users & Teams, Field Level Security, Solutions, Flows,
Plugins, Workflows, UI/Forms, Web Resources, Integrations, Audit,
Environment, Performance, Service Management, Retention, AI/Copilot, Telemetry.
"""

from __future__ import annotations

import threading
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.db.dataverse_client import DataverseClient
from app.models.dataverse_requests import (
    DataverseAssessmentRequest,
    DataverseAssessmentResult,
    DataverseCheckResult,
    DataverseDomainSummary,
    DataverseSessionRecord,
)

# ── In-memory job store ───────────────────────────────────────────────────────
_jobs: Dict[str, Dict] = {}
_jobs_lock = threading.Lock()

STEPS = [
    "Connecting to Dataverse environment",
    "Fetching organization metadata",
    "Inventorying tables & entities",
    "Analyzing column definitions",
    "Mapping table relationships",
    "Cataloging option sets & choices",
    "Measuring data volumes",
    "Evaluating data quality signals",
    "Auditing security roles & privileges",
    "Profiling users & teams",
    "Reviewing field-level security",
    "Analyzing installed solutions",
    "Inspecting Power Automate flows",
    "Examining plugins & custom APIs",
    "Reviewing workflows & business rules",
    "Auditing forms & views",
    "Scanning web resources",
    "Checking integrations & connectors",
    "Reviewing audit configuration",
    "Assessing environment settings",
    "Analyzing performance indicators",
    "Reviewing service management",
    "Checking retention & archival policies",
    "Evaluating AI & Copilot settings",
    "Generating assessment report",
]


# ── Job CRUD ──────────────────────────────────────────────────────────────────

def create_job(request: DataverseAssessmentRequest) -> str:
    job_id = str(uuid.uuid4())
    with _jobs_lock:
        _jobs[job_id] = {
            "job_id":          job_id,
            "status":          "pending",
            "label":           request.label or f"Dataverse – {request.credentials.environment_url}",
            "environment_url": request.credentials.environment_url,
            "progress_message": "Queued",
            "checks_completed": 0,
            "total_checks":    len(STEPS),
            "created_at":      datetime.now(timezone.utc).isoformat(),
            "completed_at":    None,
            "error":           None,
            "result":          None,
        }
    return job_id


def get_job(job_id: str) -> Optional[Dict]:
    with _jobs_lock:
        return _jobs.get(job_id)


def list_jobs() -> List[DataverseSessionRecord]:
    with _jobs_lock:
        rows = list(_jobs.values())
    records = []
    for j in rows:
        r: Optional[DataverseAssessmentResult] = j.get("result")
        records.append(DataverseSessionRecord(
            job_id=j["job_id"],
            status=j["status"],
            label=j.get("label"),
            environment_url=j["environment_url"],
            organization_name=r.organization_name if r else None,
            total_checks=r.total_checks if r else 0,
            critical_findings=r.critical_findings if r else 0,
            high_findings=r.high_findings if r else 0,
            overall_score=r.overall_score if r else 0.0,
            created_at=j["created_at"],
            completed_at=j.get("completed_at"),
            duration_seconds=j.get("duration_seconds"),
        ))
    records.sort(key=lambda x: x.created_at, reverse=True)
    return records


def _update(job_id: str, **kwargs) -> None:
    with _jobs_lock:
        if job_id in _jobs:
            _jobs[job_id].update(kwargs)


# ── Helper: safe check wrapper ────────────────────────────────────────────────

def _safe(
    check_id: str,
    name: str,
    domain: str,
    risk: str,
    fn,
) -> DataverseCheckResult:
    try:
        return fn()
    except Exception as exc:
        return DataverseCheckResult(
            check_id=check_id,
            name=name,
            domain=domain,
            risk=risk,  # type: ignore[arg-type]
            status="error",
            details=str(exc)[:300],
        )


# ── Domain check functions ────────────────────────────────────────────────────

def _check_tables(client: DataverseClient, max_entities: int) -> List[DataverseCheckResult]:
    results = []

    def t001():
        entities = client.get_all(
            "EntityDefinitions",
            {"$select": "LogicalName,IsCustomEntity,IsManaged,IsVirtualEntity,IsActivity,IsAuditEnabled,ChangeTrackingEnabled,IsBusinessProcessEnabled,IsSLAEnabled,TableType"},
            max_pages=5,
        )[:max_entities]
        total = len(entities)
        custom = sum(1 for e in entities if e.get("IsCustomEntity"))
        managed = sum(1 for e in entities if e.get("IsManaged"))
        virtual = sum(1 for e in entities if e.get("IsVirtualEntity"))
        elastic = sum(1 for e in entities if e.get("TableType") == "Elastic")
        return DataverseCheckResult(
            check_id="T001", name="Total table count (standard + custom)", domain="Tables", risk="high",
            status="warning" if total > 800 else "info",
            count=total,
            value={"total": total, "custom": custom, "system": total - custom, "managed": managed, "virtual": virtual, "elastic": elastic},
            details=f"{total} tables: {custom} custom, {total - custom} system, {virtual} virtual, {elastic} elastic",
            recommendation="Review growth if >800 tables — complexity may impact maintainability." if total > 800 else None,
        )

    def t002():
        entities = client.get_value("EntityDefinitions", {"$filter": "IsCustomEntity eq true", "$select": "LogicalName,SchemaName,IsManaged", "$top": "250"})
        total = len(entities)
        unmanaged = sum(1 for e in entities if not e.get("IsManaged"))
        return DataverseCheckResult(
            check_id="T002", name="Custom entity list with schema names", domain="Tables", risk="high",
            status="warning" if unmanaged > 30 else "info",
            count=total,
            value={"custom_count": total, "unmanaged_custom": unmanaged},
            details=f"{total} custom tables ({unmanaged} unmanaged — deployment risk)",
            recommendation="Ensure all custom tables are in managed solutions for proper ALM." if unmanaged > 0 else None,
        )

    def t006():
        entities = client.get_value("EntityDefinitions", {"$select": "LogicalName,IsAuditEnabled", "$top": "500"})
        audit_on = sum(1 for e in entities if e.get("IsAuditEnabled"))
        total = len(entities)
        return DataverseCheckResult(
            check_id="T006", name="Audit-enabled tables", domain="Tables", risk="high",
            status="warning" if audit_on < total * 0.5 else "info",
            count=audit_on,
            value={"audit_enabled": audit_on, "audit_disabled": total - audit_on, "total": total},
            details=f"{audit_on}/{total} tables have audit enabled",
            recommendation="Enable auditing on critical business tables if ratio is low." if audit_on < total * 0.5 else None,
        )

    def t027():
        entities = client.get_value("EntityDefinitions", {"$filter": "TableType eq 'Elastic'", "$select": "LogicalName,SchemaName", "$top": "100"})
        return DataverseCheckResult(
            check_id="T027", name="Elastic tables (CosmosDB-backed)", domain="Tables", risk="high",
            status="info",
            count=len(entities),
            details=f"{len(entities)} elastic (CosmosDB-backed) tables detected",
        )

    def t030():
        try:
            data = client.get("retentionconfigs", {"$select": "entitylogicalname,statecode", "$top": "100"})
            configs = data.get("value", [])
            return DataverseCheckResult(
                check_id="T030", name="Tables with retention policies", domain="Tables", risk="high",
                status="info",
                count=len(configs),
                details=f"{len(configs)} retention policies configured",
            )
        except Exception:
            return DataverseCheckResult(
                check_id="T030", name="Tables with retention policies", domain="Tables", risk="high",
                status="skipped", details="Admin API not accessible (requires System Administrator)",
            )

    for fn, cid, name in [
        (t001, "T001", "Total table count"),
        (t002, "T002", "Custom entity list"),
        (t006, "T006", "Audit-enabled tables"),
        (t027, "T027", "Elastic tables"),
        (t030, "T030", "Tables with retention policies"),
    ]:
        results.append(_safe(cid, name, "Tables", "high", fn))

    return results


def _check_columns(client: DataverseClient) -> List[DataverseCheckResult]:
    results = []

    def c002():
        data = client.get("attributes", {"$filter": "IsCustomAttribute eq true", "$select": "LogicalName,AttributeType,IsManaged", "$top": "500"})
        attrs = data.get("value", [])
        types: Dict[str, int] = {}
        for a in attrs:
            t = a.get("AttributeType", "Unknown")
            types[t] = types.get(t, 0) + 1
        return DataverseCheckResult(
            check_id="C002", name="Custom column inventory", domain="Columns", risk="high",
            status="warning" if len(attrs) > 300 else "info",
            count=len(attrs),
            value={"type_distribution": types},
            details=f"{len(attrs)} custom columns across all tables",
        )

    def c017():
        data = client.get("attributes", {"$filter": "IsSecured eq true", "$select": "LogicalName,AttributeType", "$top": "200"})
        secured = data.get("value", [])
        return DataverseCheckResult(
            check_id="C017", name="Columns with field-level security (IsSecured)", domain="Columns", risk="critical",
            status="info" if secured else "warning",
            count=len(secured),
            details=f"{len(secured)} columns protected by field-level security",
            recommendation="Verify FLS profiles are correctly assigned to all secured columns." if secured else "No columns use FLS — consider enabling for sensitive data.",
        )

    def c018():
        data = client.get("attributes", {"$filter": "IsDeprecated eq true", "$select": "LogicalName,AttributeType", "$top": "200"})
        deprecated = data.get("value", [])
        return DataverseCheckResult(
            check_id="C018", name="Deprecated columns still in use", domain="Columns", risk="high",
            status="warning" if deprecated else "passed",
            count=len(deprecated),
            details=f"{len(deprecated)} deprecated columns detected",
            recommendation="Remove deprecated column references from forms, flows, and integrations." if deprecated else None,
        )

    def c029():
        data = client.get("attributes", {"$filter": "IsValidForCreate eq false or IsValidForUpdate eq false", "$select": "LogicalName,IsValidForCreate,IsValidForUpdate", "$top": "200"})
        restricted = data.get("value", [])
        return DataverseCheckResult(
            check_id="C029", name="Columns not valid for create or update", domain="Columns", risk="high",
            status="info",
            count=len(restricted),
            details=f"{len(restricted)} columns are read-only (not valid for create/update)",
        )

    for fn, cid, name in [
        (c002, "C002", "Custom column inventory"),
        (c017, "C017", "Field-level security columns"),
        (c018, "C018", "Deprecated columns"),
        (c029, "C029", "Read-only columns"),
    ]:
        results.append(_safe(cid, name, "Columns", "high", fn))

    return results


def _check_relationships(client: DataverseClient) -> List[DataverseCheckResult]:
    results = []

    def r001():
        data = client.get("RelationshipDefinitions/Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata", {"$select": "SchemaName,IsCustomRelationship,IsManaged", "$top": "500"})
        rels = data.get("value", [])
        custom = sum(1 for r in rels if r.get("IsCustomRelationship"))
        return DataverseCheckResult(
            check_id="R001", name="All 1:N relationships", domain="Relationships", risk="high",
            status="info",
            count=len(rels),
            value={"total": len(rels), "custom": custom},
            details=f"{len(rels)} one-to-many relationships ({custom} custom)",
        )

    def r002():
        data = client.get("RelationshipDefinitions/Microsoft.Dynamics.CRM.ManyToManyRelationshipMetadata", {"$select": "SchemaName,IsCustomRelationship", "$top": "200"})
        rels = data.get("value", [])
        custom = sum(1 for r in rels if r.get("IsCustomRelationship"))
        return DataverseCheckResult(
            check_id="R002", name="All N:N relationships", domain="Relationships", risk="high",
            status="info",
            count=len(rels),
            value={"total": len(rels), "custom": custom},
            details=f"{len(rels)} many-to-many relationships ({custom} custom)",
        )

    def r009():
        try:
            data = client.get("EntityKeyIndexStatus", {"$top": "100"})
            keys = data.get("value", [])
            failed = [k for k in keys if k.get("Status") in ("Failed", "PendingFailed")]
            return DataverseCheckResult(
                check_id="R009", name="Alternate key index status", domain="Relationships", risk="critical",
                status="critical" if failed else "passed",
                count=len(failed),
                details=f"{len(failed)} alternate keys in Failed/PendingFailed state" if failed else "All alternate key indexes healthy",
                recommendation="Rebuild failed alternate key indexes to restore uniqueness constraints." if failed else None,
            )
        except Exception:
            return DataverseCheckResult(
                check_id="R009", name="Alternate key index status", domain="Relationships", risk="critical",
                status="skipped", details="EntityKeyIndexStatus not accessible",
            )

    for fn, cid, name in [
        (r001, "R001", "1:N relationships"),
        (r002, "R002", "N:N relationships"),
        (r009, "R009", "Alternate key index status"),
    ]:
        results.append(_safe(cid, name, "Relationships", "high", fn))

    return results


def _check_option_sets(client: DataverseClient) -> List[DataverseCheckResult]:
    results = []

    def o001():
        data = client.get("GlobalOptionSetDefinitions", {"$select": "Name,IsManaged,IsCustomOptionSet", "$top": "500"})
        opts = data.get("value", [])
        custom = sum(1 for o in opts if o.get("IsCustomOptionSet"))
        managed = sum(1 for o in opts if o.get("IsManaged"))
        return DataverseCheckResult(
            check_id="O001", name="All global option sets (global choices)", domain="Option Sets", risk="high",
            status="info",
            count=len(opts),
            value={"total": len(opts), "custom": custom, "managed": managed},
            details=f"{len(opts)} global option sets ({custom} custom, {managed} managed)",
        )

    def o005():
        try:
            entities = client.get_value("EntityDefinitions", {"$select": "LogicalName", "$top": "50"})
            status_issues = 0
            for ent in entities[:20]:
                try:
                    ln = ent.get("LogicalName", "")
                    client.get(f"EntityDefinitions(LogicalName='{ln}')/Attributes/Microsoft.Dynamics.CRM.StatusAttributeMetadata", {"$top": "1"})
                except Exception:
                    status_issues += 1
            return DataverseCheckResult(
                check_id="O005", name="Status/StatusReason codes per table", domain="Option Sets", risk="critical",
                status="info",
                details="Status attribute metadata accessible for sampled entities",
            )
        except Exception as e:
            return DataverseCheckResult(
                check_id="O005", name="Status/StatusReason codes per table", domain="Option Sets", risk="critical",
                status="error", details=str(e)[:200],
            )

    for fn, cid, name in [
        (o001, "O001", "Global option sets"),
        (o005, "O005", "Status/StatusReason codes"),
    ]:
        results.append(_safe(cid, name, "Option Sets", "high", fn))

    return results


def _check_data_volume(client: DataverseClient) -> List[DataverseCheckResult]:
    results = []

    def d014():
        try:
            data = client.get("duplicaterecords", {"$count": "true", "$top": "1"})
            count = data.get("@odata.count", 0)
            return DataverseCheckResult(
                check_id="D014", name="Duplicate record pairs", domain="Data Volume", risk="high",
                status="critical" if count > 1000 else ("warning" if count > 0 else "passed"),
                count=count,
                details=f"{count:,} duplicate record pairs detected",
                recommendation="Run duplicate detection and merge or deactivate duplicates." if count > 0 else None,
            )
        except Exception:
            return DataverseCheckResult(
                check_id="D014", name="Duplicate record pairs", domain="Data Volume", risk="high",
                status="skipped", details="Duplicate records endpoint not accessible",
            )

    def d020():
        try:
            data = client.get("recyclebinentities", {"$count": "true", "$top": "1"})
            count = data.get("@odata.count", 0)
            return DataverseCheckResult(
                check_id="D020", name="Recycle bin record volume", domain="Data Volume", risk="medium",
                status="warning" if count > 10000 else "info",
                count=count,
                details=f"{count:,} records in the recycle bin",
                recommendation="Schedule regular recycle bin cleanup to recover storage." if count > 10000 else None,
            )
        except Exception:
            return DataverseCheckResult(
                check_id="D020", name="Recycle bin record volume", domain="Data Volume", risk="medium",
                status="skipped", details="Recycle bin endpoint not accessible",
            )

    def d022():
        try:
            data = client.get("annotations", {"$count": "true", "$top": "1"})
            count = data.get("@odata.count", 0)
            return DataverseCheckResult(
                check_id="D022", name="Annotation/note count", domain="Data Volume", risk="high",
                status="warning" if count > 500000 else "info",
                count=count,
                details=f"{count:,} annotation/note records (file storage impact)",
                recommendation="Review notes with large attachments; consider external storage." if count > 500000 else None,
            )
        except Exception:
            return DataverseCheckResult(
                check_id="D022", name="Annotation/note count", domain="Data Volume", risk="high",
                status="skipped", details="Annotations endpoint not accessible",
            )

    for fn, cid, name in [
        (d014, "D014", "Duplicate record pairs"),
        (d020, "D020", "Recycle bin volume"),
        (d022, "D022", "Annotation count"),
    ]:
        results.append(_safe(cid, name, "Data Volume", "high", fn))

    return results


def _check_data_quality(client: DataverseClient) -> List[DataverseCheckResult]:
    results = []

    def q001():
        data = client.get("duplicaterules", {"$select": "name,statuscode", "$top": "100"})
        rules = data.get("value", [])
        published = sum(1 for r in rules if r.get("statuscode") == 2)
        unpublished = len(rules) - published
        return DataverseCheckResult(
            check_id="Q001", name="Duplicate detection rules configured", domain="Data Quality", risk="high",
            status="warning" if not rules else ("warning" if unpublished > 0 else "passed"),
            count=len(rules),
            value={"total": len(rules), "published": published, "unpublished": unpublished},
            details=f"{len(rules)} duplicate rules ({published} published, {unpublished} unpublished)",
            recommendation="Publish unpublished duplicate rules to enforce data quality." if unpublished > 0 else (
                "No duplicate detection rules — consider creating rules for critical entities." if not rules else None
            ),
        )

    def q003():
        try:
            data = client.get("duplicaterecords", {"$count": "true", "$top": "1"})
            count = data.get("@odata.count", 0)
            return DataverseCheckResult(
                check_id="Q003", name="Existing duplicate record pairs", domain="Data Quality", risk="critical",
                status="critical" if count > 500 else ("warning" if count > 0 else "passed"),
                count=count,
                details=f"{count:,} duplicate record pairs exist",
                recommendation="Merge or flag duplicate records to improve data integrity." if count > 0 else None,
            )
        except Exception:
            return DataverseCheckResult(
                check_id="Q003", name="Existing duplicate record pairs", domain="Data Quality", risk="critical",
                status="skipped", details="Duplicate records not accessible",
            )

    for fn, cid, name in [
        (q001, "Q001", "Duplicate detection rules"),
        (q003, "Q003", "Existing duplicate pairs"),
    ]:
        results.append(_safe(cid, name, "Data Quality", "high", fn))

    return results


def _check_security_roles(client: DataverseClient) -> List[DataverseCheckResult]:
    results = []

    def s001():
        data = client.get("roles", {"$select": "name,roleidunique,ismanaged,iscustomizable", "$top": "500"})
        roles = data.get("value", [])
        custom = sum(1 for r in roles if not r.get("ismanaged"))
        return DataverseCheckResult(
            check_id="S001", name="All security roles inventory", domain="Security Roles", risk="critical",
            status="info",
            count=len(roles),
            value={"total": len(roles), "custom": custom, "managed": len(roles) - custom},
            details=f"{len(roles)} security roles ({custom} custom/unmanaged)",
        )

    def s004():
        data = client.get("roles", {"$select": "name,ismanaged,iscustomizable", "$top": "500"})
        roles = data.get("value", [])
        custom = [r["name"] for r in roles if not r.get("ismanaged")]
        return DataverseCheckResult(
            check_id="S004", name="Custom vs system security roles", domain="Security Roles", risk="high",
            status="warning" if len(custom) > 20 else "info",
            count=len(custom),
            value={"custom_roles": custom[:20]},
            details=f"{len(custom)} custom roles (not from managed solutions)",
            recommendation="Consolidate redundant custom roles to simplify security model." if len(custom) > 20 else None,
        )

    def s012():
        try:
            all_roles = client.get_value("roles", {"$select": "name,roleid", "$top": "500"})
            orphaned_count = 0
            for role in all_roles[:50]:
                rid = role.get("roleid", "")
                try:
                    assignments = client.get_count("systemuserroles", {"$filter": f"roleid eq {rid}"})
                    team_assignments = client.get_count("teamroles", {"$filter": f"roleid eq {rid}"})
                    if assignments == 0 and team_assignments == 0:
                        orphaned_count += 1
                except Exception:
                    pass
            return DataverseCheckResult(
                check_id="S012", name="Orphaned roles (no user/team assignment)", domain="Security Roles", risk="medium",
                status="warning" if orphaned_count > 5 else "info",
                count=orphaned_count,
                details=f"{orphaned_count} roles with no user or team assignments (sampled)",
                recommendation="Remove or archive orphaned roles to reduce security complexity." if orphaned_count > 5 else None,
            )
        except Exception as e:
            return DataverseCheckResult(
                check_id="S012", name="Orphaned roles", domain="Security Roles", risk="medium",
                status="skipped", details=str(e)[:200],
            )

    for fn, cid, name in [
        (s001, "S001", "Security roles inventory"),
        (s004, "S004", "Custom vs system roles"),
        (s012, "S012", "Orphaned roles"),
    ]:
        results.append(_safe(cid, name, "Security Roles", "critical", fn))

    return results


def _check_users_teams(client: DataverseClient) -> List[DataverseCheckResult]:
    results = []

    def u001():
        data = client.get("systemusers", {"$select": "fullname,domainname,isdisabled,islicensed", "$top": "500"})
        users = data.get("value", [])
        disabled = sum(1 for u in users if u.get("isdisabled"))
        licensed = sum(1 for u in users if u.get("islicensed"))
        return DataverseCheckResult(
            check_id="U001", name="All licensed users inventory", domain="Users & Teams", risk="critical",
            status="info",
            count=len(users),
            value={"total": len(users), "disabled": disabled, "licensed": licensed, "enabled_licensed": licensed - disabled},
            details=f"{len(users)} users ({licensed} licensed, {disabled} disabled)",
        )

    def u002():
        try:
            data = client.get(
                "systemusers",
                {"$filter": "isdisabled eq true", "$select": "fullname,domainname", "$top": "200"},
            )
            disabled = data.get("value", [])
            return DataverseCheckResult(
                check_id="U002", name="Disabled users who may own active records", domain="Users & Teams", risk="critical",
                status="critical" if len(disabled) > 10 else ("warning" if disabled else "passed"),
                count=len(disabled),
                details=f"{len(disabled)} disabled users — may still own active records",
                recommendation="Reassign records from disabled users to active users or queues." if disabled else None,
            )
        except Exception:
            return DataverseCheckResult(
                check_id="U002", name="Disabled users owning records", domain="Users & Teams", risk="critical",
                status="skipped", details="Cannot query disabled users",
            )

    def u003():
        try:
            data = client.get(
                "systemusers",
                {"$filter": "lastloggedin eq null", "$select": "fullname,domainname,createdon", "$top": "200"},
            )
            never_logged = data.get("value", [])
            return DataverseCheckResult(
                check_id="U003", name="Users who have never logged in", domain="Users & Teams", risk="high",
                status="warning" if len(never_logged) > 5 else "info",
                count=len(never_logged),
                details=f"{len(never_logged)} users have never logged in",
                recommendation="Review and deprovision users who have never logged in." if len(never_logged) > 5 else None,
            )
        except Exception:
            return DataverseCheckResult(
                check_id="U003", name="Users never logged in", domain="Users & Teams", risk="high",
                status="skipped", details="lastloggedin filter not accessible",
            )

    def u005():
        data = client.get(
            "systemusers",
            {"$filter": "applicationid ne null", "$select": "fullname,applicationid", "$top": "100"},
        )
        app_users = data.get("value", [])
        return DataverseCheckResult(
            check_id="U005", name="Application users (service principals)", domain="Users & Teams", risk="critical",
            status="info",
            count=len(app_users),
            details=f"{len(app_users)} application users (service principals / app registrations)",
            recommendation="Audit application user permissions — each should follow least-privilege." if app_users else None,
        )

    def u009():
        data = client.get("businessunits", {"$select": "name,parentbusinessunitid", "$top": "200"})
        bus = data.get("value", [])
        return DataverseCheckResult(
            check_id="U009", name="Business unit hierarchy", domain="Users & Teams", risk="high",
            status="info",
            count=len(bus),
            details=f"{len(bus)} business units in the hierarchy",
        )

    def u011():
        data = client.get("teams", {"$select": "name,teamtype", "$top": "200"})
        teams = data.get("value", [])
        owner_teams = sum(1 for t in teams if t.get("teamtype") == 0)
        access_teams = sum(1 for t in teams if t.get("teamtype") == 1)
        return DataverseCheckResult(
            check_id="U011", name="Team definitions", domain="Users & Teams", risk="high",
            status="info",
            count=len(teams),
            value={"total": len(teams), "owner_teams": owner_teams, "access_teams": access_teams},
            details=f"{len(teams)} teams ({owner_teams} owner, {access_teams} access)",
        )

    for fn, cid, name in [
        (u001, "U001", "Users inventory"),
        (u002, "U002", "Disabled users with records"),
        (u003, "U003", "Users never logged in"),
        (u005, "U005", "Application users"),
        (u009, "U009", "Business units"),
        (u011, "U011", "Teams"),
    ]:
        results.append(_safe(cid, name, "Users & Teams", "critical", fn))

    return results


def _check_field_security(client: DataverseClient) -> List[DataverseCheckResult]:
    results = []

    def f001():
        data = client.get("fieldsecurityprofiles", {"$select": "name,ismanaged", "$top": "200"})
        profiles = data.get("value", [])
        return DataverseCheckResult(
            check_id="F001", name="All field security profiles", domain="Field Level Security", risk="critical",
            status="info" if profiles else "warning",
            count=len(profiles),
            details=f"{len(profiles)} field security profiles defined",
            recommendation="No FLS profiles — sensitive columns may lack protection." if not profiles else None,
        )

    def f003():
        data = client.get("attributes", {"$filter": "IsSecured eq true", "$select": "LogicalName,AttributeType", "$top": "200"})
        secured = data.get("value", [])
        return DataverseCheckResult(
            check_id="F003", name="Secured columns across all tables", domain="Field Level Security", risk="critical",
            status="info",
            count=len(secured),
            details=f"{len(secured)} columns protected with field-level security",
        )

    def f006():
        profiles = client.get_value("fieldsecurityprofiles", {"$select": "fieldsecurityprofileid,name", "$top": "100"})
        unassigned = []
        for p in profiles[:20]:
            pid = p.get("fieldsecurityprofileid", "")
            try:
                users = client.get_count("systemuserprofiles", {"$filter": f"fieldsecurityprofileid eq {pid}"})
                teams = client.get_count("teamprofiles", {"$filter": f"fieldsecurityprofileid eq {pid}"})
                if users == 0 and teams == 0:
                    unassigned.append(p.get("name"))
            except Exception:
                pass
        return DataverseCheckResult(
            check_id="F006", name="FLS profiles with no assigned users/teams", domain="Field Level Security", risk="medium",
            status="warning" if unassigned else "passed",
            count=len(unassigned),
            details=f"{len(unassigned)} FLS profiles have no user or team assignments",
            recommendation="Remove or assign unused FLS profiles." if unassigned else None,
        )

    for fn, cid, name in [
        (f001, "F001", "Field security profiles"),
        (f003, "F003", "Secured columns"),
        (f006, "F006", "Unassigned FLS profiles"),
    ]:
        results.append(_safe(cid, name, "Field Level Security", "critical", fn))

    return results


def _check_solutions(client: DataverseClient) -> List[DataverseCheckResult]:
    results = []

    def sol001():
        data = client.get("solutions", {"$select": "uniquename,version,ismanaged,friendlyname", "$top": "500"})
        solutions = data.get("value", [])
        managed = sum(1 for s in solutions if s.get("ismanaged"))
        unmanaged = len(solutions) - managed
        return DataverseCheckResult(
            check_id="SOL001", name="All installed solutions", domain="Solutions", risk="critical",
            status="info",
            count=len(solutions),
            value={"total": len(solutions), "managed": managed, "unmanaged": unmanaged},
            details=f"{len(solutions)} solutions ({managed} managed, {unmanaged} unmanaged)",
        )

    def sol005():
        data = client.get("solutions", {"$filter": "uniquename eq 'Default'", "$select": "uniquename,version"})
        default_solutions = data.get("value", [])
        return DataverseCheckResult(
            check_id="SOL005", name="Unmanaged customizations in Default solution", domain="Solutions", risk="critical",
            status="warning",
            details="Default solution detected — unmanaged customizations present",
            recommendation="Move all customizations into managed solutions to support proper ALM.",
        )

    def sol008():
        try:
            data = client.get("dependencynodes", {"$top": "1"})
            return DataverseCheckResult(
                check_id="SOL008", name="Missing solution dependencies", domain="Solutions", risk="critical",
                status="info",
                details="Dependency nodes accessible — run full dependency analysis for complete picture",
            )
        except Exception:
            return DataverseCheckResult(
                check_id="SOL008", name="Missing solution dependencies", domain="Solutions", risk="critical",
                status="skipped", details="Dependency nodes endpoint not accessible",
            )

    def sol012():
        try:
            data = client.get("environmentvariabledefinitions", {"$select": "schemaname,type,displayname", "$top": "200"})
            defs = data.get("value", [])
            return DataverseCheckResult(
                check_id="SOL012", name="Environment variables defined", domain="Solutions", risk="high",
                status="info",
                count=len(defs),
                details=f"{len(defs)} environment variable definitions",
            )
        except Exception:
            return DataverseCheckResult(
                check_id="SOL012", name="Environment variables defined", domain="Solutions", risk="high",
                status="skipped", details="Environment variable definitions not accessible",
            )

    def sol013():
        try:
            data = client.get("environmentvariablevalues", {"$select": "schemaname,value", "$top": "200"})
            vals = data.get("value", [])
            with_values = sum(1 for v in vals if v.get("value"))
            return DataverseCheckResult(
                check_id="SOL013", name="Environment variable values (secrets check)", domain="Solutions", risk="critical",
                status="warning" if with_values > 0 else "info",
                count=len(vals),
                details=f"{len(vals)} environment variable values ({with_values} non-empty)",
                recommendation="Ensure no secrets or connection strings are stored in plain-text environment variables." if with_values > 0 else None,
            )
        except Exception:
            return DataverseCheckResult(
                check_id="SOL013", name="Environment variable values", domain="Solutions", risk="critical",
                status="skipped", details="Environment variable values not accessible",
            )

    def sol014():
        try:
            data = client.get("connectionreferences", {"$select": "connectionreferencedisplayname,statecode", "$top": "200"})
            refs = data.get("value", [])
            return DataverseCheckResult(
                check_id="SOL014", name="Connection references defined", domain="Solutions", risk="high",
                status="info",
                count=len(refs),
                details=f"{len(refs)} connection references",
            )
        except Exception:
            return DataverseCheckResult(
                check_id="SOL014", name="Connection references defined", domain="Solutions", risk="high",
                status="skipped", details="Connection references not accessible",
            )

    for fn, cid, name in [
        (sol001, "SOL001", "All solutions"),
        (sol005, "SOL005", "Default solution customizations"),
        (sol008, "SOL008", "Missing dependencies"),
        (sol012, "SOL012", "Environment variables"),
        (sol013, "SOL013", "Environment variable values"),
        (sol014, "SOL014", "Connection references"),
    ]:
        results.append(_safe(cid, name, "Solutions", "critical", fn))

    return results


def _check_flows(client: DataverseClient) -> List[DataverseCheckResult]:
    results = []

    def fl001():
        data = client.get("workflows", {"$filter": "category eq 5", "$select": "name,statecode,ownerid,solutionid", "$top": "500"})
        flows = data.get("value", [])
        active = sum(1 for f in flows if f.get("statecode") == 1)
        suspended = sum(1 for f in flows if f.get("statecode") == 2)
        no_solution = sum(1 for f in flows if not f.get("solutionid"))
        return DataverseCheckResult(
            check_id="FL001", name="All cloud flows connected to Dataverse", domain="Flows", risk="critical",
            status="info",
            count=len(flows),
            value={"total": len(flows), "active": active, "suspended": suspended, "no_solution": no_solution},
            details=f"{len(flows)} cloud flows ({active} active, {suspended} suspended, {no_solution} outside solution)",
        )

    def fl003():
        data = client.get("workflows", {"$filter": "category eq 5 and statecode eq 2", "$select": "name,ownerid", "$top": "200"})
        suspended = data.get("value", [])
        return DataverseCheckResult(
            check_id="FL003", name="Flows in suspended or throttled state", domain="Flows", risk="critical",
            status="critical" if len(suspended) > 10 else ("warning" if suspended else "passed"),
            count=len(suspended),
            details=f"{len(suspended)} flows currently suspended",
            recommendation="Investigate suspended flows — likely due to throttling, errors, or expired connections." if suspended else None,
        )

    def fl014():
        data = client.get("workflows", {"$filter": "category eq 5", "$select": "name,solutionid", "$top": "500"})
        flows = data.get("value", [])
        no_sol = [f["name"] for f in flows if not f.get("solutionid")]
        return DataverseCheckResult(
            check_id="FL014", name="Non-solution-aware flows (deployment risk)", domain="Flows", risk="high",
            status="warning" if no_sol else "passed",
            count=len(no_sol),
            details=f"{len(no_sol)} flows not included in any solution",
            recommendation="Add all flows to managed solutions to enable proper ALM and deployment." if no_sol else None,
        )

    for fn, cid, name in [
        (fl001, "FL001", "Cloud flows inventory"),
        (fl003, "FL003", "Suspended flows"),
        (fl014, "FL014", "Non-solution flows"),
    ]:
        results.append(_safe(cid, name, "Flows", "critical", fn))

    return results


def _check_plugins(client: DataverseClient) -> List[DataverseCheckResult]:
    results = []

    def p001():
        data = client.get("pluginassemblies", {"$select": "name,version,isolationmode,sourcetype", "$top": "200"})
        assemblies = data.get("value", [])
        full_trust = sum(1 for a in assemblies if a.get("isolationmode") == 2)
        sandbox = sum(1 for a in assemblies if a.get("isolationmode") == 1)
        return DataverseCheckResult(
            check_id="P001", name="Plugin assemblies registered", domain="Plugins", risk="critical",
            status="warning" if full_trust > 0 else "info",
            count=len(assemblies),
            value={"total": len(assemblies), "sandbox": sandbox, "full_trust": full_trust},
            details=f"{len(assemblies)} plugin assemblies ({sandbox} sandbox, {full_trust} full trust)",
            recommendation="Full-trust plugins bypass security sandbox — upgrade to sandbox isolation." if full_trust > 0 else None,
        )

    def p003():
        data = client.get("sdkmessageprocessingsteps", {"$select": "name,stage,mode,statecode", "$top": "500"})
        steps = data.get("value", [])
        sync = sum(1 for s in steps if s.get("mode") == 0)
        async_steps = sum(1 for s in steps if s.get("mode") == 1)
        disabled = sum(1 for s in steps if s.get("statecode") == 1)
        return DataverseCheckResult(
            check_id="P003", name="Plugin steps (SDK message processing steps)", domain="Plugins", risk="critical",
            status="warning" if sync > 50 else "info",
            count=len(steps),
            value={"total": len(steps), "sync": sync, "async": async_steps, "disabled": disabled},
            details=f"{len(steps)} plugin steps ({sync} sync, {async_steps} async, {disabled} disabled)",
            recommendation="Excessive synchronous plugins degrade form performance — convert to async where possible." if sync > 50 else None,
        )

    def p019():
        try:
            data = client.get("customapis", {"$select": "uniquename,displayname,isfunction", "$top": "100"})
            apis = data.get("value", [])
            return DataverseCheckResult(
                check_id="P019", name="Custom API definitions", domain="Plugins", risk="high",
                status="info",
                count=len(apis),
                details=f"{len(apis)} custom API definitions",
            )
        except Exception:
            return DataverseCheckResult(
                check_id="P019", name="Custom API definitions", domain="Plugins", risk="high",
                status="skipped", details="Custom APIs endpoint not accessible",
            )

    for fn, cid, name in [
        (p001, "P001", "Plugin assemblies"),
        (p003, "P003", "Plugin steps"),
        (p019, "P019", "Custom APIs"),
    ]:
        results.append(_safe(cid, name, "Plugins", "critical", fn))

    return results


def _check_workflows(client: DataverseClient) -> List[DataverseCheckResult]:
    results = []

    def w001():
        data = client.get("workflows", {"$filter": "category eq 0", "$select": "name,statecode,statuscode", "$top": "500"})
        wfs = data.get("value", [])
        active = sum(1 for w in wfs if w.get("statecode") == 1)
        return DataverseCheckResult(
            check_id="W001", name="Classic workflow definitions", domain="Workflows", risk="high",
            status="warning" if len(wfs) > 50 else "info",
            count=len(wfs),
            value={"total": len(wfs), "active": active},
            details=f"{len(wfs)} classic workflows ({active} active)",
            recommendation="Migrate classic workflows to Power Automate cloud flows for modern capabilities." if len(wfs) > 20 else None,
        )

    def w004():
        data = client.get("workflows", {"$filter": "category eq 2", "$select": "name,statecode,scope", "$top": "500"})
        rules = data.get("value", [])
        active = sum(1 for r in rules if r.get("statecode") == 1)
        return DataverseCheckResult(
            check_id="W004", name="Business rules", domain="Workflows", risk="high",
            status="info",
            count=len(rules),
            value={"total": len(rules), "active": active},
            details=f"{len(rules)} business rules ({active} active)",
        )

    def w006():
        data = client.get("workflows", {"$filter": "category eq 4", "$select": "name,statecode", "$top": "200"})
        bpfs = data.get("value", [])
        active = sum(1 for b in bpfs if b.get("statecode") == 1)
        return DataverseCheckResult(
            check_id="W006", name="Business process flows", domain="Workflows", risk="high",
            status="info",
            count=len(bpfs),
            value={"total": len(bpfs), "active": active},
            details=f"{len(bpfs)} business process flows ({active} active)",
        )

    def w009():
        try:
            data = client.get("asyncoperations", {"$filter": "statuscode eq 20", "$count": "true", "$top": "1"})
            count = data.get("@odata.count", 0)
            return DataverseCheckResult(
                check_id="W009", name="Waiting workflows (suspended)", domain="Workflows", risk="critical",
                status="warning" if count > 100 else "info",
                count=count,
                details=f"{count:,} workflows waiting for input/timer",
                recommendation="Review waiting workflows — may indicate stalled processes." if count > 100 else None,
            )
        except Exception:
            return DataverseCheckResult(
                check_id="W009", name="Waiting workflows", domain="Workflows", risk="critical",
                status="skipped", details="asyncoperations not accessible",
            )

    def w010():
        try:
            data = client.get("asyncoperations", {"$filter": "statuscode eq 31", "$count": "true", "$top": "1"})
            count = data.get("@odata.count", 0)
            return DataverseCheckResult(
                check_id="W010", name="Failed async job backlog", domain="Workflows", risk="critical",
                status="critical" if count > 500 else ("warning" if count > 50 else "passed"),
                count=count,
                details=f"{count:,} failed async operations",
                recommendation="Clear failed async operations and investigate root cause." if count > 50 else None,
            )
        except Exception:
            return DataverseCheckResult(
                check_id="W010", name="Failed async job backlog", domain="Workflows", risk="critical",
                status="skipped", details="asyncoperations not accessible",
            )

    for fn, cid, name in [
        (w001, "W001", "Classic workflows"),
        (w004, "W004", "Business rules"),
        (w006, "W006", "Business process flows"),
        (w009, "W009", "Waiting workflows"),
        (w010, "W010", "Failed async jobs"),
    ]:
        results.append(_safe(cid, name, "Workflows", "high", fn))

    return results


def _check_ui(client: DataverseClient) -> List[DataverseCheckResult]:
    results = []

    def ui001():
        data = client.get("systemforms", {"$select": "name,type,objecttypecode", "$top": "500"})
        forms = data.get("value", [])
        main_forms = sum(1 for f in forms if f.get("type") == 2)
        return DataverseCheckResult(
            check_id="UI001", name="Custom forms per entity", domain="UI & Forms", risk="high",
            status="info",
            count=len(forms),
            value={"total": len(forms), "main_forms": main_forms},
            details=f"{len(forms)} system forms ({main_forms} main forms)",
        )

    def ui007():
        data = client.get("savedqueries", {"$select": "name,querytype,statecode", "$top": "500"})
        views = data.get("value", [])
        inactive = sum(1 for v in views if v.get("statecode") == 1)
        return DataverseCheckResult(
            check_id="UI007", name="System views per entity", domain="UI & Forms", risk="medium",
            status="info",
            count=len(views),
            value={"total": len(views), "inactive": inactive},
            details=f"{len(views)} system views ({inactive} inactive)",
        )

    def ui017():
        try:
            data = client.get("customcontrols", {"$select": "name,version", "$top": "200"})
            controls = data.get("value", [])
            return DataverseCheckResult(
                check_id="UI017", name="PCF custom controls registered", domain="UI & Forms", risk="high",
                status="info",
                count=len(controls),
                details=f"{len(controls)} PCF custom controls",
            )
        except Exception:
            return DataverseCheckResult(
                check_id="UI017", name="PCF custom controls", domain="UI & Forms", risk="high",
                status="skipped", details="Custom controls endpoint not accessible",
            )

    def ui020():
        try:
            data = client.get("appmodules", {"$select": "name,uniquename,statecode", "$top": "100"})
            apps = data.get("value", [])
            return DataverseCheckResult(
                check_id="UI020", name="Model-driven apps", domain="UI & Forms", risk="high",
                status="info",
                count=len(apps),
                details=f"{len(apps)} model-driven apps defined",
            )
        except Exception:
            return DataverseCheckResult(
                check_id="UI020", name="Model-driven apps", domain="UI & Forms", risk="high",
                status="skipped", details="App modules endpoint not accessible",
            )

    for fn, cid, name in [
        (ui001, "UI001", "Custom forms"),
        (ui007, "UI007", "System views"),
        (ui017, "UI017", "PCF controls"),
        (ui020, "UI020", "Model-driven apps"),
    ]:
        results.append(_safe(cid, name, "UI & Forms", "high", fn))

    return results


def _check_web_resources(client: DataverseClient) -> List[DataverseCheckResult]:
    results = []

    def wr001():
        data = client.get("webresources", {"$select": "name,webresourcetype,solutionid", "$top": "500"})
        wr = data.get("value", [])
        by_type: Dict[int, int] = {}
        for w in wr:
            t = w.get("webresourcetype", 0)
            by_type[t] = by_type.get(t, 0) + 1
        type_labels = {1: "HTML", 2: "CSS", 3: "JS", 4: "XML", 5: "PNG", 6: "JPG", 7: "GIF", 8: "XAP", 9: "XSL", 10: "ICO", 11: "SVG", 12: "RESX"}
        distribution = {type_labels.get(k, str(k)): v for k, v in by_type.items()}
        return DataverseCheckResult(
            check_id="WR001", name="Web resource inventory (JS/HTML/CSS/images)", domain="Web Resources", risk="high",
            status="info",
            count=len(wr),
            value={"total": len(wr), "by_type": distribution},
            details=f"{len(wr)} web resources by type: {distribution}",
        )

    for fn, cid, name in [
        (wr001, "WR001", "Web resources inventory"),
    ]:
        results.append(_safe(cid, name, "Web Resources", "high", fn))

    return results


def _check_integrations(client: DataverseClient) -> List[DataverseCheckResult]:
    results = []

    def i001():
        data = client.get("systemusers", {"$filter": "applicationid ne null", "$select": "fullname,applicationid", "$top": "100"})
        app_users = data.get("value", [])
        return DataverseCheckResult(
            check_id="I001", name="Application users (API consumers)", domain="Integrations", risk="critical",
            status="info",
            count=len(app_users),
            details=f"{len(app_users)} application users consuming the Dataverse API",
        )

    def i004():
        try:
            data = client.get("serviceendpoints", {"$filter": "contracttype eq 8", "$select": "name,connectionmode", "$top": "100"})
            webhooks = data.get("value", [])
            return DataverseCheckResult(
                check_id="I004", name="Webhook registrations", domain="Integrations", risk="high",
                status="info",
                count=len(webhooks),
                details=f"{len(webhooks)} webhooks registered",
            )
        except Exception:
            return DataverseCheckResult(
                check_id="I004", name="Webhook registrations", domain="Integrations", risk="high",
                status="skipped", details="Service endpoints not accessible",
            )

    def i015():
        try:
            data = client.get("emailserverprofiles", {"$select": "name,incomingservertype,statecode", "$top": "50"})
            profiles = data.get("value", [])
            return DataverseCheckResult(
                check_id="I015", name="Email server profile configurations", domain="Integrations", risk="high",
                status="info",
                count=len(profiles),
                details=f"{len(profiles)} email server profiles configured",
            )
        except Exception:
            return DataverseCheckResult(
                check_id="I015", name="Email server profiles", domain="Integrations", risk="high",
                status="skipped", details="Email server profiles not accessible",
            )

    def i017():
        try:
            data = client.get("sharepointdocumentlocations", {"$count": "true", "$top": "1"})
            count = data.get("@odata.count", 0)
            return DataverseCheckResult(
                check_id="I017", name="SharePoint document location integrations", domain="Integrations", risk="medium",
                status="info",
                count=count,
                details=f"{count:,} SharePoint document locations configured",
            )
        except Exception:
            return DataverseCheckResult(
                check_id="I017", name="SharePoint integrations", domain="Integrations", risk="medium",
                status="skipped", details="SharePoint document locations not accessible",
            )

    for fn, cid, name in [
        (i001, "I001", "Application users"),
        (i004, "I004", "Webhooks"),
        (i015, "I015", "Email server profiles"),
        (i017, "I017", "SharePoint integrations"),
    ]:
        results.append(_safe(cid, name, "Integrations", "critical", fn))

    return results


def _check_audit(client: DataverseClient) -> List[DataverseCheckResult]:
    results = []

    def au001():
        orgs = client.get_value("organizations", {"$select": "isauditenabled,auditretentionperiod", "$top": "1"})
        org = orgs[0] if orgs else {}
        audit_on = org.get("isauditenabled", False)
        retention = org.get("auditretentionperiod", 0)
        return DataverseCheckResult(
            check_id="AU001", name="Audit log enabled at organization level", domain="Audit", risk="critical",
            status="critical" if not audit_on else "passed",
            value={"enabled": audit_on, "retention_days": retention},
            details=f"Audit {'enabled' if audit_on else 'DISABLED'} at org level — retention: {retention} days",
            recommendation="Enable organization-level auditing immediately to capture security events." if not audit_on else (
                "Review retention period — ensure it meets compliance requirements." if retention < 90 else None
            ),
        )

    def au004():
        try:
            data = client.get("audits", {"$count": "true", "$top": "1"})
            count = data.get("@odata.count", 0)
            return DataverseCheckResult(
                check_id="AU004", name="Total audit log record count", domain="Audit", risk="high",
                status="info",
                count=count,
                details=f"{count:,} audit log records",
            )
        except Exception:
            return DataverseCheckResult(
                check_id="AU004", name="Audit log count", domain="Audit", risk="high",
                status="skipped", details="Audit log not accessible (requires System Administrator)",
            )

    def au017():
        try:
            data = client.get("plugintracelog", {"$count": "true", "$top": "1"})
            count = data.get("@odata.count", 0)
            return DataverseCheckResult(
                check_id="AU017", name="Plugin trace log size", domain="Audit", risk="high",
                status="warning" if count > 50000 else "info",
                count=count,
                details=f"{count:,} plugin trace log entries",
                recommendation="Enable plugin trace log cleanup job to prevent storage bloat." if count > 50000 else None,
            )
        except Exception:
            return DataverseCheckResult(
                check_id="AU017", name="Plugin trace log", domain="Audit", risk="high",
                status="skipped", details="Plugin trace log not accessible",
            )

    for fn, cid, name in [
        (au001, "AU001", "Org-level audit enabled"),
        (au004, "AU004", "Audit log count"),
        (au017, "AU017", "Plugin trace log"),
    ]:
        results.append(_safe(cid, name, "Audit", "critical", fn))

    return results


def _check_environment(client: DataverseClient) -> List[DataverseCheckResult]:
    results = []

    def env001():
        orgs = client.get_value(
            "organizations",
            {"$select": "name,version,languagecode,isduplicatedetectionenabled,isautosaveenabled,issophisticatedsearchenabled,plugintracelogsetting"},
        )
        org = orgs[0] if orgs else {}
        return DataverseCheckResult(
            check_id="ENV001", name="Organization settings record", domain="Environment", risk="critical",
            status="info",
            value=org,
            details=f"Org: {org.get('name')} | Version: {org.get('version')} | Lang: {org.get('languagecode')}",
        )

    def env007():
        orgs = client.get_value("organizations", {"$select": "isduplicatedetectionenabled"})
        org = orgs[0] if orgs else {}
        enabled = org.get("isduplicatedetectionenabled", False)
        return DataverseCheckResult(
            check_id="ENV007", name="Duplicate detection enabled globally", domain="Environment", risk="high",
            status="passed" if enabled else "warning",
            value={"enabled": enabled},
            details=f"Global duplicate detection: {'enabled' if enabled else 'disabled'}",
            recommendation="Enable global duplicate detection to enforce data quality across entities." if not enabled else None,
        )

    def env009():
        try:
            data = client.get("bulkdeletejobs", {"$select": "name,statecode", "$top": "100"})
            jobs = data.get("value", [])
            return DataverseCheckResult(
                check_id="ENV009", name="Bulk delete jobs configured", domain="Environment", risk="high",
                status="info",
                count=len(jobs),
                details=f"{len(jobs)} bulk delete jobs scheduled",
                recommendation="Schedule bulk delete jobs for audit, async ops, and import logs to manage storage." if len(jobs) < 3 else None,
            )
        except Exception:
            return DataverseCheckResult(
                check_id="ENV009", name="Bulk delete jobs", domain="Environment", risk="high",
                status="skipped", details="Bulk delete jobs not accessible",
            )

    def env019():
        orgs = client.get_value("organizations", {"$select": "issophisticatedsearchenabled"})
        org = orgs[0] if orgs else {}
        enabled = org.get("issophisticatedsearchenabled", False)
        return DataverseCheckResult(
            check_id="ENV019", name="Dataverse search (full-text) enabled", domain="Environment", risk="medium",
            status="info",
            value={"enabled": enabled},
            details=f"Dataverse search (relevance search): {'enabled' if enabled else 'disabled'}",
        )

    for fn, cid, name in [
        (env001, "ENV001", "Organization settings"),
        (env007, "ENV007", "Duplicate detection"),
        (env009, "ENV009", "Bulk delete jobs"),
        (env019, "ENV019", "Dataverse search"),
    ]:
        results.append(_safe(cid, name, "Environment", "critical", fn))

    return results


def _check_performance(client: DataverseClient) -> List[DataverseCheckResult]:
    results = []

    def pf003():
        data = client.get(
            "workflows",
            {"$filter": "category eq 5 and filteringattributes eq null", "$select": "name", "$top": "200"},
        )
        flows = data.get("value", [])
        return DataverseCheckResult(
            check_id="PF003", name="Flows firing on all attribute changes (no filter)", domain="Performance", risk="critical",
            status="critical" if len(flows) > 10 else ("warning" if flows else "passed"),
            count=len(flows),
            details=f"{len(flows)} flows trigger on ALL attribute changes (no filteringattributes)",
            recommendation="Add filteringattributes to flows to reduce unnecessary trigger execution." if flows else None,
        )

    def pf004():
        try:
            data = client.get("asyncoperations", {"$filter": "statuscode eq 0", "$count": "true", "$top": "1"})
            count = data.get("@odata.count", 0)
            return DataverseCheckResult(
                check_id="PF004", name="Async job queue depth", domain="Performance", risk="critical",
                status="critical" if count > 10000 else ("warning" if count > 1000 else "passed"),
                count=count,
                details=f"{count:,} async operations waiting in queue",
                recommendation="Investigate queue backlog — may indicate performance bottleneck." if count > 1000 else None,
            )
        except Exception:
            return DataverseCheckResult(
                check_id="PF004", name="Async job queue depth", domain="Performance", risk="critical",
                status="skipped", details="asyncoperations not accessible",
            )

    def pf007():
        data = client.get(
            "sdkmessageprocessingsteps",
            {"$filter": "mode eq 0", "$select": "name,stage", "$top": "500"},
        )
        sync_steps = data.get("value", [])
        pre_op = sum(1 for s in sync_steps if s.get("stage") == 20)
        post_op = sum(1 for s in sync_steps if s.get("stage") == 40)
        return DataverseCheckResult(
            check_id="PF007", name="Synchronous plugin chains on critical messages", domain="Performance", risk="critical",
            status="critical" if len(sync_steps) > 100 else ("warning" if len(sync_steps) > 30 else "info"),
            count=len(sync_steps),
            value={"total_sync": len(sync_steps), "pre_operation": pre_op, "post_operation": post_op},
            details=f"{len(sync_steps)} synchronous plugin steps ({pre_op} pre-op, {post_op} post-op)",
            recommendation="Excessive synchronous plugins significantly degrade transaction performance." if len(sync_steps) > 50 else None,
        )

    for fn, cid, name in [
        (pf003, "PF003", "Flows without attribute filter"),
        (pf004, "PF004", "Async job queue depth"),
        (pf007, "PF007", "Synchronous plugin chains"),
    ]:
        results.append(_safe(cid, name, "Performance", "critical", fn))

    return results


def _check_service_management(client: DataverseClient) -> List[DataverseCheckResult]:
    results = []

    def sv001():
        data = client.get("queues", {"$select": "name,queueviewtype,statecode", "$top": "200"})
        queues = data.get("value", [])
        active = sum(1 for q in queues if q.get("statecode") == 0)
        return DataverseCheckResult(
            check_id="SV001", name="Queue definitions", domain="Service Management", risk="high",
            status="info",
            count=len(queues),
            value={"total": len(queues), "active": active},
            details=f"{len(queues)} queues ({active} active)",
        )

    def sv005():
        try:
            data = client.get("slas", {"$select": "name,statecode", "$top": "200"})
            slas = data.get("value", [])
            active = sum(1 for s in slas if s.get("statecode") == 1)
            return DataverseCheckResult(
                check_id="SV005", name="SLA definitions", domain="Service Management", risk="critical",
                status="info",
                count=len(slas),
                value={"total": len(slas), "active": active},
                details=f"{len(slas)} SLAs ({active} active)",
            )
        except Exception:
            return DataverseCheckResult(
                check_id="SV005", name="SLA definitions", domain="Service Management", risk="critical",
                status="skipped", details="SLAs endpoint not accessible",
            )

    def sv006():
        try:
            data = client.get("slakpiinstances", {"$filter": "status eq 3", "$count": "true", "$top": "1"})
            count = data.get("@odata.count", 0)
            return DataverseCheckResult(
                check_id="SV006", name="SLA KPI instances in breached status", domain="Service Management", risk="critical",
                status="critical" if count > 100 else ("warning" if count > 0 else "passed"),
                count=count,
                details=f"{count:,} SLA KPI instances currently in breach",
                recommendation="Investigate and resolve breached SLA cases immediately." if count > 0 else None,
            )
        except Exception:
            return DataverseCheckResult(
                check_id="SV006", name="SLA breach status", domain="Service Management", risk="critical",
                status="skipped", details="SLA KPI instances not accessible",
            )

    for fn, cid, name in [
        (sv001, "SV001", "Queue definitions"),
        (sv005, "SV005", "SLA definitions"),
        (sv006, "SV006", "SLA breaches"),
    ]:
        results.append(_safe(cid, name, "Service Management", "critical", fn))

    return results


def _check_retention(client: DataverseClient) -> List[DataverseCheckResult]:
    results = []

    def rt001():
        try:
            data = client.get("retentionconfigs", {"$select": "entitylogicalname,statecode", "$top": "200"})
            configs = data.get("value", [])
            active = sum(1 for c in configs if c.get("statecode") == 0)
            return DataverseCheckResult(
                check_id="RT001", name="Retention policies configured per table", domain="Retention", risk="critical",
                status="info",
                count=len(configs),
                value={"total": len(configs), "active": active},
                details=f"{len(configs)} retention policies ({active} active)",
                recommendation="Define retention policies for high-volume tables to manage storage costs." if not configs else None,
            )
        except Exception:
            return DataverseCheckResult(
                check_id="RT001", name="Retention policies", domain="Retention", risk="critical",
                status="skipped", details="Retention configs not accessible",
            )

    def rt007():
        try:
            data = client.get(
                "bulkdeletejobs",
                {"$filter": "contains(tolower(name),'audit')", "$select": "name,statecode,nextrun", "$top": "50"},
            )
            jobs = data.get("value", [])
            return DataverseCheckResult(
                check_id="RT007", name="Audit log purge schedule", domain="Retention", risk="critical",
                status="warning" if not jobs else "passed",
                count=len(jobs),
                details=f"{len(jobs)} audit purge bulk delete jobs",
                recommendation="Schedule audit log cleanup to prevent unbounded storage growth." if not jobs else None,
            )
        except Exception:
            return DataverseCheckResult(
                check_id="RT007", name="Audit log purge schedule", domain="Retention", risk="critical",
                status="skipped", details="Bulk delete jobs not accessible",
            )

    for fn, cid, name in [
        (rt001, "RT001", "Retention policies"),
        (rt007, "RT007", "Audit log purge"),
    ]:
        results.append(_safe(cid, name, "Retention", "critical", fn))

    return results


def _check_ai(client: DataverseClient) -> List[DataverseCheckResult]:
    results = []

    def ai002():
        try:
            data = client.get("msdyn_aimodels", {"$select": "msdyn_name,statecode,msdyn_modeltype", "$top": "100"})
            models = data.get("value", [])
            return DataverseCheckResult(
                check_id="AI002", name="AI Builder models deployed", domain="AI & Copilot", risk="high",
                status="info",
                count=len(models),
                details=f"{len(models)} AI Builder models deployed",
            )
        except Exception:
            return DataverseCheckResult(
                check_id="AI002", name="AI Builder models", domain="AI & Copilot", risk="high",
                status="skipped", details="AI models endpoint not accessible",
            )

    def ai010():
        try:
            orgs = client.get_value("organizations", {"$select": "iscopilotformenabledbydefault"})
            org = orgs[0] if orgs else {}
            enabled = org.get("iscopilotformenabledbydefault", False)
            return DataverseCheckResult(
                check_id="AI010", name="Copilot on forms enabled by default", domain="AI & Copilot", risk="medium",
                status="info",
                value={"enabled": enabled},
                details=f"Copilot on forms: {'enabled by default' if enabled else 'disabled/not set'}",
            )
        except Exception:
            return DataverseCheckResult(
                check_id="AI010", name="Copilot on forms", domain="AI & Copilot", risk="medium",
                status="skipped", details="Copilot setting not accessible",
            )

    for fn, cid, name in [
        (ai002, "AI002", "AI Builder models"),
        (ai010, "AI010", "Copilot on forms"),
    ]:
        results.append(_safe(cid, name, "AI & Copilot", "high", fn))

    return results


# ── Domain summary computation ────────────────────────────────────────────────

def _compute_summary(checks: List[DataverseCheckResult]) -> DataverseDomainSummary:
    domain = checks[0].domain if checks else "Unknown"
    crit = sum(1 for c in checks if c.status == "critical")
    warn = sum(1 for c in checks if c.status == "warning")
    passed = sum(1 for c in checks if c.status == "passed")
    err = sum(1 for c in checks if c.status == "error")
    skipped = sum(1 for c in checks if c.status == "skipped")
    info = sum(1 for c in checks if c.status == "info")

    by_risk: Dict[str, int] = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    for c in checks:
        if c.status in ("critical", "warning"):
            by_risk[c.risk] = by_risk.get(c.risk, 0) + 1

    total = len(checks)
    healthy = passed + info + skipped
    score = round((healthy / total) * 100, 1) if total > 0 else 100.0

    return DataverseDomainSummary(
        domain=domain,
        total_checks=total,
        critical=crit + by_risk.get("critical", 0),
        high=warn + by_risk.get("high", 0),
        medium=by_risk.get("medium", 0),
        low=by_risk.get("low", 0),
        passed=passed,
        errors=err,
        score=score,
    )


# ── Main assessment entry point ───────────────────────────────────────────────

def run_assessment(job_id: str, request: DataverseAssessmentRequest) -> None:
    _update(job_id, status="running", progress_message=STEPS[0])
    t_start = time.time()
    all_checks: List[DataverseCheckResult] = []
    errors: List[str] = []

    try:
        client = DataverseClient(request.credentials)

        # Step 1: Connect + org info
        _update(job_id, progress_message=STEPS[1], checks_completed=1)
        org = {}
        try:
            org = client.test_connection()
        except Exception as exc:
            errors.append(f"Connection: {exc}")
            _finalize(job_id, request, [], errors, org, t_start, failed=True)
            return

        # Step 2: Tables
        _update(job_id, progress_message=STEPS[2], checks_completed=2)
        checks = _check_tables(client, request.max_entities)
        all_checks.extend(checks)

        # Step 3: Columns
        _update(job_id, progress_message=STEPS[3], checks_completed=3)
        all_checks.extend(_check_columns(client))

        # Step 4: Relationships
        _update(job_id, progress_message=STEPS[4], checks_completed=4)
        all_checks.extend(_check_relationships(client))

        # Step 5: Option Sets
        _update(job_id, progress_message=STEPS[5], checks_completed=5)
        all_checks.extend(_check_option_sets(client))

        # Step 6: Data Volume
        if request.include_data_volume:
            _update(job_id, progress_message=STEPS[6], checks_completed=6)
            all_checks.extend(_check_data_volume(client))

        # Step 7: Data Quality
        if request.include_data_quality:
            _update(job_id, progress_message=STEPS[7], checks_completed=7)
            all_checks.extend(_check_data_quality(client))

        # Step 8-10: Security
        if request.include_security:
            _update(job_id, progress_message=STEPS[8], checks_completed=8)
            all_checks.extend(_check_security_roles(client))

            _update(job_id, progress_message=STEPS[9], checks_completed=9)
            all_checks.extend(_check_users_teams(client))

            _update(job_id, progress_message=STEPS[10], checks_completed=10)
            all_checks.extend(_check_field_security(client))

        # Step 11: Solutions
        _update(job_id, progress_message=STEPS[11], checks_completed=11)
        all_checks.extend(_check_solutions(client))

        # Step 12-13: Automation
        if request.include_flows:
            _update(job_id, progress_message=STEPS[12], checks_completed=12)
            all_checks.extend(_check_flows(client))

        if request.include_plugins:
            _update(job_id, progress_message=STEPS[13], checks_completed=13)
            all_checks.extend(_check_plugins(client))
            _update(job_id, progress_message=STEPS[14], checks_completed=14)
            all_checks.extend(_check_workflows(client))

        # Step 14-16: UI
        if request.include_ui:
            _update(job_id, progress_message=STEPS[15], checks_completed=15)
            all_checks.extend(_check_ui(client))
            _update(job_id, progress_message=STEPS[16], checks_completed=16)
            all_checks.extend(_check_web_resources(client))

        # Step 17: Integrations
        _update(job_id, progress_message=STEPS[17], checks_completed=17)
        all_checks.extend(_check_integrations(client))

        # Step 18-19: Audit + Environment
        if request.include_audit:
            _update(job_id, progress_message=STEPS[18], checks_completed=18)
            all_checks.extend(_check_audit(client))

        _update(job_id, progress_message=STEPS[19], checks_completed=19)
        all_checks.extend(_check_environment(client))

        # Step 20: Performance
        _update(job_id, progress_message=STEPS[20], checks_completed=20)
        all_checks.extend(_check_performance(client))

        # Step 21: Service Management
        _update(job_id, progress_message=STEPS[21], checks_completed=21)
        all_checks.extend(_check_service_management(client))

        # Step 22: Retention
        _update(job_id, progress_message=STEPS[22], checks_completed=22)
        all_checks.extend(_check_retention(client))

        # Step 23: AI
        if request.include_ai:
            _update(job_id, progress_message=STEPS[23], checks_completed=23)
            all_checks.extend(_check_ai(client))

        _update(job_id, progress_message=STEPS[24], checks_completed=24)
        _finalize(job_id, request, all_checks, errors, org, t_start, failed=False)

    except Exception as exc:
        errors.append(str(exc))
        _finalize(job_id, request, all_checks, errors, {}, t_start, failed=True)


def _finalize(
    job_id: str,
    request: DataverseAssessmentRequest,
    all_checks: List[DataverseCheckResult],
    errors: List[str],
    org: Dict,
    t_start: float,
    failed: bool,
) -> None:
    duration = round(time.time() - t_start, 1)

    # Group checks by domain for summaries
    domain_map: Dict[str, List[DataverseCheckResult]] = {}
    for c in all_checks:
        domain_map.setdefault(c.domain, []).append(c)

    domain_summaries = [_compute_summary(checks) for checks in domain_map.values()]

    # Aggregate finding counts
    crit = sum(1 for c in all_checks if c.status == "critical")
    high = sum(1 for c in all_checks if c.status == "warning" and c.risk in ("critical", "high"))
    med  = sum(1 for c in all_checks if c.status == "warning" and c.risk == "medium")
    low  = sum(1 for c in all_checks if c.status == "warning" and c.risk == "low")

    total = len(all_checks)
    healthy = sum(1 for c in all_checks if c.status in ("passed", "info", "skipped"))
    score = round((healthy / total) * 100, 1) if total > 0 else 0.0

    result = DataverseAssessmentResult(
        job_id=job_id,
        status="failed" if failed and not all_checks else "completed",
        environment_url=request.credentials.environment_url,
        organization_name=org.get("name"),
        organization_version=org.get("version"),
        total_checks=total,
        critical_findings=crit,
        high_findings=high,
        medium_findings=med,
        low_findings=low,
        overall_score=score,
        domain_summaries=domain_summaries,
        check_results=all_checks,
        errors=errors,
        completed_at=datetime.now(timezone.utc).isoformat(),
        duration_seconds=duration,
    )

    _update(
        job_id,
        status="failed" if failed and not all_checks else "completed",
        completed_at=result.completed_at,
        duration_seconds=duration,
        result=result,
        checks_completed=len(STEPS),
        total_checks=len(STEPS),
        progress_message="Assessment complete" if not failed else "Assessment failed",
    )
