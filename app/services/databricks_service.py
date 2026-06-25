"""
Databricks workspace assessment service.
35-step pipeline covering compute, Unity Catalog, jobs, security,
integrations, and MLflow/serving. Produces a 9-sheet Excel workbook.
"""

import io
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from app.core.logging import get_logger
from app.db import azure_store
from app.db.databricks_client import DatabricksClient
from app.models.databricks_requests import (
    DatabricksAssessmentRequest,
    DatabricksAssessmentResult,
    DatabricksCheckResult,
    DatabricksCluster,
    DatabricksClusterSummary,
    DatabricksCatalog,
    DatabricksIntegrationSummary,
    DatabricksJob,
    DatabricksJobSummary,
    DatabricksMLflowSummary,
    DatabricksSecuritySummary,
    DatabricksUnityCatalogSummary,
    DatabricksUser,
    DatabricksWarehouse,
    DatabricksWarehouseSummary,
    DatabricksWorkspaceInfo,
)

logger = get_logger(__name__)

# ── Job store ─────────────────────────────────────────────────────────────────

_jobs: dict[str, dict] = {}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _update_job(job_id: str, **kwargs) -> None:
    if job_id in _jobs:
        _jobs[job_id].update(kwargs)
        try:
            azure_store.databricks_upsert_session(_jobs[job_id])
        except Exception as exc:
            logger.warning("databricks_upsert_session failed (non-fatal): %s", exc)


# ── Public API ────────────────────────────────────────────────────────────────

def test_connection(request: DatabricksAssessmentRequest) -> dict:
    """Validate PAT and return workspace identity."""
    token = request.credentials.access_token.get_secret_value()
    client = DatabricksClient(request.credentials.workspace_url, token)
    me = client.get_current_user()
    workspace_url = request.credentials.workspace_url.rstrip("/")
    return {
        "ok": True,
        "user_name": me.get("userName") or me.get("displayName", ""),
        "workspace_url": workspace_url,
    }


def create_job(request: DatabricksAssessmentRequest) -> dict:
    job_id = str(uuid.uuid4())
    record = {
        "job_id": job_id,
        "label": request.label,
        "workspace_url": request.credentials.workspace_url,
        "status": "pending",
        "progress_message": "Queued",
        "created_at": _now_iso(),
        "completed_at": None,
        "error": None,
        "results": None,
        "duration_seconds": None,
        "cluster_count": None,
        "warehouse_count": None,
        "catalog_count": None,
        "job_count": None,
        "total_checks": None,
        "passed_checks": None,
        "critical_findings": None,
        "high_findings": None,
        "overall_score": None,
    }
    _jobs[job_id] = record
    try:
        azure_store.databricks_upsert_session(record)
    except Exception as exc:
        logger.warning("Initial databricks upsert failed (non-fatal): %s", exc)
    return record


def get_job(job_id: str) -> Optional[dict]:
    if job_id in _jobs:
        return _jobs[job_id]
    return azure_store.databricks_get_session(job_id)


def list_jobs() -> list[dict]:
    return azure_store.databricks_list_sessions()


