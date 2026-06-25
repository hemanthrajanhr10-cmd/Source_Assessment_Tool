"""
Azure SQL persistence layer — relational edition.
Each assessment section is stored in its own typed table.
All callers keep the same function signatures as before.
"""

from datetime import datetime
from pathlib import Path
from typing import Any, Optional

import time

import mssql_python

from app.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


# ── Connection factory ────────────────────────────────────────────────────────

def _get_conn(retries: int = 3, delay: float = 1.5):
    """
    Open a connection to the Azure SQL store.
    Retries up to `retries` times with a short back-off on transient failures.
    Azure SQL free / serverless tier occasionally drops connections briefly;
    a simple retry avoids spurious 500 errors for the caller.
    """
    conn_str = (
        f"SERVER=tcp:{settings.azure_store_server},{settings.azure_store_port};"
        f"DATABASE={settings.azure_store_database};"
        f"UID={settings.azure_store_username};"
        f"PWD={settings.azure_store_password.get_secret_value()};"
        "TrustServerCertificate=no;"
        "Encrypt=yes;"
    )
    last_exc: Exception | None = None
    for attempt in range(retries):
        try:
            return mssql_python.connect(conn_str)
        except Exception as exc:
            last_exc = exc
            if attempt < retries - 1:
                logger.warning(
                    "Azure SQL connection attempt %d/%d failed (%s) — retrying in %.1fs",
                    attempt + 1, retries, exc, delay,
                )
                time.sleep(delay)
    raise RuntimeError(f"Azure SQL connection failed after {retries} attempts: {last_exc}") from last_exc


# ── Schema init ───────────────────────────────────────────────────────────────

_FABRIC_SESSIONS_DDL = """
IF OBJECT_ID('dbo.fabric_sessions', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.fabric_sessions (
        session_id       VARCHAR(36)     NOT NULL,
        user_id          VARCHAR(36)     NULL,
        label            NVARCHAR(200)   NULL,
        status           VARCHAR(20)     NOT NULL DEFAULT 'running',
        created_at       DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME(),
        completed_at     DATETIME2       NULL,
        error            NVARCHAR(MAX)   NULL,
        progress_message NVARCHAR(500)   NULL,
        results_json     NVARCHAR(MAX)   NULL,
        CONSTRAINT PK_fabric_sessions PRIMARY KEY (session_id)
    );
    CREATE INDEX IX_fabric_sessions_user ON dbo.fabric_sessions (user_id, created_at DESC);
END;
"""

_SALESFORCE_SESSIONS_DDL = """
IF OBJECT_ID('dbo.salesforce_sessions', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.salesforce_sessions (
        job_id           VARCHAR(36)     NOT NULL,
        label            NVARCHAR(200)   NULL,
        instance_url     NVARCHAR(500)   NOT NULL,
        org_name         NVARCHAR(200)   NULL,
        org_id           VARCHAR(50)     NULL,
        org_type         NVARCHAR(50)    NULL,
        status           VARCHAR(20)     NOT NULL DEFAULT 'pending',
        progress_message NVARCHAR(500)   NULL,
        checks_completed INT             NOT NULL DEFAULT 0,
        total_checks     INT             NOT NULL DEFAULT 0,
        overall_score    FLOAT           NULL,
        critical_findings INT            NULL,
        high_findings    INT             NULL,
        total_checks_run INT             NULL,
        duration_seconds FLOAT           NULL,
        error            NVARCHAR(MAX)   NULL,
        results_json     NVARCHAR(MAX)   NULL,
        created_at       DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME(),
        completed_at     DATETIME2       NULL,
        CONSTRAINT PK_salesforce_sessions PRIMARY KEY (job_id)
    );
    CREATE INDEX IX_sf_sessions_created ON dbo.salesforce_sessions (created_at DESC);
END;
"""

_DATAVERSE_SESSIONS_DDL = """
IF OBJECT_ID('dbo.dataverse_sessions', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.dataverse_sessions (
        job_id            VARCHAR(36)    NOT NULL,
        label             NVARCHAR(200)  NULL,
        environment_url   NVARCHAR(500)  NOT NULL,
        org_name          NVARCHAR(200)  NULL,
        org_version       NVARCHAR(50)   NULL,
        status            VARCHAR(20)    NOT NULL DEFAULT 'pending',
        progress_message  NVARCHAR(500)  NULL,
        checks_completed  INT            NOT NULL DEFAULT 0,
        total_checks      INT            NOT NULL DEFAULT 0,
        overall_score     FLOAT          NULL,
        critical_findings INT            NULL,
        high_findings     INT            NULL,
        duration_seconds  FLOAT          NULL,
        error             NVARCHAR(MAX)  NULL,
        results_json      NVARCHAR(MAX)  NULL,
        created_at        DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
        completed_at      DATETIME2      NULL,
        CONSTRAINT PK_dataverse_sessions PRIMARY KEY (job_id)
    );
    CREATE INDEX IX_dv_sessions_created ON dbo.dataverse_sessions (created_at DESC);
END;
"""

_SAP_SESSIONS_DDL = """
IF OBJECT_ID('dbo.sap_sessions', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.sap_sessions (
        job_id           VARCHAR(36)    NOT NULL,
        label            NVARCHAR(200)  NULL,
        variant          NVARCHAR(50)   NOT NULL,
        host             NVARCHAR(500)  NULL,
        status           VARCHAR(20)    NOT NULL DEFAULT 'pending',
        progress_message NVARCHAR(500)  NULL,
        duration_seconds FLOAT          NULL,
        error            NVARCHAR(MAX)  NULL,
        results_json     NVARCHAR(MAX)  NULL,
        created_at       DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
        completed_at     DATETIME2      NULL,
        CONSTRAINT PK_sap_sessions PRIMARY KEY (job_id)
    );
    CREATE INDEX IX_sap_sessions_created ON dbo.sap_sessions (created_at DESC);
END;
"""

_SAGE_SESSIONS_DDL = """
IF OBJECT_ID('dbo.sage_intacct_sessions', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.sage_intacct_sessions (
        job_id           VARCHAR(36)    NOT NULL,
        label            NVARCHAR(200)  NULL,
        company_id       NVARCHAR(200)  NULL,
        company_name     NVARCHAR(200)  NULL,
        status           VARCHAR(20)    NOT NULL DEFAULT 'pending',
        progress_message NVARCHAR(500)  NULL,
        duration_seconds FLOAT          NULL,
        error            NVARCHAR(MAX)  NULL,
        results_json     NVARCHAR(MAX)  NULL,
        created_at       DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
        completed_at     DATETIME2      NULL,
        CONSTRAINT PK_sage_sessions PRIMARY KEY (job_id)
    );
    CREATE INDEX IX_sage_sessions_created ON dbo.sage_intacct_sessions (created_at DESC);
END;
"""

_SNOWFLAKE_SESSIONS_DDL = """
IF OBJECT_ID('dbo.snowflake_sessions', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.snowflake_sessions (
        job_id           VARCHAR(36)    NOT NULL,
        label            NVARCHAR(200)  NULL,
        account          NVARCHAR(200)  NULL,
        warehouse        NVARCHAR(200)  NULL,
        status           VARCHAR(20)    NOT NULL DEFAULT 'pending',
        progress_message NVARCHAR(500)  NULL,
        duration_seconds FLOAT          NULL,
        error            NVARCHAR(MAX)  NULL,
        results_json     NVARCHAR(MAX)  NULL,
        created_at       DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
        completed_at     DATETIME2      NULL,
        CONSTRAINT PK_snowflake_sessions PRIMARY KEY (job_id)
    );
    CREATE INDEX IX_sf2_sessions_created ON dbo.snowflake_sessions (created_at DESC);
END;
"""

_DB2_SESSIONS_DDL = """
IF OBJECT_ID('dbo.db2_sessions', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.db2_sessions (
        job_id           VARCHAR(36)    NOT NULL,
        label            NVARCHAR(200)  NULL,
        hostname         NVARCHAR(500)  NULL,
        database_name    NVARCHAR(128)  NULL,
        port             INT            NULL,
        db2_version      NVARCHAR(200)  NULL,
        instance_name    NVARCHAR(128)  NULL,
        schema_count     INT            NULL,
        table_count      INT            NULL,
        view_count       INT            NULL,
        procedure_count  INT            NULL,
        tablespace_count INT            NULL,
        blu_enabled      BIT            NULL,
        is_dpf           BIT            NULL,
        status           VARCHAR(20)    NOT NULL DEFAULT 'pending',
        progress_message NVARCHAR(500)  NULL,
        error            NVARCHAR(MAX)  NULL,
        results_json     NVARCHAR(MAX)  NULL,
        created_at       DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
        completed_at     DATETIME2      NULL,
        CONSTRAINT PK_db2_sessions PRIMARY KEY (job_id)
    );
    CREATE INDEX IX_db2_sessions_created ON dbo.db2_sessions (created_at DESC);
END;
"""

