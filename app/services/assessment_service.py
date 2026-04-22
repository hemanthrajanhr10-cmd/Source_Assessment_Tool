"""
Assessment service: orchestrates the full SQL Server metadata collection workflow.
"""

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from app.core import job_store
from app.core.logging import get_logger
from app.db import azure_store, connector, queries
from app.db import queries_postgres, queries_mysql, queries_oracle
from app.models.requests import AssessmentRequest
from app.services import report_service

logger = get_logger(__name__)

# Access level hierarchy — higher rank includes all lower levels
ACCESS_LEVEL_RANK: dict[str, int] = {
    "db_datareader":       1,
    "view_database_state": 2,
    "db_owner":            3,
    "sysadmin":            4,
}

_STEP_KEYS = [
    # (result_key, query_attr, display_name, min_access_level)
    # ── Core metadata — db_datareader ─────────────────────────────────────
    ("overview",            "OVERVIEW",            "Database overview",                  "db_datareader"),
    ("schemas",             "SCHEMAS",             "Schemas",                            "db_datareader"),
    ("tables",              "TABLES",              "Tables",                             "db_datareader"),
    ("columns",             "COLUMNS",             "Columns",                            "db_datareader"),
    ("views",               "VIEWS",               "Views",                              "db_datareader"),
    ("stored_procedures",   "STORED_PROCEDURES",   "Stored procedures",                  "db_datareader"),
    ("functions",           "FUNCTIONS",           "Functions",                          "db_datareader"),
    ("indexes",             "INDEXES",             "Indexes",                            "db_datareader"),
    ("relationships",       "RELATIONSHIPS",       "Relationships",                      "db_datareader"),
    ("index_coverage",      "INDEX_COVERAGE",      "Index coverage",                     "db_datareader"),
    ("insertion_frequency", "INSERTION_FREQUENCY", "Insertion frequency",                "db_datareader"),
    # ── Security assessment — db_datareader ───────────────────────────────
    ("db_users_roles",      "DB_USERS_ROLES",      "Database users & roles",             "db_datareader"),
    ("orphaned_users",      "ORPHANED_USERS",      "Orphaned users",                     "db_datareader"),
    ("db_owner_members",    "DB_OWNER_MEMBERS",    "Excessive permissions (db_owner)",   "db_datareader"),
    ("dynamic_sql_usage",   "DYNAMIC_SQL_USAGE",   "Dynamic SQL usage",                  "db_datareader"),
    ("clr_assemblies",      "CLR_ASSEMBLIES",      "CLR assemblies",                     "db_datareader"),
    ("tde_status",          "TDE_STATUS",          "TDE encryption status",              "db_datareader"),
    ("column_encryption",   "COLUMN_ENCRYPTION",   "Column-level encryption",            "db_datareader"),
    ("pii_indicators",      "PII_INDICATORS",      "PII / sensitive data scan",          "db_datareader"),
    # ── Feature usage & risks — db_datareader ────────────────────────────
    ("cross_db_references", "CROSS_DB_REFERENCES", "Cross-database references",          "db_datareader"),
    ("replication_status",  "REPLICATION_STATUS",  "Replication status",                 "db_datareader"),
    ("service_broker",      "SERVICE_BROKER",      "Service Broker",                     "db_datareader"),
    ("version_features",    "VERSION_FEATURES",    "Version & feature risks",            "db_datareader"),
    # ── New: Schema / Design checks — db_datareader ───────────────────────
    ("trustworthy_databases",  "TRUSTWORTHY_DATABASES",  "Trustworthy database flag",        "db_datareader"),
    ("deprecated_data_types",  "DEPRECATED_DATA_TYPES",  "Deprecated data types",            "db_datareader"),
    ("missing_primary_keys",   "MISSING_PRIMARY_KEYS",   "Missing primary keys",             "db_datareader"),
    ("heap_tables",            "HEAP_TABLES",            "Heap tables (no clustered index)", "db_datareader"),
    ("untrusted_constraints",  "UNTRUSTED_CONSTRAINTS",  "Untrusted FK / CHECK constraints", "db_datareader"),
    ("sp_naming_violations",   "SP_NAMING_VIOLATIONS",   "Stored proc naming violations",    "db_datareader"),
    ("duplicate_indexes",      "DUPLICATE_INDEXES",      "Duplicate indexes",                "db_datareader"),
    ("database_options_audit", "DATABASE_OPTIONS_AUDIT", "Database options audit",           "db_datareader"),
    # ── New: Object permissions — db_owner ────────────────────────────────
    ("object_permissions",     "OBJECT_PERMISSIONS",     "Object permissions",               "db_owner"),
    # ── New: Performance checks — view_database_state ─────────────────────
    ("missing_indexes",        "MISSING_INDEXES",        "Missing index recommendations",    "view_database_state"),
    ("index_usage_stats",      "INDEX_USAGE_STATS",      "Index usage statistics",           "view_database_state"),
    ("fragmentation_report",   "FRAGMENTATION_REPORT",   "Index fragmentation",              "view_database_state"),
    ("statistics_health",      "STATISTICS_HEALTH",      "Statistics health",                "view_database_state"),
    # ── New: Server-level checks — sysadmin ───────────────────────────────
    ("sql_agent_jobs",            "SQL_AGENT_JOBS",            "SQL Agent jobs",                "sysadmin"),
    ("linked_servers",            "LINKED_SERVERS",            "Linked servers",                "sysadmin"),
    ("backup_history",            "BACKUP_HISTORY",            "Backup history",                "sysadmin"),
    ("server_configurations",     "SERVER_CONFIGURATIONS",     "Server configurations",         "sysadmin"),
    ("weak_sql_logins",           "WEAK_SQL_LOGINS",           "Weak SQL logins",               "sysadmin"),
    ("server_permissions",        "SERVER_PERMISSIONS",        "Server role members",           "sysadmin"),
    ("deprecated_features_in_use","DEPRECATED_FEATURES_IN_USE","Deprecated features in use",   "sysadmin"),
]