async def run_assessment(job_id: str, request: DatabricksAssessmentRequest) -> None:
    """Main 35-step async assessment pipeline."""
    t0 = time.perf_counter()
    token = request.credentials.access_token.get_secret_value()
    client = DatabricksClient(request.credentials.workspace_url, token)
    checks: list[DatabricksCheckResult] = []

    def step(n: int, msg: str) -> None:
        _update_job(job_id, status="running", progress_message=f"Step {n}/35: {msg}")

    def add_check(
        domain: str, check: str,
        status: str, risk: str,
        count: Optional[int] = None, details: Optional[str] = None,
        recommendation: Optional[str] = None,
        value: Any = None,
    ) -> None:
        checks.append(DatabricksCheckResult(
            domain=domain, check=check,
            status=status, risk=risk,
            count=count, details=details,
            recommendation=recommendation, value=value,
        ))

    try:
        # ── Step 1: Connect & validate workspace ──────────────────────────────
        step(1, "Connecting to workspace")
        me = client.get_current_user()
        caller_name = me.get("userName") or me.get("displayName", "unknown")
        workspace_url = request.credentials.workspace_url.rstrip("/")

        # ── Step 2: Workspace metadata ────────────────────────────────────────
        step(2, "Reading workspace configuration")
        ws_conf = client.get_workspace_config()
        deployment_name = workspace_url.split("//")[-1].split(".")[0]
        workspace_info = DatabricksWorkspaceInfo(
            deployment_name=deployment_name,
            workspace_url=workspace_url,
        )

        token_config_enabled = ws_conf.get("enableTokensConfig", "").lower() == "true"
        ip_lists_enabled = ws_conf.get("enableIpAccessLists", "").lower() == "true"

        # ── Step 3: Metastore / Unity Catalog root ────────────────────────────
        step(3, "Reading Unity Catalog metastore")
        metastore = client.get_metastore_summary()
        uc_enabled = bool(metastore)
        workspace_info.metastore_id = metastore.get("metastore_id")
        workspace_info.workspace_name = metastore.get("name") or deployment_name

        add_check(
            "Unity Catalog", "Unity Catalog enabled",
            "pass" if uc_enabled else "warn",
            "high" if not uc_enabled else "none",
            details="Metastore found" if uc_enabled else "No metastore attached to this workspace",
            recommendation=None if uc_enabled else "Attach a Unity Catalog metastore to enable centralised governance",
        )

        # ── Step 4: Clusters inventory ────────────────────────────────────────
        step(4, "Listing all clusters")
        raw_clusters = client.list_clusters() if request.include_clusters else []
        clusters: list[DatabricksCluster] = []
        for c in raw_clusters:
            autoscale = c.get("autoscale") or {}
            clusters.append(DatabricksCluster(
                cluster_id=c.get("cluster_id", ""),
                cluster_name=c.get("cluster_name"),
                cluster_source=c.get("cluster_source"),
                state=c.get("state"),
                spark_version=c.get("spark_version"),
                node_type_id=c.get("node_type_id"),
                driver_node_type_id=c.get("driver_node_type_id"),
                autotermination_minutes=c.get("autotermination_minutes"),
                enable_elastic_disk=c.get("enable_elastic_disk"),
                runtime_engine=c.get("runtime_engine"),
                num_workers=c.get("num_workers"),
                autoscale_min=autoscale.get("min_workers"),
                autoscale_max=autoscale.get("max_workers"),
                policy_id=c.get("policy_id"),
                creator_user_name=c.get("creator_user_name"),
                start_time=str(c.get("start_time", "")) or None,
                terminated_time=str(c.get("terminated_time", "")) or None,
            ))

        # ── Step 5: Cluster analysis ──────────────────────────────────────────
        step(5, "Analysing cluster configuration")
        running = [c for c in clusters if c.state == "RUNNING"]
        terminated = [c for c in clusters if c.state == "TERMINATED"]
        all_purpose = [c for c in clusters if c.cluster_source in ("UI", "API", None)]
        job_cls = [c for c in clusters if c.cluster_source == "JOB"]
        no_autoterm = [c for c in clusters if (c.autotermination_minutes or 0) == 0 and c.cluster_source != "JOB"]
        photon = [c for c in clusters if c.runtime_engine == "PHOTON"]
        legacy = [c for c in clusters if c.spark_version and ("7." in c.spark_version or "8." in c.spark_version or "9." in c.spark_version)]
        policy_compliant = [c for c in clusters if c.policy_id]
        single_node = [c for c in clusters if (c.num_workers == 0 and not c.autoscale_min)]

        cluster_summary = DatabricksClusterSummary(
            total_clusters=len(clusters),
            running_clusters=len(running),
            terminated_clusters=len(terminated),
            all_purpose_clusters=len(all_purpose),
            job_clusters=len(job_cls),
            clusters_without_autoterminate=len(no_autoterm),
            photon_enabled_clusters=len(photon),
            legacy_runtime_clusters=len(legacy),
            policy_compliant_clusters=len(policy_compliant),
            single_node_clusters=len(single_node),
        )

        add_check(
            "Compute", "All-purpose clusters without auto-termination",
            "fail" if no_autoterm else "pass",
            "high" if no_autoterm else "none",
            count=len(no_autoterm),
            details=f"{len(no_autoterm)} cluster(s) have no auto-termination set",
            recommendation="Set auto-termination (≤120 min) on all interactive clusters to avoid idle DBU charges",
        )
        add_check(
            "Compute", "Legacy Spark runtime versions (< 10.x)",
            "warn" if legacy else "pass",
            "medium" if legacy else "none",
            count=len(legacy),
            details=f"{len(legacy)} cluster(s) running unsupported DBR < 10.x",
            recommendation="Upgrade to a current LTS Databricks Runtime for security patches and feature support",
        )
        add_check(
            "Compute", "Cluster policy compliance",
            "warn" if (clusters and not policy_compliant) else "pass",
            "medium" if (clusters and not policy_compliant) else "none",
            count=len(policy_compliant),
            details=f"{len(policy_compliant)}/{len(clusters)} clusters governed by a policy",
            recommendation="Attach cluster policies to enforce governance and cost guardrails",
        )
        add_check(
            "Compute", "Photon acceleration adoption",
            "info",
            "none",
            count=len(photon),
            details=f"{len(photon)} Photon-enabled cluster(s) detected",
        )

        # ── Step 6: Cluster policies ──────────────────────────────────────────
        step(6, "Reading cluster policies")
        policies = client.list_cluster_policies()
        add_check(
            "Governance", "Cluster policies defined",
            "pass" if policies else "warn",
            "medium" if not policies else "none",
            count=len(policies),
            details=f"{len(policies)} cluster polic{'y' if len(policies)==1 else 'ies'} found",
            recommendation="Create cluster policies to enforce node types, max DBUs, and auto-termination",
        )

        # ── Step 7: Instance pools ────────────────────────────────────────────
        step(7, "Reading instance pools")
        pools = client.list_instance_pools()
        add_check(
            "Compute", "Instance pools configured",
            "info",
            "none",
            count=len(pools),
            details=f"{len(pools)} instance pool(s) available for fast cluster start",
        )

        # ── Step 8: SQL Warehouses ────────────────────────────────────────────
        step(8, "Listing SQL Warehouses")
        raw_wh = client.list_warehouses() if request.include_warehouses else []
        warehouses: list[DatabricksWarehouse] = []
        for w in raw_wh:
            warehouses.append(DatabricksWarehouse(
                id=w.get("id", ""),
                name=w.get("name"),
                cluster_size=w.get("cluster_size"),
                min_num_clusters=w.get("min_num_clusters"),
                max_num_clusters=w.get("max_num_clusters"),
                auto_stop_mins=w.get("auto_stop_mins"),
                state=w.get("state"),
                warehouse_type=w.get("warehouse_type"),
                enable_photon=w.get("enable_photon"),
                channel_name=(w.get("channel") or {}).get("name"),
                creator_name=w.get("creator_name"),
                num_active_sessions=w.get("num_active_sessions", 0),
            ))

        # ── Step 9: Warehouse analysis ────────────────────────────────────────
        step(9, "Analysing SQL Warehouse configuration")
        wh_running = [w for w in warehouses if w.state == "RUNNING"]
        wh_stopped = [w for w in warehouses if w.state == "STOPPED"]
        wh_serverless = [w for w in warehouses if w.warehouse_type == "PRO" or w.warehouse_type == "SERVERLESS"]
        wh_classic = [w for w in warehouses if w.warehouse_type == "CLASSIC"]
        wh_no_stop = [w for w in warehouses if (w.auto_stop_mins or 0) == 0]

        warehouse_summary = DatabricksWarehouseSummary(
            total_warehouses=len(warehouses),
            running_warehouses=len(wh_running),
            stopped_warehouses=len(wh_stopped),
            serverless_warehouses=len(wh_serverless),
            classic_warehouses=len(wh_classic),
            warehouses_without_auto_stop=len(wh_no_stop),
        )

        add_check(
            "Compute", "SQL Warehouses without auto-stop",
            "fail" if wh_no_stop else "pass",
            "high" if wh_no_stop else "none",
            count=len(wh_no_stop),
            details=f"{len(wh_no_stop)} warehouse(s) have no auto-stop configured",
            recommendation="Set auto-stop on all warehouses to reduce idle SQL compute costs",
        )
        add_check(
            "Compute", "Serverless SQL Warehouse adoption",
            "info",
            "none",
            count=len(wh_serverless),
            details=f"{len(wh_serverless)} serverless / Pro warehouse(s) vs {len(wh_classic)} classic",
        )

        # ── Step 10: Catalogs ─────────────────────────────────────────────────
        step(10, "Listing Unity Catalog catalogs")
        raw_catalogs = client.list_catalogs() if (request.include_unity_catalog and uc_enabled) else []
        catalogs: list[DatabricksCatalog] = []
        for cat in raw_catalogs:
            catalogs.append(DatabricksCatalog(
                name=cat.get("name", ""),
                catalog_type=cat.get("catalog_type"),
                comment=cat.get("comment"),
                owner=cat.get("owner"),
                metastore_id=cat.get("metastore_id"),
                storage_location=cat.get("storage_location"),
                created_at=str(cat.get("created_at", "")) or None,
                updated_at=str(cat.get("updated_at", "")) or None,
            ))

        # ── Step 11: Schemas ──────────────────────────────────────────────────
        step(11, "Counting schemas across catalogs")
        total_schemas = 0
        total_tables = 0
        total_views = 0
        schema_limit = 3  # sample first N catalogs to avoid timeout
        for cat in catalogs[:schema_limit]:
            if cat.catalog_type in ("SYSTEM", "DELTASHARING"):
                continue
            schemas = client.list_schemas(cat.name)
            cat.schema_count = len(schemas)
            total_schemas += len(schemas)
            for sch in schemas[:5]:  # sample first 5 schemas per catalog
                tables = client.list_tables(cat.name, sch.get("name", ""), max_results=50)
                tbl_count = len([t for t in tables if t.get("table_type") != "VIEW"])
                view_count = len([t for t in tables if t.get("table_type") == "VIEW"])
                cat.table_count += tbl_count + view_count
                total_tables += tbl_count
                total_views += view_count

        # ── Step 12: External locations ───────────────────────────────────────
        step(12, "Reading external locations")
        ext_locations = client.list_external_locations() if uc_enabled else []

        # ── Step 13: Storage credentials ─────────────────────────────────────
        step(13, "Reading storage credentials")
        storage_creds = client.list_storage_credentials() if uc_enabled else []

        # ── Step 14: Delta Sharing ────────────────────────────────────────────
        step(14, "Checking Delta Sharing configuration")
        delta_recipients = client.list_delta_sharing_recipients() if uc_enabled else []
        delta_sharing_on = bool(delta_recipients or metastore.get("delta_sharing_enabled"))

        unity_catalog = DatabricksUnityCatalogSummary(
            metastore_name=metastore.get("name"),
            metastore_id=metastore.get("metastore_id"),
            storage_root=metastore.get("storage_root"),
            catalog_count=len(catalogs),
            schema_count=total_schemas,
            table_count=total_tables,
            view_count=total_views,
            external_location_count=len(ext_locations),
            storage_credential_count=len(storage_creds),
            delta_sharing_enabled=delta_sharing_on,
            data_sharing_recipient_count=len(delta_recipients),
        )

        add_check(
            "Unity Catalog", "External locations configured",
            "info",
            "none",
            count=len(ext_locations),
            details=f"{len(ext_locations)} external location(s) registered",
        )
        add_check(
            "Unity Catalog", "Storage credentials registered",
            "warn" if not storage_creds and uc_enabled else "pass",
            "medium" if not storage_creds and uc_enabled else "none",
            count=len(storage_creds),
            details=f"{len(storage_creds)} storage credential(s) found",
            recommendation="Register storage credentials to enable secure access to cloud storage from Unity Catalog",
        )
        add_check(
            "Unity Catalog", "Delta Sharing enabled",
            "info",
            "none",
            details=f"Delta Sharing {'enabled' if delta_sharing_on else 'not enabled'} — {len(delta_recipients)} recipient(s)",
        )

        # ── Step 15: Jobs ─────────────────────────────────────────────────────
        step(15, "Listing jobs")
        raw_jobs = client.list_jobs() if request.include_jobs else []
        job_objects: list[DatabricksJob] = []
        for j in raw_jobs:
            settings = j.get("settings", {})
            tasks = settings.get("tasks", [])
            schedule = settings.get("schedule", {})
            schedule_str = schedule.get("quartz_cron_expression") if schedule else None
            # Check if any task uses existing all-purpose cluster
            uses_ap = any(
                "existing_cluster_id" in (t or {})
                for t in tasks
            )
            job_objects.append(DatabricksJob(
                job_id=j.get("job_id", 0),
                name=settings.get("name"),
                creator_user_name=j.get("creator_user_name"),
                run_as_user_name=(j.get("run_as") or {}).get("user_name"),
                schedule=schedule_str,
                job_cluster_count=len(settings.get("job_clusters", [])),
                task_count=len(tasks),
                uses_all_purpose_compute=uses_ap,
                created_time=str(j.get("created_time", "")) or None,
            ))

        # ── Step 16: Job run analysis ─────────────────────────────────────────
        step(16, "Checking recent job runs")
        recent_runs = client.list_job_runs(active_only=False)
        failed_job_ids: set = set()
        for run in recent_runs:
            if run.get("state", {}).get("result_state") == "FAILED":
                failed_job_ids.add(run.get("job_id"))
        for j in job_objects:
            if j.job_id in failed_job_ids:
                j.last_run_status = "FAILED"

        scheduled_jobs = [j for j in job_objects if j.schedule]
        multi_task = [j for j in job_objects if j.task_count > 1]
        ap_jobs = [j for j in job_objects if j.uses_all_purpose_compute]

        # ── Step 17: DLT Pipelines ────────────────────────────────────────────
        step(17, "Listing Delta Live Tables pipelines")
        pipelines = client.list_pipelines()

        job_summary = DatabricksJobSummary(
            total_jobs=len(job_objects),
            scheduled_jobs=len(scheduled_jobs),
            multi_task_jobs=len(multi_task),
            jobs_with_failures_last_7d=len(failed_job_ids),
            jobs_using_all_purpose_compute=len(ap_jobs),
            dlt_pipelines=len(pipelines),
        )

        add_check(
            "Jobs", "Jobs using all-purpose (interactive) compute",
            "warn" if ap_jobs else "pass",
            "medium" if ap_jobs else "none",
            count=len(ap_jobs),
            details=f"{len(ap_jobs)} job(s) reference existing all-purpose clusters",
            recommendation="Migrate job tasks to dedicated job clusters or serverless compute to reduce DBU cost",
        )
        add_check(
            "Jobs", "Recent job failures",
            "warn" if failed_job_ids else "pass",
            "high" if len(failed_job_ids) > 5 else ("medium" if failed_job_ids else "none"),
            count=len(failed_job_ids),
            details=f"{len(failed_job_ids)} job(s) had at least one failure in recent runs",
            recommendation="Review failed jobs; configure retry policies and alerting on critical pipelines",
        )

        # ── Step 18: Users ────────────────────────────────────────────────────
        step(18, "Listing workspace users (SCIM)")
        raw_users = client.list_users() if request.include_security else []
        user_objects: list[DatabricksUser] = []
        admin_count = 0
        for u in raw_users:
            is_admin = any(
                g.get("display") in ("admins", "workspace-admins")
                for g in (u.get("groups") or [])
            )
            if is_admin:
                admin_count += 1
            user_objects.append(DatabricksUser(
                id=u.get("id"),
                user_name=u.get("userName"),
                display_name=u.get("displayName"),
                active=u.get("active", True),
                is_admin=is_admin,
            ))

        # ── Step 19: Groups ───────────────────────────────────────────────────
        step(19, "Listing groups")
        groups = client.list_groups() if request.include_security else []

        # ── Step 20: Service principals ───────────────────────────────────────
        step(20, "Listing service principals")
        sps = client.list_service_principals() if request.include_security else []

        # ── Step 21: Security posture ─────────────────────────────────────────
        step(21, "Analysing security posture")
        raw_tokens = client.list_tokens() if request.include_security else []
        ip_lists = client.list_ip_access_lists() if request.include_security else []
        token_mgmt = client.get_token_management_config() if request.include_security else {}

        active_users = [u for u in user_objects if u.active]
        inactive_users = [u for u in user_objects if not u.active]

        security_summary = DatabricksSecuritySummary(
            total_users=len(user_objects),
            active_users=len(active_users),
            admin_users=admin_count,
            service_principal_count=len(sps),
            group_count=len(groups),
            workspace_admins=admin_count,
            ip_access_list_count=len(ip_lists),
            secrets_scope_count=0,  # filled in step 23
            pat_count=len(raw_tokens),
            token_lifetime_configured=bool(token_mgmt.get("max_token_lifetime_days")),
            unity_catalog_enabled=uc_enabled,
            audit_log_configured=False,  # filled in step 24
        )

        add_check(
            "Security", "IP access lists enabled",
            "pass" if ip_lists_enabled and ip_lists else ("warn" if ip_lists_enabled else "fail"),
            "high" if not ip_lists_enabled else "none",
            count=len(ip_lists),
            details=f"IP access list feature {'enabled' if ip_lists_enabled else 'disabled'} — {len(ip_lists)} list(s)",
            recommendation="Enable IP access lists and restrict workspace access to known CIDR ranges",
        )
        add_check(
            "Security", "PAT token lifetime enforced",
            "pass" if security_summary.token_lifetime_configured else "warn",
            "medium" if not security_summary.token_lifetime_configured else "none",
            details="Max token lifetime setting found" if security_summary.token_lifetime_configured else "No max PAT lifetime configured",
            recommendation="Set a maximum token lifetime via token management settings to reduce credential exposure",
        )
        add_check(
            "Security", "Admin user concentration",
            "warn" if admin_count > 5 else "pass",
            "medium" if admin_count > 5 else "none",
            count=admin_count,
            details=f"{admin_count} workspace admin(s) out of {len(user_objects)} total users",
            recommendation="Limit workspace admin count; use groups and Unity Catalog privileges for data access",
        )
        add_check(
            "Security", "Inactive users present",
            "warn" if inactive_users else "pass",
            "low" if inactive_users else "none",
            count=len(inactive_users),
            details=f"{len(inactive_users)} inactive user account(s)",
            recommendation="Remove or deactivate stale user accounts to reduce attack surface",
        )
        if raw_tokens:
            add_check(
                "Security", "PAT count",
                "info",
                "none",
                count=len(raw_tokens),
                details=f"{len(raw_tokens)} personal access token(s) currently active",
            )

        # ── Step 22: Secrets scopes ───────────────────────────────────────────
        step(22, "Listing secrets scopes")
        secret_scopes = client.list_secret_scopes() if request.include_security else []
        security_summary.secrets_scope_count = len(secret_scopes)

        add_check(
            "Security", "Secrets management via Databricks secrets",
            "pass" if secret_scopes else "warn",
            "low" if not secret_scopes else "none",
            count=len(secret_scopes),
            details=f"{len(secret_scopes)} secret scope(s) configured",
            recommendation="Store credentials in Databricks Secret Scopes or Azure Key Vault-backed scopes (not notebooks)",
        )

        # ── Step 23: Workspace configuration checks ───────────────────────────
        step(23, "Reviewing workspace configuration")
        token_feature_on = ws_conf.get("enableTokensConfig", "").lower() == "true"
        add_check(
            "Governance", "Token management feature enabled",
            "pass" if token_feature_on else "warn",
            "medium" if not token_feature_on else "none",
            details=f"Token management {'enabled' if token_feature_on else 'disabled'}",
            recommendation="Enable the token management feature to audit and revoke PATs centrally",
        )

        # ── Step 24: Git credentials / Repos ─────────────────────────────────
        step(24, "Checking Git integration")
        git_creds = client.list_git_credentials() if request.include_integrations else []
        repos = client.list_repos() if request.include_integrations else []

        add_check(
            "Integrations", "Git integration configured",
            "pass" if git_creds else "info",
            "none",
            count=len(git_creds),
            details=f"{len(git_creds)} Git credential(s) found — {len(repos)} repo(s) linked",
        )

        # ── Step 25: DBFS mounts (legacy) ─────────────────────────────────────
        step(25, "Checking DBFS /mnt usage (legacy pattern)")
        dbfs_mounts = client.list_dbfs_mounts() if request.include_integrations else []

        add_check(
            "Integrations", "Legacy DBFS /mnt mounts",
            "warn" if dbfs_mounts else "pass",
            "medium" if dbfs_mounts else "none",
            count=len(dbfs_mounts),
            details=f"{len(dbfs_mounts)} DBFS /mnt mount(s) detected",
            recommendation="Migrate from DBFS /mnt to Unity Catalog external locations for centralised governance",
        )

        # ── Step 26: External locations / storage creds ───────────────────────
        step(26, "Validating external location registrations")
        add_check(
            "Integrations", "External locations vs DBFS mounts ratio",
            "pass" if len(ext_locations) >= len(dbfs_mounts) else "warn",
            "low",
            count=len(ext_locations),
            details=f"{len(ext_locations)} external location(s) vs {len(dbfs_mounts)} DBFS mount(s)",
            recommendation="For each DBFS mount, create an equivalent Unity Catalog external location",
        )

        # ── Step 27: MLflow experiments ───────────────────────────────────────
        step(27, "Listing MLflow experiments")
        experiments = client.list_mlflow_experiments() if request.include_mlflow else []

        # ── Step 28: Registered models ────────────────────────────────────────
        step(28, "Listing registered models")
        reg_models = client.list_registered_models() if request.include_mlflow else []

        # ── Step 29: Model Serving endpoints ──────────────────────────────────
        step(29, "Listing Model Serving endpoints")
        serving_eps = client.list_serving_endpoints() if request.include_mlflow else []
        running_eps = [e for e in serving_eps if e.get("state", {}).get("ready") == "READY"]

        # ── Step 30: Vector Search ────────────────────────────────────────────
        step(30, "Checking Vector Search indexes")
        vs_indexes = client.list_vector_search_indexes() if request.include_mlflow else []

        mlflow_summary = DatabricksMLflowSummary(
            experiment_count=len(experiments),
            registered_model_count=len(reg_models),
            model_serving_endpoint_count=len(serving_eps),
            running_endpoints=len(running_eps),
            vector_search_index_count=len(vs_indexes),
            dlt_pipeline_count=len(pipelines),
        )

        add_check(
            "ML & AI", "Model Serving endpoints",
            "info",
            "none",
            count=len(serving_eps),
            details=f"{len(serving_eps)} endpoint(s) — {len(running_eps)} ready/running",
        )
        add_check(
            "ML & AI", "MLflow experiment coverage",
            "info",
            "none",
            count=len(experiments),
            details=f"{len(experiments)} experiment(s), {len(reg_models)} registered model(s)",
        )

        # ── Step 31: Integration summary ──────────────────────────────────────
        step(31, "Building integration summary")
        integration_summary = DatabricksIntegrationSummary(
            external_location_count=len(ext_locations),
            storage_credential_count=len(storage_creds),
            git_credential_count=len(git_creds),
            secret_scope_count=len(secret_scopes),
            dbfs_mount_count=len(dbfs_mounts),
            delta_sharing_enabled=delta_sharing_on,
        )

        # ── Step 32: Cost-signal checks ────────────────────────────────────────
        step(32, "Evaluating cost optimisation signals")
        if request.include_cost_signals:
            idle_wh = [w for w in warehouses if w.state == "RUNNING" and (w.num_active_sessions or 0) == 0]
            add_check(
                "Cost", "Running warehouses with zero active sessions",
                "warn" if idle_wh else "pass",
                "medium" if idle_wh else "none",
                count=len(idle_wh),
                details=f"{len(idle_wh)} SQL warehouse(s) running with no active sessions",
                recommendation="Set auto-stop on warehouses to avoid paying for idle SQL compute",
            )
            add_check(
                "Cost", "Clusters without auto-termination (cost risk)",
                "fail" if no_autoterm else "pass",
                "high" if len(no_autoterm) > 3 else ("medium" if no_autoterm else "none"),
                count=len(no_autoterm),
                details=f"{len(no_autoterm)} all-purpose cluster(s) without auto-termination",
                recommendation="Configure auto-termination (≤ 60 min for development, ≤ 120 min for shared clusters)",
            )

        # ── Step 33: Governance posture check ─────────────────────────────────
        step(33, "Evaluating governance posture")
        add_check(
            "Governance", "Unity Catalog adopted",
            "pass" if uc_enabled else "fail",
            "critical" if not uc_enabled else "none",
            details="Unity Catalog metastore attached" if uc_enabled else "No Unity Catalog — data access uncontrolled",
            recommendation=None if uc_enabled else "Adopt Unity Catalog to enable fine-grained access control, lineage, and audit",
        )
        add_check(
            "Governance", "Service principals for automation",
            "pass" if sps else "warn",
            "medium" if not sps else "none",
            count=len(sps),
            details=f"{len(sps)} service principal(s) — prefer SPs over user PATs for automated workloads",
            recommendation="Use service principals for all CI/CD and scheduled job authentication",
        )

        # ── Step 34: Overall scoring ───────────────────────────────────────────
        step(34, "Calculating overall score")
        total = len(checks)
        passed = sum(1 for c in checks if c.status == "pass")
        warnings_ = sum(1 for c in checks if c.status == "warn")
        critical = sum(1 for c in checks if c.risk == "critical")
        high = sum(1 for c in checks if c.risk == "high" and c.status in ("fail", "warn"))
        info_count = sum(1 for c in checks if c.status == "info")
        scoreable = total - info_count
        if scoreable > 0:
            raw = (passed / scoreable) * 100 - (critical * 12) - (high * 6)
            overall_score = max(0.0, min(100.0, raw))
        else:
            overall_score = 100.0

        # ── Step 35: Build result + persist ───────────────────────────────────
        step(35, "Saving results")
        elapsed = round(time.perf_counter() - t0, 2)

        result = DatabricksAssessmentResult(
            job_id=job_id,
            label=request.label,
            workspace_url=workspace_url,
            workspace_info=workspace_info,
            cluster_summary=cluster_summary,
            warehouse_summary=warehouse_summary,
            unity_catalog=unity_catalog,
            job_summary=job_summary,
            security_summary=security_summary,
            integration_summary=integration_summary,
            mlflow_summary=mlflow_summary,
            clusters=clusters,
            warehouses=warehouses,
            catalogs=catalogs,
            jobs=job_objects[:100],    # cap list lengths for storage
            users=user_objects[:200],
            checks=checks,
            total_checks=total,
            passed_checks=passed,
            warnings=warnings_,
            critical_findings=critical,
            high_findings=high,
            overall_score=round(overall_score, 1),
            assessment_timestamp=_now_iso(),
            duration_seconds=elapsed,
        )

        _update_job(
            job_id,
            status="completed",
            progress_message="Completed",
            completed_at=_now_iso(),
            duration_seconds=elapsed,
            results=result.model_dump(),
            cluster_count=len(clusters),
            warehouse_count=len(warehouses),
            catalog_count=len(catalogs),
            job_count=len(job_objects),
            total_checks=total,
            passed_checks=passed,
            critical_findings=critical,
            high_findings=high,
            overall_score=round(overall_score, 1),
        )

    except Exception as exc:
        logger.error("Databricks assessment %s failed: %s", job_id, exc, exc_info=True)
        _update_job(
            job_id,
            status="failed",
            error=str(exc),
            completed_at=_now_iso(),
            duration_seconds=round(time.perf_counter() - t0, 2),
        )