_INFOR_SESSIONS_DDL = """
IF OBJECT_ID('dbo.infor_sessions', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.infor_sessions (
        job_id           VARCHAR(36)    NOT NULL,
        label            NVARCHAR(200)  NULL,
        engine           NVARCHAR(20)   NULL,
        tenant_id        NVARCHAR(200)  NULL,
        total_checks     INT            NULL,
        passed_checks    INT            NULL,
        critical_findings INT           NULL,
        high_findings    INT            NULL,
        overall_score    FLOAT          NULL,
        status           VARCHAR(20)    NOT NULL DEFAULT 'pending',
        progress_message NVARCHAR(500)  NULL,
        duration_seconds FLOAT          NULL,
        error            NVARCHAR(MAX)  NULL,
        results_json     NVARCHAR(MAX)  NULL,
        created_at       DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
        completed_at     DATETIME2      NULL,
        CONSTRAINT PK_infor_sessions PRIMARY KEY (job_id)
    );
    CREATE INDEX IX_infor_sessions_created ON dbo.infor_sessions (created_at DESC);
END;
"""

_TABLEAU_SESSIONS_DDL = """
IF OBJECT_ID('dbo.tableau_sessions', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.tableau_sessions (
        job_id           VARCHAR(36)    NOT NULL,
        label            NVARCHAR(200)  NULL,
        server_url       NVARCHAR(500)  NULL,
        site_name        NVARCHAR(200)  NULL,
        status           VARCHAR(20)    NOT NULL DEFAULT 'pending',
        progress_message NVARCHAR(500)  NULL,
        duration_seconds FLOAT          NULL,
        error            NVARCHAR(MAX)  NULL,
        results_json     NVARCHAR(MAX)  NULL,
        created_at       DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
        completed_at     DATETIME2      NULL,
        CONSTRAINT PK_tableau_sessions PRIMARY KEY (job_id)
    );
    CREATE INDEX IX_tab_sessions_created ON dbo.tableau_sessions (created_at DESC);
END;
"""

_DATABRICKS_SESSIONS_DDL = """
IF OBJECT_ID('dbo.databricks_sessions', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.databricks_sessions (
        job_id           VARCHAR(36)    NOT NULL,
        label            NVARCHAR(200)  NULL,
        workspace_url    NVARCHAR(500)  NULL,
        workspace_name   NVARCHAR(200)  NULL,
        cloud            NVARCHAR(20)   NULL,
        cluster_count    INT            NULL,
        warehouse_count  INT            NULL,
        catalog_count    INT            NULL,
        job_count        INT            NULL,
        total_checks     INT            NULL,
        passed_checks    INT            NULL,
        critical_findings INT           NULL,
        high_findings    INT            NULL,
        overall_score    FLOAT          NULL,
        status           VARCHAR(20)    NOT NULL DEFAULT 'pending',
        progress_message NVARCHAR(500)  NULL,
        duration_seconds FLOAT          NULL,
        error            NVARCHAR(MAX)  NULL,
        results_json     NVARCHAR(MAX)  NULL,
        created_at       DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
        completed_at     DATETIME2      NULL,
        CONSTRAINT PK_databricks_sessions PRIMARY KEY (job_id)
    );
    CREATE INDEX IX_databricks_sessions_created ON dbo.databricks_sessions (created_at DESC);
END;
"""


def init_schema() -> None:
    """Create all tables if they do not exist. Safe to call on every startup."""
    ddl = (Path(__file__).parent / "schema.sql").read_text(encoding="utf-8")
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(ddl)
        conn.commit()
        logger.info("Azure SQL schema initialised (tables created if missing)")
        # Run module-specific tables separately — large batches can silently skip
        # later statements on some ODBC drivers.
        for ddl_str, tbl in [
            (_FABRIC_SESSIONS_DDL,     "fabric_sessions"),
            (_SALESFORCE_SESSIONS_DDL, "salesforce_sessions"),
            (_DATAVERSE_SESSIONS_DDL,  "dataverse_sessions"),
            (_SAP_SESSIONS_DDL,        "sap_sessions"),
            (_SAGE_SESSIONS_DDL,       "sage_intacct_sessions"),
            (_SNOWFLAKE_SESSIONS_DDL,  "snowflake_sessions"),
            (_TABLEAU_SESSIONS_DDL,      "tableau_sessions"),
            (_DB2_SESSIONS_DDL,          "db2_sessions"),
            (_INFOR_SESSIONS_DDL,        "infor_sessions"),
            (_DATABRICKS_SESSIONS_DDL,   "databricks_sessions"),
        ]:
            cur.execute(ddl_str)
            conn.commit()
            logger.info("%s table verified", tbl)
    except Exception as exc:
        logger.error("Schema init failed: %s", exc)
        raise
    finally:
        conn.close()


# ── Salesforce persistence helpers ────────────────────────────────────────────

def sf_upsert_session(job: dict) -> None:
    """Insert or update a Salesforce assessment session row."""
    result = job.get("result")

    def _g(key, default=None):
        if result is None:
            return default
        return result.get(key, default) if isinstance(result, dict) else getattr(result, key, default)

    _upsert(
        table="salesforce_sessions", pk_col="job_id", pk_val=job["job_id"],
        scalars={
            "label":             job.get("label"),
            "instance_url":      job.get("instance_url") or "",
            "org_name":          _g("org_name"),
            "org_id":            _g("org_id"),
            "org_type":          _g("org_type"),
            "status":            job.get("status", "pending"),
            "progress_message":  job.get("progress_message"),
            "checks_completed":  job.get("checks_completed", 0),
            "total_checks":      job.get("total_checks", 0),
            "overall_score":     _g("overall_score"),
            "critical_findings": _g("critical_findings"),
            "high_findings":     _g("high_findings"),
            "total_checks_run":  _g("total_checks"),
            "duration_seconds":  job.get("duration_seconds"),
            "error":             job.get("error"),
            "created_at":        job.get("created_at"),
            "completed_at":      job.get("completed_at"),
        },
        results_obj=result,
    )


def sf_list_sessions() -> list[dict]:
    """Return all Salesforce sessions ordered by created_at DESC."""
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT job_id, label, instance_url, org_name, org_id, org_type,
                   status, overall_score, critical_findings, high_findings,
                   total_checks_run, duration_seconds, created_at, completed_at, error
            FROM dbo.salesforce_sessions
            ORDER BY created_at DESC
            """
        )
        cols = [c[0] for c in cur.description]
        rows = cur.fetchall()
        return [dict(zip(cols, row)) for row in rows]
    except Exception as exc:
        logger.warning("sf_list_sessions failed: %s", exc)
        return []
    finally:
        conn.close()


def sf_get_session(job_id: str) -> Optional[dict]:
    """Fetch a single Salesforce session row including results_json."""
    import json as _json
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT job_id, label, instance_url, org_name, org_id, org_type,
                   status, progress_message, checks_completed, total_checks,
                   overall_score, critical_findings, high_findings, total_checks_run,
                   duration_seconds, error, results_json, created_at, completed_at
            FROM dbo.salesforce_sessions
            WHERE job_id = ?
            """,
            job_id,
        )
        row = cur.fetchone()
        if not row:
            return None
        cols = [c[0] for c in cur.description]
        data = dict(zip(cols, row))
        if data.get("results_json"):
            try:
                data["result"] = _json.loads(data["results_json"])
            except Exception:
                data["result"] = None
        return data
    except Exception as exc:
        logger.warning("sf_get_session failed: %s", exc)
        return None
    finally:
        conn.close()


# ── Section config ─────────────────────────────────────────────────────────────
# Maps section key → (db table name, ordered column list)
# Column order must match what the assessment queries return (via _cursor_rows_to_dicts).

