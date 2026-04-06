"""
Assessment service: orchestrates the full SQL Server metadata collection workflow.
"""

from datetime import datetime, timezone
from typing import Any

from app.core import job_store
from app.core.logging import get_logger
from app.db import connector, queries
from app.models.requests import AssessmentRequest
from app.services import report_service

logger = get_logger(__name__)

# Ordered list of (result_key, sql_constant, display_name)
_QUERY_STEPS: list[tuple[str, str, str]] = [
    # ── Core metadata ──────────────────────────────────────────────────────
    ("overview",            queries.OVERVIEW,            "Database overview"),
    ("schemas",             queries.SCHEMAS,             "Schemas"),
    ("tables",              queries.TABLES,              "Tables"),
    ("columns",             queries.COLUMNS,             "Columns"),
    ("views",               queries.VIEWS,               "Views"),
    ("stored_procedures",   queries.STORED_PROCEDURES,   "Stored procedures"),
    ("functions",           queries.FUNCTIONS,           "Functions"),
    ("indexes",             queries.INDEXES,             "Indexes"),
    ("relationships",       queries.RELATIONSHIPS,       "Relationships"),
    ("index_coverage",      queries.INDEX_COVERAGE,      "Index coverage"),
    ("insertion_frequency", queries.INSERTION_FREQUENCY, "Insertion frequency"),
    # ── Security assessment ────────────────────────────────────────────────
    ("db_users_roles",      queries.DB_USERS_ROLES,      "Database users & roles"),
    ("orphaned_users",      queries.ORPHANED_USERS,      "Orphaned users"),
    ("db_owner_members",    queries.DB_OWNER_MEMBERS,    "Excessive permissions (db_owner)"),
    ("dynamic_sql_usage",   queries.DYNAMIC_SQL_USAGE,   "Dynamic SQL usage"),
    ("clr_assemblies",      queries.CLR_ASSEMBLIES,      "CLR assemblies"),
    ("tde_status",          queries.TDE_STATUS,          "TDE encryption status"),
    ("column_encryption",   queries.COLUMN_ENCRYPTION,   "Column-level encryption"),
    ("pii_indicators",      queries.PII_INDICATORS,      "PII / sensitive data scan"),
    # ── Feature usage & risks ──────────────────────────────────────────────
    ("sql_agent_jobs",      queries.SQL_AGENT_JOBS,      "SQL Agent jobs"),
    ("linked_servers",      queries.LINKED_SERVERS,      "Linked servers"),
    ("cross_db_references", queries.CROSS_DB_REFERENCES, "Cross-database references"),
    ("replication_status",  queries.REPLICATION_STATUS,  "Replication status"),
    ("service_broker",      queries.SERVICE_BROKER,      "Service Broker"),
    ("version_features",    queries.VERSION_FEATURES,    "Version & feature risks"),
]


def _cursor_rows_to_dicts(cursor) -> list[dict[str, Any]]:
    """Convert cursor results to a list of dicts keyed by column name."""
    if cursor.description is None:
        return []
    col_names = [desc[0] for desc in cursor.description]
    rows = cursor.fetchall()
    result = []
    for row in rows:
        record: dict[str, Any] = {}
        for name, value in zip(col_names, row):
            if isinstance(value, datetime):
                record[name] = value.isoformat()
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
    cursor, table_rows: list[dict[str, Any]], sample_limit: int
) -> list[dict[str, Any]]:
    """
    For up to sample_limit tables, compute null/blank percentage per nullable column.
    """
    results: list[dict[str, Any]] = []
    sampled = 0

    for tbl in table_rows:
        if sampled >= sample_limit:
            break

        schema = tbl.get("schema_name", "")
        table = tbl.get("table_name", "")
        full_name = f"[{schema}].[{table}]"

        col_sql = queries.NULL_ANALYSIS_COLUMNS.format(full_name=full_name)
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

        query = f"SELECT COUNT(*) AS total_rows, {', '.join(exprs)} FROM {full_name}"
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
    Connect to SQL Server, run all metadata queries, build the Excel report,
    and return (results_dict, report_file_path).
    Raises on any fatal error; the caller updates job status accordingly.
    """
    extra = {"job_id": job_id}
    logger.info("Connecting to SQL Server", extra=extra)

    conn = connector.get_connection(request.connection)
    cursor = conn.cursor()

    try:
        raw: dict[str, Any] = {}

        for key, sql, display_name in _QUERY_STEPS:
            logger.info("Running query: %s", display_name, extra=extra)
            job_store.update_job(job_id, progress_message=f"Collecting {display_name}…")
            raw[key] = _safe_fetch(cursor, sql)

        if request.include_null_analysis:
            logger.info("Running null analysis (limit=%d)", request.null_analysis_sample_limit, extra=extra)
            job_store.update_job(job_id, progress_message="Running null/blank analysis…")
            raw["null_analysis"] = _run_null_analysis(
                cursor, raw.get("tables", []), request.null_analysis_sample_limit
            )
        else:
            raw["null_analysis"] = []

        job_store.update_job(job_id, progress_message="Building Excel report…")
        report_path = report_service.build_report(job_id, raw)

        results: dict[str, Any] = {
            "job_id": job_id,
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
            "sql_agent_jobs":      raw.get("sql_agent_jobs", []),
            "linked_servers":      raw.get("linked_servers", []),
            "cross_db_references": raw.get("cross_db_references", []),
            "replication_status":  raw.get("replication_status", []),
            "service_broker":      raw.get("service_broker", []),
            "version_features":    raw.get("version_features", []),
        }

        logger.info("Assessment completed", extra=extra)
        return results, report_path

    finally:
        cursor.close()
        conn.close()
