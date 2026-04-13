"""
Azure SQL persistence layer — relational edition.
Each assessment section is stored in its own typed table.
All callers keep the same function signatures as before.
"""

from datetime import datetime
from pathlib import Path
from typing import Any, Optional

import mssql_python

from app.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


# ── Connection factory ────────────────────────────────────────────────────────

def _get_conn():
    conn_str = (
        f"SERVER=tcp:{settings.azure_store_server},{settings.azure_store_port};"
        f"DATABASE={settings.azure_store_database};"
        f"UID={settings.azure_store_username};"
        f"PWD={settings.azure_store_password.get_secret_value()};"
        "TrustServerCertificate=no;"
        "Encrypt=yes;"
    )
    return mssql_python.connect(conn_str)


# ── Schema init ───────────────────────────────────────────────────────────────

def init_schema() -> None:
    """Create all tables if they do not exist. Safe to call on every startup."""
    ddl = (Path(__file__).parent / "schema.sql").read_text(encoding="utf-8")
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(ddl)
        conn.commit()
        logger.info("Azure SQL schema initialised (tables created if missing)")
    except Exception as exc:
        logger.error("Schema init failed: %s", exc)
        raise
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
}


# ── Job CRUD ──────────────────────────────────────────────────────────────────

def create_job(
    job_id: str,
    label: Optional[str],
    created_at: datetime,
    session_id: Optional[str] = None,
    server_name: Optional[str] = None,
    database_name: Optional[str] = None,
) -> None:
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO dbo.jobs
               (job_id, status, label, created_at, session_id, server_name, database_name)
               VALUES (?, 'pending', ?, ?, ?, ?, ?)""",
            (job_id, label, created_at, session_id, server_name, database_name),
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
                      error, progress_message, report_path, session_id, server_name, database_name
               FROM dbo.jobs WHERE job_id = ?""",
            (job_id,),
        )
        row = cur.fetchone()
        if row is None:
            return None
        return dict(zip([d[0] for d in cur.description], row))
    finally:
        conn.close()


def list_jobs() -> list[dict[str, Any]]:
    conn = _get_conn()
    try:
        cur = conn.cursor()
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

def save_overview(job_id: str, overview: Optional[dict[str, Any]]) -> None:
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
                    total_size_mb      = ?
                WHERE job_id = ?
            ELSE
                INSERT INTO dbo.assessment_overview
                    (job_id, database_name, connected_user, sql_server_version,
                     schema_count, table_count, view_count,
                     stored_proc_count, function_count, total_size_mb)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                job_id,
                overview.get("database_name"), overview.get("connected_user"),
                overview.get("sql_server_version"), overview.get("schema_count"),
                overview.get("table_count"), overview.get("view_count"),
                overview.get("stored_proc_count"), overview.get("function_count"),
                overview.get("total_size_mb"), job_id,
                job_id,
                overview.get("database_name"), overview.get("connected_user"),
                overview.get("sql_server_version"), overview.get("schema_count"),
                overview.get("table_count"), overview.get("view_count"),
                overview.get("stored_proc_count"), overview.get("function_count"),
                overview.get("total_size_mb"),
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
    return {"job_id": job_id, "overview": overview, **sections}


# ── Gateway CRUD ──────────────────────────────────────────────────────────────

def register_gateway(gateway_key: str, name: str) -> None:
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO dbo.gateways (gateway_key, name, status) VALUES (?, ?, 'offline')",
            (gateway_key, name),
        )
        conn.commit()
    finally:
        conn.close()


def get_gateway(gateway_key: str) -> Optional[dict[str, Any]]:
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT gateway_key, name, status, last_seen_at, created_at "
            "FROM dbo.gateways WHERE gateway_key = ?",
            (gateway_key,),
        )
        row = cur.fetchone()
        if row is None:
            return None
        cols = [d[0] for d in cur.description]
        result = dict(zip(cols, row))
        # Serialize datetimes
        for k, v in result.items():
            if isinstance(v, datetime):
                result[k] = v.isoformat()
        return result
    finally:
        conn.close()


def list_gateways() -> list[dict[str, Any]]:
    conn = _get_conn()
    try:
        cur = conn.cursor()
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
                       gateway_key: str, gateway_payload: str) -> None:
    """Create a job that is destined for a gateway agent."""
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO dbo.jobs (job_id, status, label, created_at, gateway_key, gateway_payload)
            VALUES (?, 'pending', ?, ?, ?, ?)
            """,
            (job_id, label, created_at, gateway_key, gateway_payload),
        )
        conn.commit()
    finally:
        conn.close()


# ── Session CRUD ───────────────────────────────────────────────────────────────

def create_session(session_id: str, label: Optional[str], created_at: datetime) -> None:
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO dbo.sessions (session_id, label, status, created_at) VALUES (?, ?, 'pending', ?)",
            (session_id, label, created_at),
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
                      created_at, completed_at
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


def list_sessions() -> list[dict[str, Any]]:
    conn = _get_conn()
    try:
        cur = conn.cursor()
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