_SECTION_CONFIG: dict[str, tuple[str, list[str]]] = {
    # Core metadata
    "schemas": (
        "assessment_schemas",
        ["schema_name", "table_count", "view_count", "proc_count"],
    ),
    "tables": (
        "assessment_tables",
        ["schema_name", "table_name", "column_count", "row_count",
         "size_mb", "create_date", "modify_date"],
    ),
    "columns": (
        "assessment_columns",
        ["schema_name", "table_name", "column_id", "column_name", "data_type",
         "max_length", "precision", "scale", "is_nullable", "is_identity",
         "is_primary_key", "is_foreign_key", "default_value"],
    ),
    "views": (
        "assessment_views",
        ["schema_name", "view_name", "create_date", "modify_date", "definition"],
    ),
    "stored_procedures": (
        "assessment_stored_procedures",
        ["schema_name", "procedure_name", "create_date", "modify_date", "param_count"],
    ),
    "functions": (
        "assessment_functions",
        ["schema_name", "function_name", "function_type", "create_date", "modify_date"],
    ),
    "indexes": (
        "assessment_indexes",
        ["schema_name", "table_name", "index_name", "index_type", "is_unique",
         "is_primary_key", "is_unique_constraint", "indexed_columns", "fill_factor"],
    ),
    "relationships": (
        "assessment_relationships",
        ["fk_name", "parent_schema", "parent_table", "parent_column",
         "ref_schema", "ref_table", "ref_column", "on_delete", "on_update"],
    ),
    "index_coverage": (
        "assessment_index_coverage",
        ["schema_name", "table_name", "index_count", "coverage"],
    ),
    "insertion_frequency": (
        "assessment_insertion_frequency",
        ["schema_name", "table_name", "current_rows", "create_date",
         "modify_date", "age_days", "avg_rows_per_day"],
    ),
    "null_analysis": (
        "assessment_null_analysis",
        ["schema_name", "table_name", "column_name", "total_rows", "null_blank_pct"],
    ),
    # Security
    "db_users_roles": (
        "assessment_db_users_roles",
        ["principal_name", "principal_type", "create_date",
         "default_schema", "server_login", "roles"],
    ),
    "orphaned_users": (
        "assessment_orphaned_users",
        ["user_name", "user_type", "create_date", "default_schema"],
    ),
    "db_owner_members": (
        "assessment_db_owner_members",
        ["member_name", "member_type", "server_login", "create_date"],
    ),
    "dynamic_sql_usage": (
        "assessment_dynamic_sql_usage",
        ["object_type", "schema_name", "object_name", "dynamic_sql_type"],
    ),
    "clr_assemblies": (
        "assessment_clr_assemblies",
        ["assembly_name", "permission_set", "create_date", "modify_date",
         "is_visible", "clr_object_count"],
    ),
    "tde_status": (
        "assessment_tde_status",
        ["database_name", "tde_status", "encryption_state",
         "percent_complete", "key_algorithm", "key_length"],
    ),
    "column_encryption": (
        "assessment_column_encryption",
        ["schema_name", "table_name", "column_name", "data_type",
         "encryption_key_name", "encryption_type"],
    ),
    "pii_indicators": (
        "assessment_pii_indicators",
        ["schema_name", "table_name", "column_name", "data_type", "pii_category"],
    ),
    # Features
    "sql_agent_jobs": (
        "assessment_sql_agent_jobs",
        ["job_name", "status", "description", "date_created",
         "date_modified", "failure_count", "last_run_status"],
    ),
    "linked_servers": (
        "assessment_linked_servers",
        ["linked_server_name", "product", "provider", "data_source",
         "remote_login_enabled", "data_access_enabled", "rpc_out_enabled", "modify_date"],
    ),
    "cross_db_references": (
        "assessment_cross_db_references",
        ["object_type", "schema_name", "object_name",
         "referenced_database", "referenced_schema", "referenced_entity"],
    ),
    "replication_status": (
        "assessment_replication_status",
        ["database_name", "has_replicated_tables", "replicated_table_count",
         "is_publisher", "is_subscriber", "is_merge_published"],
    ),
    "service_broker": (
        "assessment_service_broker",
        ["database_name", "broker_status", "user_queue_count",
         "user_service_count", "active_conversations"],
    ),
    "version_features": (
        "assessment_version_features",
        ["server_name", "product_version", "product_level", "product_update_level",
         "edition", "engine_edition", "is_clustered", "hadr_enabled",
         "fulltext_installed", "clr_enabled", "xp_cmdshell_enabled",
         "ole_automation_enabled", "adhoc_distributed_queries"],
    ),
    # Schema / Design checks
    "trustworthy_databases": (
        "assessment_trustworthy_databases",
        ["database_name", "trustworthy_status", "cross_db_chaining", "state_desc", "recovery_model_desc"],
    ),
    "deprecated_data_types": (
        "assessment_deprecated_data_types",
        ["schema_name", "table_name", "column_name", "data_type", "recommendation"],
    ),
    "missing_primary_keys": (
        "assessment_missing_primary_keys",
        ["schema_name", "table_name", "row_count", "finding"],
    ),
    "heap_tables": (
        "assessment_heap_tables",
        ["schema_name", "table_name", "row_count", "size_mb", "finding"],
    ),
    "untrusted_constraints": (
        "assessment_untrusted_constraints",
        ["constraint_type", "schema_name", "table_name", "constraint_name",
         "trust_status", "enabled_status", "finding"],
    ),
    "sp_naming_violations": (
        "assessment_sp_naming_violations",
        ["schema_name", "procedure_name", "finding"],
    ),
    "duplicate_indexes": (
        "assessment_duplicate_indexes",
        ["schema_name", "table_name", "index1_name", "index2_name",
         "index_type", "shared_key_columns", "finding"],
    ),
    "database_options_audit": (
        "assessment_database_options_audit",
        ["database_name", "recovery_model_desc", "page_verify_option_desc",
         "compatibility_level", "collation_name", "state_desc",
         "auto_close", "auto_shrink", "page_verify_status",
         "auto_update_stats", "auto_create_stats", "access_mode"],
    ),
    "object_permissions": (
        "assessment_object_permissions",
        ["permission_state", "permission_name", "object_class",
         "object_name", "schema_name", "grantee", "grantee_type"],
    ),
    # Performance checks
    "missing_indexes": (
        "assessment_missing_indexes",
        ["schema_name", "table_name", "equality_columns", "inequality_columns",
         "included_columns", "improvement_score", "user_seeks", "user_scans",
         "avg_impact_pct", "last_user_seek"],
    ),
    "index_usage_stats": (
        "assessment_index_usage_stats",
        ["schema_name", "table_name", "index_name", "type_desc",
         "user_seeks", "user_scans", "user_lookups", "user_updates",
         "last_user_seek", "last_user_update", "index_status"],
    ),
    "fragmentation_report": (
        "assessment_fragmentation_report",
        ["schema_name", "table_name", "index_name", "type_desc",
         "fragmentation_pct", "page_count", "recommendation"],
    ),
    "statistics_health": (
        "assessment_statistics_health",
        ["schema_name", "table_name", "stat_name", "last_updated",
         "rows", "rows_sampled", "sample_pct", "modification_counter", "status"],
    ),
    # Reliability / Config checks
    "backup_history": (
        "assessment_backup_history",
        ["database_name", "last_full_backup", "last_diff_backup", "last_log_backup",
         "hours_since_full_backup", "hours_since_log_backup",
         "recovery_model_desc", "backup_status"],
    ),
    "server_configurations": (
        "assessment_server_configurations",
        ["config_name", "configured_value", "running_value",
         "min_value", "max_value", "description", "recommendation"],
    ),
    "weak_sql_logins": (
        "assessment_weak_sql_logins",
        ["login_name", "type_desc", "login_status", "password_policy",
         "expiration_policy", "password_last_set", "bad_password_count",
         "days_until_expiration", "assessment"],
    ),
    "server_permissions": (
        "assessment_server_permissions",
        ["server_role", "member_name", "type_desc", "login_status", "member_since"],
    ),
    "deprecated_features_in_use": (
        "assessment_deprecated_features_in_use",
        ["deprecated_feature", "usage_count_since_restart"],
    ),
    # ── PostgreSQL-specific extended sections ─────────────────────────────────
    "pg_extensions": (
        "assessment_pg_extensions",
        ["extension_name", "version", "schema_name", "description", "relocatable", "category"],
    ),
    "pg_triggers": (
        "assessment_pg_triggers",
        ["schema_name", "trigger_name", "table_name", "trigger_event",
         "trigger_timing", "per_row_or_statement", "trigger_body", "finding"],
    ),
    "pg_sequences": (
        "assessment_pg_sequences",
        ["schema_name", "sequence_name", "data_type", "start_value",
         "minimum_value", "maximum_value", "increment", "cycle_option", "recommendation"],
    ),
    "pg_partitions": (
        "assessment_pg_partitions",
        ["schema_name", "parent_table", "child_schema", "child_table",
         "child_type", "partition_bound", "approx_row_count", "finding"],
    ),
    "pg_matviews": (
        "assessment_pg_matviews",
        ["schema_name", "view_name", "create_date", "modify_date",
         "has_indexes", "is_populated", "approx_row_count", "definition", "finding"],
    ),
    "pg_table_bloat": (
        "assessment_pg_table_bloat",
        ["schema_name", "table_name", "live_rows", "dead_rows", "dead_row_pct",
         "last_vacuum", "last_autovacuum", "last_analyze",
         "vacuum_count", "autovacuum_count", "recommendation"],
    ),
    "pg_connection_stats": (
        "assessment_pg_connection_stats",
        ["database_name", "total_connections", "active", "idle",
         "idle_in_transaction", "idle_in_transaction_aborted",
         "blocked_by_lock", "max_duration_secs", "max_connections", "finding"],
    ),
}


# ── Fabric session CRUD ───────────────────────────────────────────────────────

def create_fabric_session(session_id: str, label: Optional[str], user_id: Optional[str]) -> None:
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO dbo.fabric_sessions (session_id, label, user_id, status) "
            "VALUES (?, ?, ?, 'running')",
            (session_id, label, user_id),
        )
        conn.commit()
    finally:
        conn.close()


def update_fabric_session(session_id: str, **kwargs) -> None:
    allowed = {"status", "completed_at", "error", "progress_message", "results_json"}
    fields = {k: v for k, v in kwargs.items() if k in allowed}
    if not fields:
        return
    set_clause = ", ".join(f"{col} = ?" for col in fields)
    values = list(fields.values()) + [session_id]
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(f"UPDATE dbo.fabric_sessions SET {set_clause} WHERE session_id = ?", values)
        conn.commit()
    finally:
        conn.close()


def get_fabric_session(session_id: str) -> Optional[dict[str, Any]]:
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT session_id, label, user_id, status, created_at, completed_at, "
            "error, progress_message, results_json "
            "FROM dbo.fabric_sessions WHERE session_id = ?",
            (session_id,),
        )
        row = cur.fetchone()
        if row is None:
            return None
        return dict(zip([d[0] for d in cur.description], row))
    finally:
        conn.close()