# ── Excel Report ──────────────────────────────────────────────────────────────

def build_excel(result: DatabricksAssessmentResult) -> bytes:
    """Generate a 9-sheet Excel workbook from assessment results."""
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter

    BRAND   = "FF3621"   # Databricks red/orange
    HDR_BG  = "1E1E2E"   # Dark header
    HDR_FG  = "FFFFFF"
    PASS_BG = "D1FAE5"
    WARN_BG = "FEF3C7"
    FAIL_BG = "FEE2E2"
    INFO_BG = "EFF6FF"
    ROW_ALT = "F8FAFC"

    def _font(bold=False, size=11, color="1E293B"):
        return Font(name="Calibri", bold=bold, size=size, color=color)

    def _fill(hex_c):
        return PatternFill("solid", fgColor=hex_c)

    def _border():
        s = Side(style="thin", color="CBD5E1")
        return Border(left=s, right=s, top=s, bottom=s)

    def _hdr_cell(ws, row, col, value):
        c = ws.cell(row=row, column=col, value=value)
        c.font = Font(name="Calibri", bold=True, size=11, color=HDR_FG)
        c.fill = _fill(HDR_BG)
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        c.border = _border()
        return c

    def _data_cell(ws, row, col, value, alt=False):
        c = ws.cell(row=row, column=col, value=value)
        c.font = _font(size=10)
        c.fill = _fill(ROW_ALT if alt else "FFFFFF")
        c.alignment = Alignment(vertical="center", wrap_text=False)
        c.border = _border()
        return c

    def _auto_width(ws, min_w=10, max_w=50):
        for col_cells in ws.columns:
            length = max((len(str(c.value or "")) for c in col_cells), default=min_w)
            ws.column_dimensions[get_column_letter(col_cells[0].column)].width = min(max(length + 2, min_w), max_w)

    def _title_row(ws, text, span=8):
        ws.row_dimensions[1].height = 36
        c = ws["A1"]
        c.value = text
        c.font = Font(name="Calibri", bold=True, size=16, color=BRAND)
        ws.merge_cells(f"A1:{get_column_letter(span)}1")
        c.alignment = Alignment(horizontal="left", vertical="center")

    wb = Workbook()

    # ── Sheet 1: Summary ──────────────────────────────────────────────────────
    ws = wb.active
    ws.title = "Summary"
    _title_row(ws, "Databricks Workspace Assessment Report", span=4)

    kv_rows = [
        ("Assessed At",         result.assessment_timestamp),
        ("Job ID",              result.job_id),
        ("Workspace URL",       result.workspace_url or ""),
        ("Label",               result.label or ""),
        ("Workspace Name",      (result.workspace_info.workspace_name if result.workspace_info else "") or ""),
        ("Cloud",               (result.workspace_info.cloud if result.workspace_info else "") or ""),
        ("Unity Catalog",       "Enabled" if (result.unity_catalog and result.unity_catalog.metastore_id) else "Not configured"),
        ("Total Checks",        result.total_checks),
        ("Passed Checks",       result.passed_checks),
        ("Warnings",            result.warnings),
        ("Critical Findings",   result.critical_findings),
        ("High Findings",       result.high_findings),
        ("Overall Score",       f"{result.overall_score:.1f}/100" if result.overall_score is not None else "—"),
        ("Duration (s)",        f"{result.duration_seconds:.1f}" if result.duration_seconds else "—"),
        ("Cluster Count",       result.cluster_summary.total_clusters if result.cluster_summary else 0),
        ("Running Clusters",    result.cluster_summary.running_clusters if result.cluster_summary else 0),
        ("SQL Warehouses",      result.warehouse_summary.total_warehouses if result.warehouse_summary else 0),
        ("Catalog Count",       result.unity_catalog.catalog_count if result.unity_catalog else 0),
        ("Total Schemas",       result.unity_catalog.schema_count if result.unity_catalog else 0),
        ("Total Tables",        result.unity_catalog.table_count if result.unity_catalog else 0),
        ("Job Count",           result.job_summary.total_jobs if result.job_summary else 0),
        ("DLT Pipelines",       result.job_summary.dlt_pipelines if result.job_summary else 0),
        ("Total Users",         result.security_summary.total_users if result.security_summary else 0),
        ("Admin Users",         result.security_summary.admin_users if result.security_summary else 0),
        ("Service Principals",  result.security_summary.service_principal_count if result.security_summary else 0),
    ]
    for i, (k, v) in enumerate(kv_rows, start=3):
        ws.cell(row=i, column=1, value=k).font = _font(bold=True)
        ws.cell(row=i, column=2, value=v).font = _font()

    ws.column_dimensions["A"].width = 28
    ws.column_dimensions["B"].width = 45

    # ── Sheet 2: Clusters ─────────────────────────────────────────────────────
    ws2 = wb.create_sheet("Clusters")
    _title_row(ws2, "All-Purpose & Job Clusters", span=9)
    hdrs = ["Cluster ID", "Name", "Source", "State", "Runtime Version", "Node Type", "Workers / Autoscale", "Auto-Term (min)", "Photon"]
    for ci, h in enumerate(hdrs, 1):
        _hdr_cell(ws2, 2, ci, h)
    for ri, c in enumerate(result.clusters, start=3):
        alt = ri % 2 == 0
        workers = f"{c.autoscale_min}-{c.autoscale_max}" if c.autoscale_min else str(c.num_workers or 0)
        _data_cell(ws2, ri, 1, c.cluster_id, alt)
        _data_cell(ws2, ri, 2, c.cluster_name or "", alt)
        _data_cell(ws2, ri, 3, c.cluster_source or "", alt)
        _data_cell(ws2, ri, 4, c.state or "", alt)
        _data_cell(ws2, ri, 5, c.spark_version or "", alt)
        _data_cell(ws2, ri, 6, c.node_type_id or "", alt)
        _data_cell(ws2, ri, 7, workers, alt)
        _data_cell(ws2, ri, 8, c.autotermination_minutes or 0, alt)
        _data_cell(ws2, ri, 9, "Yes" if c.runtime_engine == "PHOTON" else "No", alt)
    _auto_width(ws2)

    # ── Sheet 3: SQL Warehouses ───────────────────────────────────────────────
    ws3 = wb.create_sheet("SQL Warehouses")
    _title_row(ws3, "SQL Warehouses", span=8)
    hdrs3 = ["ID", "Name", "Type", "Cluster Size", "Min/Max Clusters", "Auto-Stop (min)", "State", "Photon"]
    for ci, h in enumerate(hdrs3, 1):
        _hdr_cell(ws3, 2, ci, h)
    for ri, w in enumerate(result.warehouses, start=3):
        alt = ri % 2 == 0
        mc = f"{w.min_num_clusters or 1}/{w.max_num_clusters or 1}"
        _data_cell(ws3, ri, 1, w.id, alt)
        _data_cell(ws3, ri, 2, w.name or "", alt)
        _data_cell(ws3, ri, 3, w.warehouse_type or "", alt)
        _data_cell(ws3, ri, 4, w.cluster_size or "", alt)
        _data_cell(ws3, ri, 5, mc, alt)
        _data_cell(ws3, ri, 6, w.auto_stop_mins or 0, alt)
        _data_cell(ws3, ri, 7, w.state or "", alt)
        _data_cell(ws3, ri, 8, "Yes" if w.enable_photon else "No", alt)
    _auto_width(ws3)

    # ── Sheet 4: Unity Catalog ────────────────────────────────────────────────
    ws4 = wb.create_sheet("Unity Catalog")
    _title_row(ws4, "Unity Catalog — Catalogs", span=7)
    hdrs4 = ["Catalog Name", "Type", "Owner", "Metastore ID", "Schema Count", "Table Count", "Storage Location"]
    for ci, h in enumerate(hdrs4, 1):
        _hdr_cell(ws4, 2, ci, h)
    for ri, cat in enumerate(result.catalogs, start=3):
        alt = ri % 2 == 0
        _data_cell(ws4, ri, 1, cat.name, alt)
        _data_cell(ws4, ri, 2, cat.catalog_type or "", alt)
        _data_cell(ws4, ri, 3, cat.owner or "", alt)
        _data_cell(ws4, ri, 4, cat.metastore_id or "", alt)
        _data_cell(ws4, ri, 5, cat.schema_count, alt)
        _data_cell(ws4, ri, 6, cat.table_count, alt)
        _data_cell(ws4, ri, 7, cat.storage_location or "", alt)
    _auto_width(ws4)

    # ── Sheet 5: Jobs ─────────────────────────────────────────────────────────
    ws5 = wb.create_sheet("Jobs")
    _title_row(ws5, "Job Scheduler", span=7)
    hdrs5 = ["Job ID", "Name", "Creator", "Schedule (cron)", "Tasks", "Job Clusters", "Uses All-Purpose Compute"]
    for ci, h in enumerate(hdrs5, 1):
        _hdr_cell(ws5, 2, ci, h)
    for ri, j in enumerate(result.jobs, start=3):
        alt = ri % 2 == 0
        _data_cell(ws5, ri, 1, j.job_id, alt)
        _data_cell(ws5, ri, 2, j.name or "", alt)
        _data_cell(ws5, ri, 3, j.creator_user_name or "", alt)
        _data_cell(ws5, ri, 4, j.schedule or "Triggered/Continuous", alt)
        _data_cell(ws5, ri, 5, j.task_count, alt)
        _data_cell(ws5, ri, 6, j.job_cluster_count, alt)
        _data_cell(ws5, ri, 7, "Yes" if j.uses_all_purpose_compute else "No", alt)
    _auto_width(ws5)

    # ── Sheet 6: Users & Security ─────────────────────────────────────────────
    ws6 = wb.create_sheet("Users & Security")
    _title_row(ws6, "Users & Security", span=5)
    hdrs6 = ["User Name", "Display Name", "Active", "Admin", "User ID"]
    for ci, h in enumerate(hdrs6, 1):
        _hdr_cell(ws6, 2, ci, h)
    for ri, u in enumerate(result.users, start=3):
        alt = ri % 2 == 0
        _data_cell(ws6, ri, 1, u.user_name or "", alt)
        _data_cell(ws6, ri, 2, u.display_name or "", alt)
        _data_cell(ws6, ri, 3, "Yes" if u.active else "No", alt)
        _data_cell(ws6, ri, 4, "Yes" if u.is_admin else "No", alt)
        _data_cell(ws6, ri, 5, u.id or "", alt)
    _auto_width(ws6)

    # ── Sheet 7: Integrations ─────────────────────────────────────────────────
    ws7 = wb.create_sheet("Integrations")
    _title_row(ws7, "Integrations & External Connectivity", span=2)
    intg = result.integration_summary
    rows7 = [
        ("External Locations", intg.external_location_count if intg else 0),
        ("Storage Credentials", intg.storage_credential_count if intg else 0),
        ("Git Credentials", intg.git_credential_count if intg else 0),
        ("Secret Scopes", intg.secret_scope_count if intg else 0),
        ("DBFS /mnt Mounts (legacy)", intg.dbfs_mount_count if intg else 0),
        ("Delta Sharing Enabled", "Yes" if (intg and intg.delta_sharing_enabled) else "No"),
    ]
    for ri, (k, v) in enumerate(rows7, start=3):
        ws7.cell(row=ri, column=1, value=k).font = _font(bold=True)
        ws7.cell(row=ri, column=2, value=v).font = _font()
    ws7.column_dimensions["A"].width = 32
    ws7.column_dimensions["B"].width = 20

    # ── Sheet 8: MLflow & Serving ─────────────────────────────────────────────
    ws8 = wb.create_sheet("MLflow & Serving")
    _title_row(ws8, "MLflow, Model Serving & AI", span=2)
    ml = result.mlflow_summary
    rows8 = [
        ("MLflow Experiments", ml.experiment_count if ml else 0),
        ("Registered Models", ml.registered_model_count if ml else 0),
        ("Model Serving Endpoints (total)", ml.model_serving_endpoint_count if ml else 0),
        ("Running Endpoints", ml.running_endpoints if ml else 0),
        ("Vector Search Indexes", ml.vector_search_index_count if ml else 0),
        ("Delta Live Tables Pipelines", ml.dlt_pipeline_count if ml else 0),
    ]
    for ri, (k, v) in enumerate(rows8, start=3):
        ws8.cell(row=ri, column=1, value=k).font = _font(bold=True)
        ws8.cell(row=ri, column=2, value=v).font = _font()
    ws8.column_dimensions["A"].width = 36
    ws8.column_dimensions["B"].width = 20

    # ── Sheet 9: Checks ───────────────────────────────────────────────────────
    ws9 = wb.create_sheet("Checks")
    _title_row(ws9, "All Assessment Checks", span=7)
    hdrs9 = ["Domain", "Check", "Status", "Risk", "Count", "Details", "Recommendation"]
    for ci, h in enumerate(hdrs9, 1):
        _hdr_cell(ws9, 2, ci, h)

    status_colors = {"pass": PASS_BG, "warn": WARN_BG, "fail": FAIL_BG, "info": INFO_BG, "n/a": "F1F5F9"}
    for ri, ch in enumerate(result.checks, start=3):
        alt = ri % 2 == 0
        _data_cell(ws9, ri, 1, ch.domain, alt)
        _data_cell(ws9, ri, 2, ch.check, alt)
        sc = ws9.cell(row=ri, column=3, value=ch.status.upper())
        sc.fill = _fill(status_colors.get(ch.status, "FFFFFF"))
        sc.font = _font(bold=True, size=10)
        sc.border = _border()
        _data_cell(ws9, ri, 4, ch.risk.upper(), alt)
        _data_cell(ws9, ri, 5, ch.count if ch.count is not None else "", alt)
        _data_cell(ws9, ri, 6, ch.details or "", alt)
        _data_cell(ws9, ri, 7, ch.recommendation or "", alt)
    _auto_width(ws9)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.getvalue()