_QUERY_MODULE = {
    "mssql":    queries,
    "postgres": queries_postgres,
    "mysql":    queries_mysql,
    "oracle":   queries_oracle,
}


def _get_query_steps(db_type: str) -> list[tuple[str, str, str, str]]:
    """Return (result_key, sql, display_name, min_access_level) for the given db_type."""
    mod = _QUERY_MODULE.get(db_type, queries)
    return [
        (key, getattr(mod, attr, "SELECT NULL WHERE 1=0"), display, min_level)
        for key, attr, display, min_level in _STEP_KEYS
    ]


# Keep backward-compat name used by older callers
_QUERY_STEPS = _get_query_steps("mssql")


def _cursor_rows_to_dicts(cursor) -> list[dict[str, Any]]:
    """Convert cursor results to a list of dicts keyed by lowercase column name.
    Lowercasing normalises Oracle's uppercase column aliases to match PG/MySQL/MSSQL.
    """
    if cursor.description is None:
        return []
    col_names = [desc[0].lower() for desc in cursor.description]
    rows = cursor.fetchall()
    result = []
    for row in rows:
        record: dict[str, Any] = {}
        for name, value in zip(col_names, row):
            if isinstance(value, datetime):
                record[name] = value.isoformat()
            elif isinstance(value, Decimal):
                record[name] = float(value)
            else:
                record[name] = value
        result.append(record)
    return result


def _safe_fetch(cursor, sql: str) -> list[dict[str, Any]]:
    try:
        cursor.execute(sql)
        return _cursor_rows_to_dicts(cursor)
    except Exception as exc:
        logger.warning("Query failed: %s", exc)
        return []