def list_fabric_sessions(user_id: Optional[str] = None) -> list[dict[str, Any]]:
    conn = _get_conn()
    try:
        cur = conn.cursor()
        if user_id:
            cur.execute(
                "SELECT session_id AS fabric_session_id, label, status, created_at, completed_at, error, progress_message "
                "FROM dbo.fabric_sessions WHERE user_id = ? ORDER BY created_at DESC",
                (user_id,),
            )
        else:
            cur.execute(
                "SELECT session_id AS fabric_session_id, label, status, created_at, completed_at, error, progress_message "
                "FROM dbo.fabric_sessions ORDER BY created_at DESC"
            )
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]
    finally:
        conn.close()


# ── Job CRUD ──────────────────────────────────────────────────────────────────

def create_job(
    job_id: str,
    label: Optional[str],
    created_at: datetime,
    session_id: Optional[str] = None,
    server_name: Optional[str] = None,
    database_name: Optional[str] = None,
    user_id: Optional[str] = None,
) -> None:
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO dbo.jobs
               (job_id, status, label, created_at, session_id, server_name, database_name, user_id)
               VALUES (?, 'pending', ?, ?, ?, ?, ?, ?)""",
            (job_id, label, created_at, session_id, server_name, database_name, user_id),
        )
        conn.commit()
    finally:
        conn.close()


def update_job(job_id: str, **kwargs) -> None:
    allowed = {
        "status", "started_at", "completed_at", "error",
        "progress_message", "report_path", "gateway_key", "gateway_payload",
    }
    fields = {k: v for k, v in kwargs.items() if k in allowed}
    if not fields:
        return
    set_clause = ", ".join(f"{col} = ?" for col in fields)
    values = list(fields.values()) + [job_id]
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(f"UPDATE dbo.jobs SET {set_clause} WHERE job_id = ?", values)
        conn.commit()
    finally:
        conn.close()


def get_job(job_id: str) -> Optional[dict[str, Any]]:
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            """SELECT job_id, status, label, created_at, started_at, completed_at,
                      error, progress_message, report_path, session_id, server_name, database_name, user_id
               FROM dbo.jobs WHERE job_id = ?""",
            (job_id,),
        )
        row = cur.fetchone()
        if row is None:
            return None
        return dict(zip([d[0] for d in cur.description], row))
    finally:
        conn.close()


def list_jobs(user_id: Optional[str] = None) -> list[dict[str, Any]]:
    conn = _get_conn()
    try:
        cur = conn.cursor()
        if user_id:
            cur.execute(
                """SELECT job_id, status, label, created_at, started_at, completed_at,
                          error, progress_message, report_path, session_id, server_name, database_name
                   FROM dbo.jobs WHERE user_id = ? ORDER BY created_at DESC""",
                (user_id,),
            )
        else:
            cur.execute(
                """SELECT job_id, status, label, created_at, started_at, completed_at,
                          error, progress_message, report_path, session_id, server_name, database_name
                   FROM dbo.jobs ORDER BY created_at DESC"""
            )
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]
    finally:
        conn.close()


# ── Overview ──────────────────────────────────────────────────────────────────

def save_overview(job_id: str, overview: Optional[dict[str, Any]], access_level: Optional[str] = None) -> None:
    if not overview:
        return
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            IF EXISTS (SELECT 1 FROM dbo.assessment_overview WHERE job_id = ?)
                UPDATE dbo.assessment_overview
                SET database_name      = ?,
                    connected_user     = ?,
                    sql_server_version = ?,
                    schema_count       = ?,
                    table_count        = ?,
                    view_count         = ?,
                    stored_proc_count  = ?,
                    function_count     = ?,
                    total_size_mb      = ?,
                    access_level       = ?
                WHERE job_id = ?
            ELSE
                INSERT INTO dbo.assessment_overview
                    (job_id, database_name, connected_user, sql_server_version,
                     schema_count, table_count, view_count,
                     stored_proc_count, function_count, total_size_mb, access_level)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                job_id,
                overview.get("database_name"), overview.get("connected_user"),
                overview.get("sql_server_version"), overview.get("schema_count"),
                overview.get("table_count"), overview.get("view_count"),
                overview.get("stored_proc_count"), overview.get("function_count"),
                overview.get("total_size_mb"), access_level, job_id,
                job_id,
                overview.get("database_name"), overview.get("connected_user"),
                overview.get("sql_server_version"), overview.get("schema_count"),
                overview.get("table_count"), overview.get("view_count"),
                overview.get("stored_proc_count"), overview.get("function_count"),
                overview.get("total_size_mb"), access_level,
            ),
        )
        conn.commit()
    finally:
        conn.close()


def load_overview(job_id: str) -> Optional[dict[str, Any]]:
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT * FROM dbo.assessment_overview WHERE job_id = ?", (job_id,)
        )
        row = cur.fetchone()
        if row is None:
            return None
        return dict(zip([d[0] for d in cur.description], row))
    finally:
        conn.close()


# ── Sections — typed relational INSERT / SELECT ────────────────────────────────

def save_sections(job_id: str, raw: dict[str, Any]) -> None:
    """
    Persist all 25 assessment sections into their individual typed tables.
    Uses DELETE + INSERT per section (idempotent re-run).
    """
    conn = _get_conn()
    try:
        cur = conn.cursor()

        for section, (table, cols) in _SECTION_CONFIG.items():
            rows: list[dict] = raw.get(section, []) or []

            # Clear any previous data for this job in this table
            cur.execute(f"DELETE FROM dbo.{table} WHERE job_id = ?", (job_id,))

            if not rows:
                continue

            col_list = "job_id, " + ", ".join(cols)
            placeholders = ", ".join(["?"] * (len(cols) + 1))
            insert_sql = f"INSERT INTO dbo.{table} ({col_list}) VALUES ({placeholders})"

            for row in rows:
                values = [job_id] + [row.get(c) for c in cols]
                cur.execute(insert_sql, values)

        conn.commit()
        logger.info("Saved %d sections for job %s", len(_SECTION_CONFIG), job_id)
    finally:
        conn.close()


def load_sections(job_id: str) -> dict[str, list[dict[str, Any]]]:
    """Return all section results for a job, each as a list of typed dicts."""
    conn = _get_conn()
    try:
        cur = conn.cursor()
        result: dict[str, list] = {}

        for section, (table, cols) in _SECTION_CONFIG.items():
            cur.execute(
                f"SELECT {', '.join(cols)} FROM dbo.{table} WHERE job_id = ? ORDER BY id",
                (job_id,),
            )
            result[section] = [dict(zip(cols, row)) for row in cur.fetchall()]

        return result
    finally:
        conn.close()


def load_full_results(job_id: str) -> dict[str, Any]:
    """Combine overview + all sections into a single results dict."""
    overview = load_overview(job_id)
    sections = load_sections(job_id)
    # Extract access_level from overview so the route can pass it to AssessmentResults
    access_level: Optional[str] = None
    if isinstance(overview, dict):
        access_level = overview.pop("access_level", None)
    return {"job_id": job_id, "access_level": access_level, "overview": overview, **sections}


def save_excel_bytes(job_id: str, data: bytes) -> None:
    """Cache the generated Excel bytes in the jobs table for fast re-download."""
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            "UPDATE dbo.jobs SET excel_bytes = ? WHERE job_id = ?",
            (data, job_id),
        )
        conn.commit()
    finally:
        conn.close()


def load_excel_bytes(job_id: str) -> Optional[bytes]:
    """Return cached Excel bytes for a job, or None if not yet cached."""
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute("SELECT excel_bytes FROM dbo.jobs WHERE job_id = ?", (job_id,))
        row = cur.fetchone()
        if row is None or row[0] is None:
            return None
        return bytes(row[0])
    finally:
        conn.close()


def save_ai_report_bytes(job_id: str, data: bytes) -> None:
    """Cache the AI-generated Word report bytes in the jobs table."""
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            "UPDATE dbo.jobs SET ai_report_bytes = ? WHERE job_id = ?",
            (data, job_id),
        )
        conn.commit()
    finally:
        conn.close()


def load_ai_report_bytes(job_id: str) -> Optional[bytes]:
    """Return cached AI Word report bytes for a job, or None if not yet generated."""
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute("SELECT ai_report_bytes FROM dbo.jobs WHERE job_id = ?", (job_id,))
        row = cur.fetchone()
        if row is None or row[0] is None:
            return None
        return bytes(row[0])
    finally:
        conn.close()


def clear_ai_report_bytes(job_id: str) -> None:
    """Clear the cached AI report so the next request triggers a fresh generation."""
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            "UPDATE dbo.jobs SET ai_report_bytes = NULL WHERE job_id = ?",
            (job_id,),
        )
        conn.commit()
    finally:
        conn.close()


def save_fabric_word_bytes(session_id: str, data: bytes) -> None:
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            "UPDATE dbo.fabric_sessions SET word_bytes = ? WHERE session_id = ?",
            (data, session_id),
        )
        conn.commit()
    finally:
        conn.close()


def load_fabric_word_bytes(session_id: str) -> Optional[bytes]:
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute("SELECT word_bytes FROM dbo.fabric_sessions WHERE session_id = ?", (session_id,))
        row = cur.fetchone()
        if row and row[0]:
            return bytes(row[0])
        return None
    finally:
        conn.close()


# ── User CRUD ─────────────────────────────────────────────────────────────────

def create_user(user_id: str, email: str, full_name: Optional[str], password_hash: str) -> None:
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO dbo.users (user_id, email, full_name, password_hash) VALUES (?, ?, ?, ?)",
            (user_id, email, full_name, password_hash),
        )
        conn.commit()
    finally:
        conn.close()


def get_user_by_email(email: str) -> Optional[dict[str, Any]]:
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT user_id, email, full_name, password_hash, mfa_secret, mfa_enabled, is_active, relay_namespace, created_at "
            "FROM dbo.users WHERE email = ?",
            (email,),
        )
        row = cur.fetchone()
        if row is None:
            return None
        cols = [d[0] for d in cur.description]
        return dict(zip(cols, row))
    finally:
        conn.close()


def get_user_by_id(user_id: str) -> Optional[dict[str, Any]]:
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT user_id, email, full_name, password_hash, mfa_secret, mfa_enabled, is_active, relay_namespace, created_at "
            "FROM dbo.users WHERE user_id = ?",
            (user_id,),
        )
        row = cur.fetchone()
        if row is None:
            return None
        cols = [d[0] for d in cur.description]
        return dict(zip(cols, row))
    finally:
        conn.close()


def get_user_relay_namespace(user_id: str) -> Optional[str]:
    """Return the Azure Relay namespace assigned to this user, or None."""
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT relay_namespace FROM dbo.users WHERE user_id = ?",
            (user_id,),
        )
        row = cur.fetchone()
        if row is None:
            return None
        return row[0]
    finally:
        conn.close()


def set_user_relay_namespace(user_id: str, namespace: str) -> None:
    """Persist the Azure Relay namespace for a user (set once, never changes)."""
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            "UPDATE dbo.users SET relay_namespace = ? WHERE user_id = ?",
            (namespace, user_id),
        )
        conn.commit()
    finally:
        conn.close()


def set_user_mfa(user_id: str, secret: str, enabled: bool) -> None:
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            "UPDATE dbo.users SET mfa_secret = ?, mfa_enabled = ? WHERE user_id = ?",
            (secret, 1 if enabled else 0, user_id),
        )
        conn.commit()
    finally:
        conn.close()


# ── Gateway CRUD ──────────────────────────────────────────────────────────────

def register_gateway(gateway_key: str, name: str, user_id: Optional[str] = None) -> None:
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO dbo.gateways (gateway_key, name, status, user_id) VALUES (?, ?, 'offline', ?)",
            (gateway_key, name, user_id),
        )
        conn.commit()
    finally:
        conn.close()


def get_gateway(gateway_key: str) -> Optional[dict[str, Any]]:
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT gateway_key, name, status, last_seen_at, created_at, user_id, relay_connection_string "
            "FROM dbo.gateways WHERE gateway_key = ?",
            (gateway_key,),
        )
        row = cur.fetchone()
        if row is None:
            return None
        cols = [d[0] for d in cur.description]
        result = dict(zip(cols, row))
        for k, v in result.items():
            if isinstance(v, datetime):
                result[k] = v.isoformat()
        return result
    finally:
        conn.close()


def set_gateway_relay(gateway_key: str, relay_connection_string: str) -> None:
    """Store (or clear) the Azure Relay Hybrid Connection string for a gateway."""
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            "UPDATE dbo.gateways SET relay_connection_string = ? WHERE gateway_key = ?",
            (relay_connection_string or None, gateway_key),
        )
        conn.commit()
    finally:
        conn.close()


def list_gateways(user_id: Optional[str] = None) -> list[dict[str, Any]]:
    conn = _get_conn()
    try:
        cur = conn.cursor()
        if user_id:
            cur.execute(
                "SELECT gateway_key, name, status, last_seen_at, created_at "
                "FROM dbo.gateways WHERE user_id = ? ORDER BY created_at DESC",
                (user_id,),
            )
        else:
            cur.execute(
                "SELECT gateway_key, name, status, last_seen_at, created_at "
                "FROM dbo.gateways ORDER BY created_at DESC"
            )
        cols = [d[0] for d in cur.description]
        rows = []
        for row in cur.fetchall():
            d = dict(zip(cols, row))
            for k, v in d.items():
                if isinstance(v, datetime):
                    d[k] = v.isoformat()
            rows.append(d)
        return rows
    finally:
        conn.close()


def update_gateway_seen(gateway_key: str) -> None:
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            "UPDATE dbo.gateways SET status = 'online', last_seen_at = SYSUTCDATETIME() "
            "WHERE gateway_key = ?",
            (gateway_key,),
        )
        conn.commit()
    finally:
        conn.close()


def get_pending_gateway_job(gateway_key: str) -> Optional[dict[str, Any]]:
    """Return the oldest pending job assigned to this gateway, or None."""
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT TOP 1 job_id, gateway_payload
            FROM dbo.jobs
            WHERE gateway_key = ? AND status = 'pending' AND gateway_payload IS NOT NULL
            ORDER BY created_at ASC
            """,
            (gateway_key,),
        )
        row = cur.fetchone()
        if row is None:
            return None
        return {"job_id": row[0], "gateway_payload": row[1]}
    finally:
        conn.close()


def clear_gateway_payload(job_id: str) -> None:
    """Remove credentials from DB as soon as the agent picks them up."""
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            "UPDATE dbo.jobs SET gateway_payload = NULL WHERE job_id = ?",
            (job_id,),
        )
        conn.commit()
    finally:
        conn.close()


def create_gateway_job(job_id: str, label: Optional[str], created_at: datetime,
                       gateway_key: str, gateway_payload: str,
                       user_id: Optional[str] = None) -> None:
    """Create a job that is destined for a gateway agent."""
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO dbo.jobs (job_id, status, label, created_at, gateway_key, gateway_payload, user_id)
            VALUES (?, 'pending', ?, ?, ?, ?, ?)
            """,
            (job_id, label, created_at, gateway_key, gateway_payload, user_id),
        )
        conn.commit()
    finally:
        conn.close()


def timeout_stale_pending_jobs(older_than_minutes: int = 30) -> int:
    """
    Mark PENDING jobs that are older than `older_than_minutes` as FAILED.
    Returns the number of jobs timed out.
    Prevents gateway jobs from staying Pending forever when the agent is offline
    or crashes before submitting results.
    """
    conn = _get_conn()
    try:
        cur = conn.cursor()
        timeout_error_msg = (
            "Job timed out in Pending state - the gateway agent did not "
            "pick up or complete this job within the expected window. "
            "Ensure the agent is running and can reach this server."
        )
        cur.execute(
            """
            UPDATE dbo.jobs
            SET status           = 'failed',
                completed_at     = SYSUTCDATETIME(),
                error            = ?,
                progress_message = NULL
            WHERE status = 'pending'
              AND DATEDIFF(MINUTE, created_at, SYSUTCDATETIME()) >= ?
            """,
            (timeout_error_msg, older_than_minutes),
        )
        count = cur.rowcount
        conn.commit()
        return count if count is not None else 0
    finally:
        conn.close()


# ── Session CRUD ───────────────────────────────────────────────────────────────

def create_session(
    session_id: str,
    label: Optional[str],
    created_at: datetime,
    user_id: Optional[str] = None,
    total_jobs: int = 0,
) -> None:
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO dbo.sessions (session_id, label, status, created_at, user_id, total_jobs) VALUES (?, ?, 'pending', ?, ?, ?)",
            (session_id, label, created_at, user_id, total_jobs),
        )
        conn.commit()
    finally:
        conn.close()


def update_session(session_id: str, **kwargs) -> None:
    """Atomically recompute session counters + status from child jobs, then apply any extra fields."""
    allowed = {"status", "total_jobs", "completed_jobs", "failed_jobs", "completed_at"}
    fields = {k: v for k, v in kwargs.items() if k in allowed}
    if not fields:
        return
    set_clause = ", ".join(f"{col} = ?" for col in fields)
    values = list(fields.values()) + [session_id]
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(f"UPDATE dbo.sessions SET {set_clause} WHERE session_id = ?", values)
        conn.commit()
    finally:
        conn.close()


def recompute_session_status(session_id: str) -> None:
    """Atomically update session status/counters from child job states in one SQL statement."""
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            UPDATE s
            SET
                s.completed_jobs = j.completed_count,
                s.failed_jobs    = j.failed_count,
                s.status         = CASE
                    WHEN j.completed_count + j.failed_count >= s.total_jobs AND s.total_jobs > 0
                        AND j.failed_count = s.total_jobs                        THEN 'failed'
                    WHEN j.completed_count + j.failed_count >= s.total_jobs AND s.total_jobs > 0
                        AND j.failed_count > 0                                   THEN 'partial'
                    WHEN j.completed_count + j.failed_count >= s.total_jobs AND s.total_jobs > 0
                                                                                 THEN 'completed'
                    ELSE 'running'
                END,
                s.completed_at   = CASE
                    WHEN j.completed_count + j.failed_count >= s.total_jobs AND s.total_jobs > 0
                        THEN SYSUTCDATETIME()
                    ELSE s.completed_at
                END
            FROM dbo.sessions s
            CROSS APPLY (
                SELECT
                    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_count,
                    SUM(CASE WHEN status = 'failed'    THEN 1 ELSE 0 END) AS failed_count
                FROM dbo.jobs
                WHERE session_id = s.session_id
            ) j
            WHERE s.session_id = ?
            """,
            (session_id,),
        )
        conn.commit()
    finally:
        conn.close()