def _run_null_analysis(
    cursor, table_rows: list[dict[str, Any]], sample_limit: int,
    db_type: str = "mssql",
) -> list[dict[str, Any]]:
    """
    For up to sample_limit tables, compute null/blank percentage per nullable column.
    Generates db_type-appropriate SQL.
    """
    results: list[dict[str, Any]] = []
    sampled = 0
    query_mod = _QUERY_MODULE.get(db_type, queries)

    for tbl in table_rows:
        if sampled >= sample_limit:
            break

        schema = tbl.get("schema_name", "")
        table = tbl.get("table_name", "")

        if db_type == "mssql":
            full_name = f"[{schema}].[{table}]"
        elif db_type == "mysql":
            full_name = f"{schema}.{table}"
        else:
            full_name = f"{schema}.{table}"

        null_analysis_sql = getattr(query_mod, "NULL_ANALYSIS_COLUMNS", "")
        if null_analysis_sql == "PARAMETERISED":
            # postgres / mysql / oracle: parameterised queries to avoid SQL injection
            if db_type == "postgres":
                col_sql = (
                    "SELECT column_name AS name, data_type "
                    "FROM information_schema.columns "
                    "WHERE table_schema = %s AND table_name = %s "
                    "  AND is_nullable = 'YES' "
                    "ORDER BY ordinal_position LIMIT 20"
                )
                params_tuple = (schema, table)
            elif db_type == "oracle":
                # Oracle uses :1/:2 positional placeholders; owner = schema for Oracle
                col_sql = (
                    "SELECT column_name AS name, data_type "
                    "FROM all_tab_columns "
                    "WHERE owner = :1 AND table_name = :2 AND nullable = 'Y' "
                    "ORDER BY column_id "
                    "FETCH FIRST 20 ROWS ONLY"
                )
                # Oracle stores identifiers uppercase unless quoted at creation
                params_tuple = (schema.upper(), table.upper())
            else:  # mysql
                col_sql = (
                    "SELECT COLUMN_NAME AS name, DATA_TYPE AS data_type "
                    "FROM information_schema.COLUMNS "
                    "WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s "
                    "  AND IS_NULLABLE = 'YES' "
                    "ORDER BY ORDINAL_POSITION LIMIT 20"
                )
                params_tuple = (schema, table)
            try:
                cursor.execute(col_sql, params_tuple)
                col_rows = _cursor_rows_to_dicts(cursor)
            except Exception as exc:
                logger.warning("Column fetch failed for %s.%s: %s", schema, table, exc)
                col_rows = []
        else:
            col_sql = null_analysis_sql.format(full_name=full_name)
            col_rows = _safe_fetch(cursor, col_sql)
        if not col_rows:
            sampled += 1
            continue

        nullable_cols = [(r["name"], r["data_type"]) for r in col_rows[:20]]
        if not nullable_cols:
            sampled += 1
            continue

        exprs: list[str] = []
        for col_name, dtype in nullable_cols:
            if db_type == "mssql":
                safe_col = f"[{col_name}]"
                if dtype in ("varchar", "nvarchar", "char", "nchar"):
                    exprs.append(
                        f"SUM(CASE WHEN {safe_col} IS NULL "
                        f"OR LTRIM(RTRIM({safe_col})) = '' THEN 1 ELSE 0 END) "
                        f"* 100.0 / NULLIF(COUNT(*),0) AS [{col_name}_null_pct]"
                    )
                elif dtype in ("text", "ntext"):
                    exprs.append(
                        f"SUM(CASE WHEN {safe_col} IS NULL "
                        f"OR LTRIM(RTRIM(CAST({safe_col} AS NVARCHAR(MAX)))) = '' THEN 1 ELSE 0 END) "
                        f"* 100.0 / NULLIF(COUNT(*),0) AS [{col_name}_null_pct]"
                    )
                else:
                    exprs.append(
                        f"SUM(CASE WHEN {safe_col} IS NULL THEN 1 ELSE 0 END) "
                        f"* 100.0 / NULLIF(COUNT(*),0) AS [{col_name}_null_pct]"
                    )
            elif db_type == "oracle":
                # Oracle: double-quote identifiers; alias lowercased for consistency
                safe_col = f'"{col_name}"'
                null_pct_alias = f"{col_name.lower()}_null_pct"
                exprs.append(
                    f"SUM(CASE WHEN {safe_col} IS NULL THEN 1 ELSE 0 END) "
                    f"* 100.0 / NULLIF(COUNT(*),0) AS \"{null_pct_alias}\""
                )
            else:
                # PostgreSQL / MySQL
                safe_col = f'"{col_name}"' if db_type == "postgres" else f"`{col_name}`"
                null_pct_alias = f"{col_name}_null_pct"
                exprs.append(
                    f"SUM(CASE WHEN {safe_col} IS NULL THEN 1 ELSE 0 END) "
                    f"* 100.0 / NULLIF(COUNT(*),0) AS \"{null_pct_alias}\""
                )

        if db_type == "oracle":
            table_ref = f'"{schema.upper()}"."{table.upper()}"'
        elif db_type == "postgres":
            table_ref = f'"{schema}"."{table}"'
        elif db_type == "mysql":
            table_ref = f"`{schema}`.`{table}`"
        else:
            table_ref = full_name
        query = f"SELECT COUNT(*) AS total_rows, {', '.join(exprs)} FROM {table_ref}"
        try:
            cursor.execute(query)
            row = cursor.fetchone()
        except Exception as exc:
            logger.warning("Null analysis failed for %s: %s", full_name, exc)
            sampled += 1
            continue

        if row:
            total_rows = row[0]
            for idx, (col_name, _) in enumerate(nullable_cols):
                pct_raw = row[idx + 1]
                results.append({
                    "schema_name": schema,
                    "table_name": table,
                    "column_name": col_name,
                    "total_rows": total_rows,
                    "null_blank_pct": round(float(pct_raw), 2) if pct_raw is not None else 0.0,
                })

        sampled += 1

    return results