def get_session(session_id: str) -> Optional[dict[str, Any]]:
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            """SELECT session_id, label, status, total_jobs, completed_jobs, failed_jobs,
                      created_at, completed_at, user_id
               FROM dbo.sessions WHERE session_id = ?""",
            (session_id,),
        )
        row = cur.fetchone()
        if row is None:
            return None
        cols = [d[0] for d in cur.description]
        result = dict(zip(cols, row))
        for k, v in result.items():
            if isinstance(v, datetime):
                result[k] = v.isoformat()
        return result
    finally:
        conn.close()


def list_sessions(user_id: Optional[str] = None) -> list[dict[str, Any]]:
    conn = _get_conn()
    try:
        cur = conn.cursor()
        if user_id:
            cur.execute(
                """SELECT session_id, label, status, total_jobs, completed_jobs, failed_jobs,
                          created_at, completed_at
                   FROM dbo.sessions WHERE user_id = ? ORDER BY created_at DESC""",
                (user_id,),
            )
        else:
            cur.execute(
                """SELECT session_id, label, status, total_jobs, completed_jobs, failed_jobs,
                          created_at, completed_at
                   FROM dbo.sessions ORDER BY created_at DESC"""
            )
        cols = [d[0] for d in cur.description]
        rows = []
        for row in cur.fetchall():
            d = dict(zip(cols, row))
            for k, v in d.items():
                if isinstance(v, datetime):
                    d[k] = v.isoformat()
            rows.append(d)
        return rows
    finally:
        conn.close()


def cancel_session(session_id: str) -> None:
    """
    Cancel a session: mark all pending/running jobs as cancelled,
    then set the session status to 'cancelled'.
    """
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            UPDATE dbo.jobs
            SET status = 'cancelled',
                error  = 'Cancelled by user',
                completed_at = SYSUTCDATETIME()
            WHERE session_id = ?
              AND status IN ('pending', 'running')
            """,
            (session_id,),
        )
        cur.execute(
            """
            UPDATE dbo.sessions
            SET status = 'cancelled', completed_at = SYSUTCDATETIME()
            WHERE session_id = ?
            """,
            (session_id,),
        )
        conn.commit()
    finally:
        conn.close()


def list_session_jobs(session_id: str) -> list[dict[str, Any]]:
    """Return all jobs belonging to a session, ordered by creation time."""
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            """SELECT job_id, status, label, created_at, started_at, completed_at,
                      error, progress_message, report_path, server_name, database_name
               FROM dbo.jobs WHERE session_id = ? ORDER BY created_at""",
            (session_id,),
        )
        cols = [d[0] for d in cur.description]
        rows = []
        for row in cur.fetchall():
            d = dict(zip(cols, row))
            for k, v in d.items():
                if isinstance(v, datetime):
                    d[k] = v.isoformat()
            rows.append(d)
        return rows
    finally:
        conn.close()


# ── Unified Session CRUD ──────────────────────────────────────────────────────

def create_unified_session(
    unified_session_id: str,
    user_id: Optional[str],
    label: Optional[str],
    mode: str,
) -> None:
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO dbo.unified_sessions (unified_session_id, user_id, label, mode) "
            "VALUES (?, ?, ?, ?)",
            (unified_session_id, user_id, label, mode),
        )
        conn.commit()
    finally:
        conn.close()


def link_unified_source(unified_session_id: str, source_session_id: str) -> None:
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            "UPDATE dbo.unified_sessions SET source_session_id = ? WHERE unified_session_id = ?",
            (source_session_id, unified_session_id),
        )
        conn.commit()
    finally:
        conn.close()


def link_unified_fabric(unified_session_id: str, fabric_session_id: str) -> None:
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            "UPDATE dbo.unified_sessions SET fabric_session_id = ? WHERE unified_session_id = ?",
            (fabric_session_id, unified_session_id),
        )
        conn.commit()
    finally:
        conn.close()


def get_unified_session(unified_session_id: str) -> Optional[dict[str, Any]]:
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT unified_session_id, user_id, label, mode, source_session_id, "
            "fabric_session_id, created_at, completed_at "
            "FROM dbo.unified_sessions WHERE unified_session_id = ?",
            (unified_session_id,),
        )
        row = cur.fetchone()
        if row is None:
            return None
        d = dict(zip([c[0] for c in cur.description], row))
        for k, v in d.items():
            if isinstance(v, datetime):
                d[k] = v.isoformat()
        return d
    finally:
        conn.close()


def list_unified_sessions(user_id: Optional[str] = None) -> list[dict[str, Any]]:
    conn = _get_conn()
    try:
        cur = conn.cursor()
        if user_id:
            cur.execute(
                "SELECT unified_session_id, user_id, label, mode, source_session_id, "
                "fabric_session_id, created_at, completed_at "
                "FROM dbo.unified_sessions WHERE user_id = ? ORDER BY created_at DESC",
                (user_id,),
            )
        else:
            cur.execute(
                "SELECT unified_session_id, user_id, label, mode, source_session_id, "
                "fabric_session_id, created_at, completed_at "
                "FROM dbo.unified_sessions ORDER BY created_at DESC"
            )
        cols = [c[0] for c in cur.description]
        rows = []
        for row in cur.fetchall():
            d = dict(zip(cols, row))
            for k, v in d.items():
                if isinstance(v, datetime):
                    d[k] = v.isoformat()
            rows.append(d)
        return rows
    finally:
        conn.close()


# ── Hybrid Connections ─────────────────────────────────────────────────────────

def create_hybrid_connection(
    connection_id: str,
    user_id: str,
    name: str,
    endpoint_host: str,
    endpoint_port: int,
    service_bus_namespace: str,
    status: str = "created",
    listener_connection_string: Optional[str] = None,
    sender_connection_string: Optional[str] = None,
) -> None:
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO dbo.hybrid_connections
               (connection_id, user_id, name, endpoint_host, endpoint_port,
                service_bus_namespace, status, listener_connection_string,
                sender_connection_string)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (connection_id, user_id, name, endpoint_host, endpoint_port,
             service_bus_namespace, status, listener_connection_string,
             sender_connection_string),
        )
        conn.commit()
    finally:
        conn.close()


def list_hybrid_connections(user_id: str) -> list[dict]:
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            """SELECT connection_id, user_id, name, endpoint_host, endpoint_port,
                      service_bus_namespace, status, created_at,
                      listener_connection_string, sender_connection_string
               FROM dbo.hybrid_connections
               WHERE user_id = ?
               ORDER BY created_at DESC""",
            (user_id,),
        )
        cols = [d[0] for d in cur.description]
        rows = []
        for row in cur.fetchall():
            d = dict(zip(cols, row))
            for k, v in d.items():
                if isinstance(v, datetime):
                    d[k] = v.isoformat()
            rows.append(d)
        return rows
    finally:
        conn.close()


def get_hybrid_connection(connection_id: str, user_id: str) -> Optional[dict]:
    """Return a single hybrid connection row scoped to the owning user, or None."""
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            """SELECT connection_id, user_id, name, endpoint_host, endpoint_port,
                      service_bus_namespace, status, created_at,
                      listener_connection_string, sender_connection_string
               FROM dbo.hybrid_connections
               WHERE connection_id = ? AND user_id = ?""",
            (connection_id, user_id),
        )
        row = cur.fetchone()
        if row is None:
            return None
        cols = [d[0] for d in cur.description]
        result = dict(zip(cols, row))
        for k, v in result.items():
            if isinstance(v, datetime):
                result[k] = v.isoformat()
        return result
    finally:
        conn.close()


def delete_hybrid_connection(connection_id: str, user_id: str) -> bool:
    """Delete a hybrid connection. Returns True if a row was deleted."""
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            "DELETE FROM dbo.hybrid_connections WHERE connection_id = ? AND user_id = ?",
            (connection_id, user_id),
        )
        deleted = cur.rowcount > 0
        conn.commit()
        return deleted
    finally:
        conn.close()


def update_hybrid_connection_status(connection_id: str, status: str) -> None:
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            "UPDATE dbo.hybrid_connections SET status = ? WHERE connection_id = ?",
            (status, connection_id),
        )
        conn.commit()
    finally:
        conn.close()


# ── UserConnections CRUD ───────────────────────────────────────────────────────
# Credentials (database_name_enc, sql_username_enc, sql_password_enc) are stored
# already encrypted by the caller.  This layer never touches plaintext.

def create_user_connection(
    connection_id: str,
    user_id: str,
    display_name: str,
    tunnel_host: str,
    tunnel_port: int,
    database_name_enc: str,
    sql_username_enc: str,
    sql_password_enc: str,
) -> None:
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO dbo.user_connections
               (connection_id, user_id, display_name, tunnel_host, tunnel_port,
                database_name_enc, sql_username_enc, sql_password_enc)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (connection_id, user_id, display_name, tunnel_host, tunnel_port,
             database_name_enc, sql_username_enc, sql_password_enc),
        )
        conn.commit()
    finally:
        conn.close()


def get_user_connection(connection_id: str, user_id: str) -> Optional[dict[str, Any]]:
    """Return a single connection row scoped to the owning user, or None."""
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            """SELECT connection_id, user_id, display_name, tunnel_host, tunnel_port,
                      database_name_enc, sql_username_enc, sql_password_enc,
                      created_at, updated_at
               FROM dbo.user_connections
               WHERE connection_id = ? AND user_id = ?""",
            (connection_id, user_id),
        )
        row = cur.fetchone()
        if row is None:
            return None
        cols = [d[0] for d in cur.description]
        result = dict(zip(cols, row))
        for k, v in result.items():
            if isinstance(v, datetime):
                result[k] = v.isoformat()
        return result
    finally:
        conn.close()


def list_user_connections(user_id: str) -> list[dict[str, Any]]:
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            """SELECT connection_id, user_id, display_name, tunnel_host, tunnel_port,
                      database_name_enc, sql_username_enc, sql_password_enc,
                      created_at, updated_at
               FROM dbo.user_connections
               WHERE user_id = ?
               ORDER BY created_at DESC""",
            (user_id,),
        )
        cols = [d[0] for d in cur.description]
        rows = []
        for row in cur.fetchall():
            d = dict(zip(cols, row))
            for k, v in d.items():
                if isinstance(v, datetime):
                    d[k] = v.isoformat()
            rows.append(d)
        return rows
    finally:
        conn.close()


def update_user_connection(
    connection_id: str,
    user_id: str,
    display_name: str,
    tunnel_host: str,
    tunnel_port: int,
    database_name_enc: str,
    sql_username_enc: str,
    sql_password_enc: str,
) -> bool:
    """Update a connection. Returns True if a row was updated (owner match)."""
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            """UPDATE dbo.user_connections
               SET display_name      = ?,
                   tunnel_host       = ?,
                   tunnel_port       = ?,
                   database_name_enc = ?,
                   sql_username_enc  = ?,
                   sql_password_enc  = ?,
                   updated_at        = SYSUTCDATETIME()
               WHERE connection_id = ? AND user_id = ?""",
            (display_name, tunnel_host, tunnel_port,
             database_name_enc, sql_username_enc, sql_password_enc,
             connection_id, user_id),
        )
        updated = cur.rowcount > 0
        conn.commit()
        return updated
    finally:
        conn.close()


def delete_user_connection(connection_id: str, user_id: str) -> bool:
    """Delete a connection. Returns True if a row was deleted (owner match)."""
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            "DELETE FROM dbo.user_connections WHERE connection_id = ? AND user_id = ?",
            (connection_id, user_id),
        )
        deleted = cur.rowcount > 0
        conn.commit()
        return deleted
    finally:
        conn.close()


# ═════════════════════════════════════════════════════════════════════════════
# Generic JSON-blob persistence helpers
# Each module (Dataverse, SAP, Sage Intacct, Snowflake, Tableau) stores its
# full result as NVARCHAR(MAX) results_json alongside key scalar columns for
# fast list queries.  Pattern: upsert / list / get_by_id.
# ═════════════════════════════════════════════════════════════════════════════

import json as _json


def _upsert(table: str, pk_col: str, pk_val: str, scalars: dict, results_obj: Any) -> None:
    """Generic MERGE into any module session table."""
    results_json = _json.dumps(results_obj, default=str) if results_obj is not None else None
    all_cols  = list(scalars.keys()) + ["results_json"]
    all_vals  = list(scalars.values()) + [results_json]

    set_clause    = ", ".join(f"{c} = ?" for c in all_cols)
    insert_cols   = ", ".join([pk_col] + all_cols)
    insert_params = ", ".join(["?"] * (1 + len(all_cols)))

    sql = f"""
        MERGE dbo.{table} AS target
        USING (SELECT ? AS {pk_col}) AS src ON target.{pk_col} = src.{pk_col}
        WHEN MATCHED THEN UPDATE SET {set_clause}
        WHEN NOT MATCHED THEN INSERT ({insert_cols}) VALUES ({insert_params});
    """
    params = (
        pk_val,                       # USING clause
        *all_vals,                    # UPDATE SET
        pk_val, *all_vals,            # INSERT VALUES
    )
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(sql, params)
        conn.commit()
    except Exception as exc:
        logger.warning("_upsert(%s) failed (non-fatal): %s", table, exc)
    finally:
        conn.close()


def _list_sessions(table: str, list_cols: list[str]) -> list[dict]:
    """Return all rows ordered newest-first."""
    cols_sql = ", ".join(list_cols)
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(f"SELECT {cols_sql} FROM dbo.{table} ORDER BY created_at DESC")
        cols = [c[0] for c in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]
    except Exception as exc:
        logger.warning("_list_sessions(%s) failed: %s", table, exc)
        return []
    finally:
        conn.close()


def _get_session(table: str, pk_col: str, pk_val: str) -> Optional[dict]:
    """Fetch one row including results_json; parses JSON into result key."""
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(f"SELECT * FROM dbo.{table} WHERE {pk_col} = ?", pk_val)
        row = cur.fetchone()
        if not row:
            return None
        cols = [c[0] for c in cur.description]
        data = dict(zip(cols, row))
        if data.get("results_json"):
            try:
                data["result"] = _json.loads(data["results_json"])
            except Exception:
                data["result"] = None
        return data
    except Exception as exc:
        logger.warning("_get_session(%s) failed: %s", table, exc)
        return None
    finally:
        conn.close()


# ── Dataverse ─────────────────────────────────────────────────────────────────

_DV_LIST_COLS = [
    "job_id", "label", "environment_url", "org_name", "org_version",
    "status", "overall_score", "critical_findings", "high_findings",
    "duration_seconds", "created_at", "completed_at", "error",
]


def dv_upsert_session(job: dict) -> None:
    r = job.get("result")
    # result may be a DataverseAssessmentResult instance or a dict
    def _g(key, default=None):
        if r is None:
            return default
        return getattr(r, key, None) if not isinstance(r, dict) else r.get(key, default)

    _upsert(
        table="dataverse_sessions", pk_col="job_id", pk_val=job["job_id"],
        scalars={
            "label":            job.get("label"),
            "environment_url":  job.get("environment_url", ""),
            "org_name":         _g("organization_name"),
            "org_version":      _g("organization_version"),
            "status":           job.get("status", "pending"),
            "progress_message": job.get("progress_message"),
            "checks_completed": job.get("checks_completed", 0),
            "total_checks":     job.get("total_checks", 0),
            "overall_score":    _g("overall_score"),
            "critical_findings":_g("critical_findings"),
            "high_findings":    _g("high_findings"),
            "duration_seconds": job.get("duration_seconds"),
            "error":            job.get("error"),
            "created_at":       job.get("created_at"),
            "completed_at":     job.get("completed_at"),
        },
        results_obj=r.model_dump() if hasattr(r, "model_dump") else r,
    )


def dv_list_sessions() -> list[dict]:
    return _list_sessions("dataverse_sessions", _DV_LIST_COLS)


def dv_get_session(job_id: str) -> Optional[dict]:
    return _get_session("dataverse_sessions", "job_id", job_id)


# ── SAP ───────────────────────────────────────────────────────────────────────

_SAP_LIST_COLS = [
    "job_id", "label", "variant", "host",
    "status", "duration_seconds", "created_at", "completed_at", "error",
]


def sap_upsert_session(job: dict) -> None:
    r = job.get("results")
    _upsert(
        table="sap_sessions", pk_col="job_id", pk_val=job["job_id"],
        scalars={
            "label":            job.get("label"),
            "variant":          str(job.get("variant", "")),
            "host":             job.get("host"),
            "status":           job.get("status", "pending"),
            "progress_message": job.get("progress_message"),
            "duration_seconds": job.get("duration_seconds"),
            "error":            job.get("error"),
            "created_at":       job.get("created_at"),
            "completed_at":     job.get("completed_at"),
        },
        results_obj=r.model_dump() if hasattr(r, "model_dump") else r,
    )


def sap_list_sessions() -> list[dict]:
    return _list_sessions("sap_sessions", _SAP_LIST_COLS)


def sap_get_session(job_id: str) -> Optional[dict]:
    return _get_session("sap_sessions", "job_id", job_id)


# ── Sage Intacct ──────────────────────────────────────────────────────────────

_SAGE_LIST_COLS = [
    "job_id", "label", "company_id", "company_name",
    "status", "duration_seconds", "created_at", "completed_at", "error",
]


def sage_upsert_session(job: dict) -> None:
    r = job.get("results")
    def _g(key, default=None):
        if r is None:
            return default
        return getattr(r, key, None) if not isinstance(r, dict) else r.get(key, default)

    company_profile = _g("company_profile") or {}
    if hasattr(company_profile, "__dict__"):
        company_id   = getattr(company_profile, "company_id", None)
        company_name = getattr(company_profile, "company_name", None)
    else:
        company_id   = company_profile.get("company_id") if isinstance(company_profile, dict) else None
        company_name = company_profile.get("company_name") if isinstance(company_profile, dict) else None

    _upsert(
        table="sage_intacct_sessions", pk_col="job_id", pk_val=job["job_id"],
        scalars={
            "label":            job.get("label"),
            "company_id":       company_id,
            "company_name":     company_name,
            "status":           job.get("status", "pending"),
            "progress_message": job.get("progress_message"),
            "duration_seconds": job.get("duration_seconds"),
            "error":            job.get("error"),
            "created_at":       job.get("created_at"),
            "completed_at":     job.get("completed_at"),
        },
        results_obj=r.model_dump() if hasattr(r, "model_dump") else r,
    )


def sage_list_sessions() -> list[dict]:
    return _list_sessions("sage_intacct_sessions", _SAGE_LIST_COLS)


def sage_get_session(job_id: str) -> Optional[dict]:
    return _get_session("sage_intacct_sessions", "job_id", job_id)


# ── Snowflake ─────────────────────────────────────────────────────────────────

_SF2_LIST_COLS = [
    "job_id", "label", "account", "warehouse",
    "status", "duration_seconds", "created_at", "completed_at", "error",
]


def snowflake_upsert_session(job: dict) -> None:
    r = job.get("results")
    def _g(key, default=None):
        if r is None:
            return default
        return getattr(r, key, None) if not isinstance(r, dict) else r.get(key, default)

    account_info = _g("account_info") or {}
    warehouse    = None
    if hasattr(account_info, "default_warehouse"):
        warehouse = getattr(account_info, "default_warehouse", None)
    elif isinstance(account_info, dict):
        warehouse = account_info.get("default_warehouse")

    _upsert(
        table="snowflake_sessions", pk_col="job_id", pk_val=job["job_id"],
        scalars={
            "label":            job.get("label"),
            "account":          job.get("account"),
            "warehouse":        warehouse,
            "status":           job.get("status", "pending"),
            "progress_message": job.get("progress_message"),
            "duration_seconds": job.get("duration_seconds"),
            "error":            job.get("error"),
            "created_at":       job.get("created_at"),
            "completed_at":     job.get("completed_at"),
        },
        results_obj=r.model_dump() if hasattr(r, "model_dump") else r,
    )


def snowflake_list_sessions() -> list[dict]:
    return _list_sessions("snowflake_sessions", _SF2_LIST_COLS)


def snowflake_get_session(job_id: str) -> Optional[dict]:
    return _get_session("snowflake_sessions", "job_id", job_id)


# ── Tableau ───────────────────────────────────────────────────────────────────

_TAB_LIST_COLS = [
    "job_id", "label", "server_url", "site_name",
    "status", "duration_seconds", "created_at", "completed_at", "error",
]


def tableau_upsert_session(job: dict) -> None:
    r = job.get("results")
    def _g(key, default=None):
        if r is None:
            return default
        return getattr(r, key, None) if not isinstance(r, dict) else r.get(key, default)

    server_info = _g("server_info") or {}
    site_name   = None
    if hasattr(server_info, "site_name"):
        site_name = getattr(server_info, "site_name", None)
    elif isinstance(server_info, dict):
        site_name = server_info.get("site_name")

    _upsert(
        table="tableau_sessions", pk_col="job_id", pk_val=job["job_id"],
        scalars={
            "label":            job.get("label"),
            "server_url":       job.get("server_url"),
            "site_name":        site_name,
            "status":           job.get("status", "pending"),
            "progress_message": job.get("progress_message"),
            "duration_seconds": job.get("duration_seconds"),
            "error":            job.get("error"),
            "created_at":       job.get("created_at"),
            "completed_at":     job.get("completed_at"),
        },
        results_obj=r.model_dump() if hasattr(r, "model_dump") else r,
    )


def tableau_list_sessions() -> list[dict]:
    return _list_sessions("tableau_sessions", _TAB_LIST_COLS)


def tableau_get_session(job_id: str) -> Optional[dict]:
    return _get_session("tableau_sessions", "job_id", job_id)


# ── IBM Db2 ───────────────────────────────────────────────────────────────────

_DB2_LIST_COLS = [
    "job_id", "label", "hostname", "database_name", "port",
    "db2_version", "instance_name",
    "schema_count", "table_count", "view_count", "procedure_count",
    "tablespace_count", "blu_enabled", "is_dpf",
    "status", "created_at", "completed_at", "error",
]


def db2_upsert_session(job: dict) -> None:
    r = job.get("results")

    def _g(key, default=None):
        if r is None:
            return default
        return getattr(r, key, None) if not isinstance(r, dict) else r.get(key, default)

    # Pull nested object fields
    inv       = _g("object_inventory") or {}
    inst_info = _g("instance_info")    or {}
    db_info   = _g("database_info")    or {}

    def _nested(obj, key, default=None):
        if obj is None:
            return default
        return getattr(obj, key, None) if not isinstance(obj, dict) else obj.get(key, default)

    _upsert(
        table="db2_sessions", pk_col="job_id", pk_val=job["job_id"],
        scalars={
            "label":            job.get("label"),
            "hostname":         job.get("hostname"),
            "database_name":    job.get("database"),
            "port":             job.get("port"),
            "db2_version":      _nested(inst_info, "db2_version"),
            "instance_name":    _nested(inst_info, "instance_name"),
            "schema_count":     _nested(inv, "schema_count"),
            "table_count":      _nested(inv, "table_count"),
            "view_count":       _nested(inv, "view_count"),
            "procedure_count":  _nested(inv, "procedure_count"),
            "tablespace_count": _nested(inv, "tablespace_count"),
            "blu_enabled":      1 if _nested(db_info, "blu_enabled") else 0,
            "is_dpf":           1 if _nested(inst_info, "is_dpf") else 0,
            "status":           job.get("status", "pending"),
            "progress_message": job.get("progress_message"),
            "error":            job.get("error"),
            "created_at":       job.get("created_at"),
            "completed_at":     job.get("completed_at"),
        },
        results_obj=r.model_dump() if hasattr(r, "model_dump") else r,
    )


def db2_list_sessions() -> list[dict]:
    return _list_sessions("db2_sessions", _DB2_LIST_COLS)


def db2_get_session(job_id: str) -> Optional[dict]:
    return _get_session("db2_sessions", "job_id", job_id)


# ── Infor CloudSuite ──────────────────────────────────────────────────────────

_INFOR_LIST_COLS = [
    "job_id", "label", "engine", "tenant_id",
    "total_checks", "passed_checks", "critical_findings", "high_findings",
    "overall_score", "status", "created_at", "completed_at", "error",
]


def infor_upsert_session(job: dict) -> None:
    r = job.get("results")

    def _g(key, default=None):
        if r is None:
            return default
        return r.get(key, default) if isinstance(r, dict) else getattr(r, key, default)

    _upsert(
        table="infor_sessions", pk_col="job_id", pk_val=job["job_id"],
        scalars={
            "label":             job.get("label"),
            "engine":            job.get("engine"),
            "tenant_id":         job.get("tenant_id"),
            "total_checks":      _g("total_checks"),
            "passed_checks":     _g("passed_checks"),
            "critical_findings": _g("critical_findings"),
            "high_findings":     _g("high_findings"),
            "overall_score":     _g("overall_score"),
            "status":            job.get("status", "pending"),
            "progress_message":  job.get("progress_message"),
            "duration_seconds":  job.get("duration_seconds"),
            "error":             job.get("error"),
            "completed_at":      job.get("completed_at"),
        },
        results_obj=r,
    )


def infor_list_sessions() -> list[dict]:
    return _list_sessions("infor_sessions", _INFOR_LIST_COLS)


def infor_get_session(job_id: str) -> Optional[dict]:
    return _get_session("infor_sessions", "job_id", job_id)


# ── Databricks ────────────────────────────────────────────────────────────────

_DATABRICKS_LIST_COLS = [
    "job_id", "label", "workspace_url", "workspace_name", "cloud",
    "cluster_count", "warehouse_count", "catalog_count", "job_count",
    "total_checks", "passed_checks", "critical_findings", "high_findings",
    "overall_score", "status", "created_at", "completed_at", "error",
]


def databricks_upsert_session(job: dict) -> None:
    r = job.get("results")

    def _g(key, default=None):
        if r is None:
            return default
        return r.get(key, default) if isinstance(r, dict) else getattr(r, key, default)

    def _nested(obj, key, default=None):
        if obj is None:
            return default
        return obj.get(key, default) if isinstance(obj, dict) else getattr(obj, key, default)

    ws_info = _g("workspace_info") or {}

    _upsert(
        table="databricks_sessions", pk_col="job_id", pk_val=job["job_id"],
        scalars={
            "label":             job.get("label"),
            "workspace_url":     job.get("workspace_url"),
            "workspace_name":    _nested(ws_info, "workspace_name"),
            "cloud":             _nested(ws_info, "cloud"),
            "cluster_count":     job.get("cluster_count"),
            "warehouse_count":   job.get("warehouse_count"),
            "catalog_count":     job.get("catalog_count"),
            "job_count":         job.get("job_count"),
            "total_checks":      job.get("total_checks"),
            "passed_checks":     job.get("passed_checks"),
            "critical_findings": job.get("critical_findings"),
            "high_findings":     job.get("high_findings"),
            "overall_score":     job.get("overall_score"),
            "status":            job.get("status", "pending"),
            "progress_message":  job.get("progress_message"),
            "duration_seconds":  job.get("duration_seconds"),
            "error":             job.get("error"),
            "completed_at":      job.get("completed_at"),
        },
        results_obj=r,
    )


def databricks_list_sessions() -> list[dict]:
    return _list_sessions("databricks_sessions", _DATABRICKS_LIST_COLS)


def databricks_get_session(job_id: str) -> Optional[dict]:
    return _get_session("databricks_sessions", "job_id", job_id)