def _extract_overview(overview_rows: list[dict[str, Any]]) -> dict[str, Any] | None:
    if not overview_rows:
        return None
    r = overview_rows[0]
    return {
        "database_name": r.get("database_name", ""),
        "connected_user": r.get("connected_user", ""),
        "sql_server_version": str(r.get("sql_version", ""))[:120],
        "schema_count": r.get("schema_count", 0),
        "table_count": r.get("table_count", 0),
        "view_count": r.get("view_count", 0),
        "stored_proc_count": r.get("proc_count", 0),
        "function_count": r.get("func_count", 0),
        "total_size_mb": r.get("total_size_mb"),
    }


def run_assessment(job_id: str, request: AssessmentRequest) -> tuple[dict[str, Any], str]:
    """
    Connect to the database, run all metadata queries, build the Excel report,
    and return (results_dict, report_file_path).
    Raises on any fatal error; the caller updates job status accordingly.
    """
    extra = {"job_id": job_id}
    db_type = getattr(request.connection, "db_type", "mssql")
    logger.info("Connecting to %s database", db_type, extra=extra)

    conn = connector.get_connection(request.connection)
    cursor = conn.cursor()

    query_steps = _get_query_steps(db_type)
    access_level = getattr(request, "access_level", "db_datareader") or "db_datareader"
    access_rank = ACCESS_LEVEL_RANK.get(access_level, 1)

    try:
        raw: dict[str, Any] = {}

        for key, sql, display_name, min_level in query_steps:
            min_rank = ACCESS_LEVEL_RANK.get(min_level, 1)
            if access_rank < min_rank:
                # Skip — user's access level is insufficient; mark as skipped
                raw[key] = []
                logger.debug("Skipped %s (requires %s, have %s)", key, min_level, access_level, extra=extra)
                continue
            logger.info("Running query: %s", display_name, extra=extra)
            job_store.update_job(job_id, progress_message=f"Collecting {display_name}…")
            raw[key] = _safe_fetch(cursor, sql)

        if request.include_null_analysis:
            logger.info("Running null analysis (limit=%d)", request.null_analysis_sample_limit, extra=extra)
            job_store.update_job(job_id, progress_message="Running null/blank analysis…")
            raw["null_analysis"] = _run_null_analysis(
                cursor, raw.get("tables", []), request.null_analysis_sample_limit,
                db_type=db_type,
            )
        else:
            raw["null_analysis"] = []

        job_store.update_job(job_id, progress_message="Persisting results to Azure SQL…")
        overview_dict = _extract_overview(raw.get("overview", []))
        azure_store.save_overview(job_id, overview_dict, access_level=access_level)
        azure_store.save_sections(job_id, raw)

        job_store.update_job(job_id, progress_message="Building Excel report…")
        report_path = report_service.build_report(job_id, raw)

        results: dict[str, Any] = {
            "job_id": job_id,
            "access_level": access_level,
            # Core metadata
            "overview":            _extract_overview(raw.get("overview", [])),
            "schemas":             raw.get("schemas", []),
            "tables":              raw.get("tables", []),
            "columns":             raw.get("columns", []),
            "views":               raw.get("views", []),
            "stored_procedures":   raw.get("stored_procedures", []),
            "functions":           raw.get("functions", []),
            "indexes":             raw.get("indexes", []),
            "relationships":       raw.get("relationships", []),
            "index_coverage":      raw.get("index_coverage", []),
            "insertion_frequency": raw.get("insertion_frequency", []),
            "null_analysis":       raw.get("null_analysis", []),
            # Security assessment
            "db_users_roles":      raw.get("db_users_roles", []),
            "orphaned_users":      raw.get("orphaned_users", []),
            "db_owner_members":    raw.get("db_owner_members", []),
            "dynamic_sql_usage":   raw.get("dynamic_sql_usage", []),
            "clr_assemblies":      raw.get("clr_assemblies", []),
            "tde_status":          raw.get("tde_status", []),
            "column_encryption":   raw.get("column_encryption", []),
            "pii_indicators":      raw.get("pii_indicators", []),
            # Feature usage & risks
            "cross_db_references": raw.get("cross_db_references", []),
            "replication_status":  raw.get("replication_status", []),
            "service_broker":      raw.get("service_broker", []),
            "version_features":    raw.get("version_features", []),
            # New: Schema / Design checks
            "trustworthy_databases":  raw.get("trustworthy_databases", []),
            "deprecated_data_types":  raw.get("deprecated_data_types", []),
            "missing_primary_keys":   raw.get("missing_primary_keys", []),
            "heap_tables":            raw.get("heap_tables", []),
            "untrusted_constraints":  raw.get("untrusted_constraints", []),
            "sp_naming_violations":   raw.get("sp_naming_violations", []),
            "duplicate_indexes":      raw.get("duplicate_indexes", []),
            "database_options_audit": raw.get("database_options_audit", []),
            "object_permissions":     raw.get("object_permissions", []),
            # New: Performance checks (view_database_state)
            "missing_indexes":        raw.get("missing_indexes", []),
            "index_usage_stats":      raw.get("index_usage_stats", []),
            "fragmentation_report":   raw.get("fragmentation_report", []),
            "statistics_health":      raw.get("statistics_health", []),
            # New: Server-level checks (sysadmin)
            "sql_agent_jobs":             raw.get("sql_agent_jobs", []),
            "linked_servers":             raw.get("linked_servers", []),
            "backup_history":             raw.get("backup_history", []),
            "server_configurations":      raw.get("server_configurations", []),
            "weak_sql_logins":            raw.get("weak_sql_logins", []),
            "server_permissions":         raw.get("server_permissions", []),
            "deprecated_features_in_use": raw.get("deprecated_features_in_use", []),
        }

        logger.info("Assessment completed", extra=extra)
        return results, report_path

    finally:
        cursor.close()
        conn.close()
