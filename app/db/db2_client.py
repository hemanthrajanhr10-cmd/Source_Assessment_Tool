"""
IBM Db2 for LUW client — head-to-toe metadata extraction.

Connection modes
  Direct : hostname:port  (standard TCP)
  HCM    : hcm_local_host:hcm_local_port — local Azure Hybrid Connection Manager
            listener relays traffic through the Azure Service Bus relay to the
            on-prem Db2 server.  The ibm_db DSN is identical; only the
            host/port are replaced with the local listener co-ordinates.

SQL state codes handled explicitly
  08001  connection refused / network unreachable
  08004  server rejected the connection
  28000  invalid credentials
  42601  SQL syntax error
  42704  undefined object
  57016  REORG pending
  57011  insufficient storage
  01503  result column truncation (warning, non-fatal)
"""

from typing import Optional
from app.core.logging import get_logger

logger = get_logger(__name__)

_ibm_db = None
_ibm_db_dbi = None
_IBM_DB_AVAILABLE: bool | None = None  # None = not yet probed


def _ensure_ibm_db() -> bool:
    """Lazy-load ibm_db on first use so the IBM CLI Driver (~200 MB native lib)
    is not loaded at server startup — that would add 10-30 s to cold-start time
    and risk hitting the Azure App Service 230 s container-start timeout."""
    global _ibm_db, _ibm_db_dbi, _IBM_DB_AVAILABLE
    if _IBM_DB_AVAILABLE is None:
        try:
            import ibm_db as _mod
            import ibm_db_dbi as _dbi
            _ibm_db = _mod
            _ibm_db_dbi = _dbi
            _IBM_DB_AVAILABLE = True
        except ImportError:
            _IBM_DB_AVAILABLE = False
            logger.warning(
                "ibm_db not installed — IBM Db2 assessments will fail at runtime. "
                "Install with: pip install ibm_db"
            )
    return _IBM_DB_AVAILABLE

_SYS_SCHEMAS = (
    "NULLID", "SQLJ", "SYSCAT", "SYSIBM", "SYSIBMADM",
    "SYSPUBLIC", "SYSSTAT", "SYSTOOLS",
)
_SYS_LIKE = "SYS%"


# ── DSN builder ───────────────────────────────────────────────────────────────

def _build_conn_string(
    hostname: str,
    port: int,
    database: str,
    username: str,
    password: str,
    ssl_enabled: bool = False,
    ssl_server_certificate: Optional[str] = None,
    use_hcm: bool = False,
    hcm_local_host: str = "127.0.0.1",
    hcm_local_port: Optional[int] = None,
) -> str:
    """Build a Db2 ibm_db DSN.

    When use_hcm=True and hcm_local_port is set the DSN targets the local
    Azure HCM listener (which relays to the on-prem Db2) rather than the
    on-prem host directly.
    """
    if use_hcm and hcm_local_port:
        eff_host = hcm_local_host or "127.0.0.1"
        eff_port = hcm_local_port
    else:
        eff_host = hostname
        eff_port = port

    parts = [
        f"HOSTNAME={eff_host}",
        f"PORT={eff_port}",
        f"DATABASE={database}",
        f"UID={username}",
        f"PWD={password}",
        "PROTOCOL=TCPIP",
        "CONNECTTIMEOUT=30",
    ]
    if ssl_enabled:
        parts.append("SECURITY=SSL")
        if ssl_server_certificate:
            parts.append(f"SSLServerCertificate={ssl_server_certificate}")
    return ";".join(parts) + ";"


# ── Error classifier ──────────────────────────────────────────────────────────

def _classify_error(exc: Exception) -> str:
    msg = str(exc)
    state_map = {
        "08001": "Connection refused — verify host, port, and that Db2 is running.",
        "08004": "Server rejected the connection — check database name and user privileges.",
        "28000": "Invalid credentials — check username and password.",
        "42601": "SQL syntax error — driver or Db2 version mismatch.",
        "42704": "Object not found — table or column does not exist.",
        "57016": "Table not accessible — a REORG may be pending.",
        "57011": "Insufficient storage — tablespace or bufferpool issue.",
    }
    for sqlstate, human in state_map.items():
        if sqlstate in msg:
            return f"[{sqlstate}] {human}  (raw: {msg[:300]})"
    return msg


# ── Low-level helpers ─────────────────────────────────────────────────────────

def _fetch_all(conn, sql: str, params: Optional[tuple] = None) -> list[dict]:
    try:
        cur = conn.cursor()
        cur.execute(sql, params) if params else cur.execute(sql)
        cols = [d[0].lower() for d in (cur.description or [])]
        return [dict(zip(cols, row)) for row in cur.fetchall()]
    except Exception as exc:
        logger.warning("Db2 query failed: %s | SQL: %.250s", _classify_error(exc), sql[:250])
        return []


def _fetch_one(conn, sql: str, params: Optional[tuple] = None) -> Optional[dict]:
    rows = _fetch_all(conn, sql, params)
    return rows[0] if rows else None


def _count(conn, sql: str) -> int:
    row = _fetch_one(conn, sql)
    if not row:
        return 0
    return int(list(row.values())[0] or 0)


# ── Public API ────────────────────────────────────────────────────────────────

def test_connection(
    hostname: str, port: int, database: str,
    username: str, password: str,
    ssl_enabled: bool = False, ssl_server_certificate: Optional[str] = None,
    use_hcm: bool = False, hcm_local_host: str = "127.0.0.1",
    hcm_local_port: Optional[int] = None,
) -> dict:
    if not _ensure_ibm_db():
        raise RuntimeError("ibm_db Python driver is not installed. Run: pip install ibm_db")
    conn_str = _build_conn_string(
        hostname, port, database, username, password,
        ssl_enabled, ssl_server_certificate,
        use_hcm, hcm_local_host, hcm_local_port,
    )
    try:
        raw  = _ibm_db.connect(conn_str, "", "")
        conn = _ibm_db_dbi.Connection(raw)
        row  = _fetch_one(conn, "SELECT SERVICE_LEVEL, HOST_NAME FROM SYSIBMADM.ENV_INST_INFO")
        conn.close()
        effective_host = (hcm_local_host if use_hcm and hcm_local_port else hostname)
        return {
            "success":       True,
            "message":       f"Connected to IBM Db2 via {'HCM relay' if use_hcm and hcm_local_port else 'direct TCP'} at {effective_host}.",
            "service_level": (row or {}).get("service_level", "unknown"),
            "host_name":     (row or {}).get("host_name", hostname),
        }
    except Exception as exc:
        raise RuntimeError(_classify_error(exc)) from exc


def open_connection(
    hostname: str, port: int, database: str,
    username: str, password: str,
    ssl_enabled: bool = False, ssl_server_certificate: Optional[str] = None,
    use_hcm: bool = False, hcm_local_host: str = "127.0.0.1",
    hcm_local_port: Optional[int] = None,
):
    if not _ensure_ibm_db():
        raise RuntimeError("ibm_db not installed. Run: pip install ibm_db")
    conn_str = _build_conn_string(
        hostname, port, database, username, password,
        ssl_enabled, ssl_server_certificate,
        use_hcm, hcm_local_host, hcm_local_port,
    )
    try:
        raw = _ibm_db.connect(conn_str, "", "")
        return _ibm_db_dbi.Connection(raw)
    except Exception as exc:
        raise RuntimeError(_classify_error(exc)) from exc


# ═══════════════════════════════════════════════════════════════════════════════
# Metadata extraction — instance / database
# ═══════════════════════════════════════════════════════════════════════════════

def get_instance_info(conn) -> dict:
    row = _fetch_one(conn, """
        SELECT SERVICE_LEVEL, HOST_NAME, INST_NAME, NUM_PROCESSORS,
               PLATFORM, PTF, FIXPACK_NUM
        FROM   SYSIBMADM.ENV_INST_INFO
    """) or {}
    part_row = _fetch_one(conn, "SELECT COUNT(*) AS n FROM SYSIBMADM.DBPARTITIONNUM") or {}
    n = int(part_row.get("n") or 1)
    return {
        "db2_version":       row.get("service_level"),
        "instance_name":     row.get("inst_name"),
        "host_name":         row.get("host_name"),
        "service_level":     row.get("service_level"),
        "fix_pack_num":      row.get("fixpack_num"),
        "platform":          row.get("platform"),
        "bit_width":         "64-bit",
        "num_db_partitions": n,
        "is_dpf":            n > 1,
        "is_puresale":       False,
    }


def get_database_info(conn, database: str) -> dict:
    env = _fetch_one(conn, "SELECT DB_NAME FROM SYSIBMADM.ENV_DB_INFO") or {}
    blu = _count(conn, "SELECT COUNT(*) AS c FROM SYSCAT.TABLES WHERE TYPE='T' AND TABLEORG='C'")
    return {
        "db_name":            env.get("db_name", database).upper(),
        "territory":          None,
        "codeset":            None,
        "collation_sequence": None,
        "db_comment":         None,
        "created_at":         None,
        "catalog_node":       None,
        "blu_enabled":        blu > 0,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# Schema objects
# ═══════════════════════════════════════════════════════════════════════════════

def _sys_filter(alias: str = "") -> str:
    """Returns a SQL fragment excluding system schemas."""
    pfx = f"{alias}." if alias else ""
    quoted = ", ".join(f"'{s}'" for s in _SYS_SCHEMAS)
    return f"{pfx}SCHEMANAME NOT LIKE '{_SYS_LIKE}' AND {pfx}SCHEMANAME NOT IN ({quoted})"


def _tab_sys_filter(alias: str = "t") -> str:
    pfx = f"{alias}." if alias else ""
    quoted = ", ".join(f"'{s}'" for s in _SYS_SCHEMAS)
    return f"{pfx}TABSCHEMA NOT LIKE '{_SYS_LIKE}' AND {pfx}TABSCHEMA NOT IN ({quoted})"


def get_schemas(conn, schema_filter: Optional[str] = None) -> list[dict]:
    sf = f"AND s.SCHEMANAME = '{schema_filter.upper()}'" if schema_filter else ""
    return _fetch_all(conn, f"""
        SELECT s.SCHEMANAME, s.OWNER, s.CREATE_TIME,
               COUNT(DISTINCT t.TABNAME)  AS table_count,
               COUNT(DISTINCT v.VIEWNAME) AS view_count,
               COUNT(DISTINCT p.PROCNAME) AS proc_count
        FROM   SYSCAT.SCHEMATA s
        LEFT JOIN SYSCAT.TABLES     t ON t.TABSCHEMA = s.SCHEMANAME AND t.TYPE IN ('T','G','L')
        LEFT JOIN SYSCAT.VIEWS      v ON v.VIEWSCHEMA = s.SCHEMANAME
        LEFT JOIN SYSCAT.PROCEDURES p ON p.PROCSCHEMA = s.SCHEMANAME
        WHERE  {_sys_filter('s')} {sf}
        GROUP BY s.SCHEMANAME, s.OWNER, s.CREATE_TIME
        ORDER BY s.SCHEMANAME
    """)


def get_tables(conn, schema_filter: Optional[str] = None, limit: int = 5000) -> list[dict]:
    sf = f"AND t.TABSCHEMA = '{schema_filter.upper()}'" if schema_filter else ""
    rows = _fetch_all(conn, f"""
        SELECT t.TABSCHEMA AS schema_name, t.TABNAME AS table_name,
               t.TYPE AS table_type, t.TABLEORG AS org_type,
               t.CARD AS row_count, t.NPAGES AS data_pages,
               t.OVERFLOW AS overflow_pages, t.TBSPACE AS tablespace_name,
               t.CREATE_TIME AS create_time, t.ALTER_TIME AS alter_time,
               t.REMARKS
        FROM   SYSCAT.TABLES t
        WHERE  t.TYPE IN ('T','G','L','S','M')
          AND  {_tab_sys_filter('t')} {sf}
        ORDER BY t.TABSCHEMA, t.TABNAME
        FETCH FIRST {limit} ROWS ONLY
    """)
    for r in rows:
        r["is_column_org"] = (r.get("org_type") == "C")
    return rows


def get_columns(conn, schema_filter: Optional[str] = None, limit: int = 100000) -> list[dict]:
    sf = f"AND c.TABSCHEMA = '{schema_filter.upper()}'" if schema_filter else ""
    return _fetch_all(conn, f"""
        SELECT c.TABSCHEMA AS schema_name, c.TABNAME AS table_name,
               c.COLNAME AS column_name, c.TYPENAME AS column_type,
               c.LENGTH, c.SCALE, c.NULLS, c.DEFAULT, c.IDENTITY,
               c.COLNO AS column_id, c.COLCARD AS col_card, c.NUMNULLS AS num_nulls
        FROM   SYSCAT.COLUMNS c
        JOIN   SYSCAT.TABLES  t ON t.TABSCHEMA = c.TABSCHEMA AND t.TABNAME = c.TABNAME
        WHERE  t.TYPE IN ('T','G','L','S','M','V')
          AND  {_tab_sys_filter('c')} {sf}
        ORDER BY c.TABSCHEMA, c.TABNAME, c.COLNO
        FETCH FIRST {limit} ROWS ONLY
    """)


def get_indexes(conn, schema_filter: Optional[str] = None, limit: int = 10000) -> list[dict]:
    sf = f"AND i.TABSCHEMA = '{schema_filter.upper()}'" if schema_filter else ""
    return _fetch_all(conn, f"""
        SELECT i.TABSCHEMA AS schema_name, i.TABNAME AS table_name,
               i.INDNAME AS index_name, i.UNIQUERULE AS uniquerule,
               i.INDEXTYPE AS index_type, i.CLUSTERED AS clustered,
               i.NLEAF, i.NLEVELS,
               CAST(i.CLUSTERRATIO AS FLOAT) AS clusterratio,
               CAST(i.DENSITY      AS FLOAT) AS density,
               i.COLCOUNT AS num_key_cols,
               LISTAGG(k.COLNAME, ', ') WITHIN GROUP (ORDER BY k.COLSEQ) AS index_columns
        FROM   SYSCAT.INDEXES i
        JOIN   SYSCAT.INDEXCOLUSE k
               ON k.INDSCHEMA = i.INDSCHEMA AND k.INDNAME = i.INDNAME
        WHERE  {_tab_sys_filter('i')} {sf}
        GROUP BY i.TABSCHEMA, i.TABNAME, i.INDNAME, i.UNIQUERULE,
                 i.INDEXTYPE, i.CLUSTERED, i.NLEAF, i.NLEVELS,
                 i.CLUSTERRATIO, i.DENSITY, i.COLCOUNT
        ORDER BY i.TABSCHEMA, i.TABNAME, i.INDNAME
        FETCH FIRST {limit} ROWS ONLY
    """)


def get_views(conn, schema_filter: Optional[str] = None, limit: int = 5000) -> list[dict]:
    sf = f"AND v.VIEWSCHEMA = '{schema_filter.upper()}'" if schema_filter else ""
    return _fetch_all(conn, f"""
        SELECT v.VIEWSCHEMA AS schema_name, v.VIEWNAME AS view_name,
               v.READONLY, v.CREATE_TIME
        FROM   SYSCAT.VIEWS v
        WHERE  v.VIEWSCHEMA NOT LIKE '{_SYS_LIKE}'
          AND  v.VIEWSCHEMA NOT IN ({', '.join(f"'{s}'" for s in _SYS_SCHEMAS)}) {sf}
        ORDER BY v.VIEWSCHEMA, v.VIEWNAME
        FETCH FIRST {limit} ROWS ONLY
    """)


def get_procedures(conn, schema_filter: Optional[str] = None, limit: int = 2000) -> list[dict]:
    sf = f"AND p.PROCSCHEMA = '{schema_filter.upper()}'" if schema_filter else ""
    return _fetch_all(conn, f"""
        SELECT p.PROCSCHEMA AS schema_name, p.PROCNAME AS proc_name,
               p.LANGUAGE, p.PARM_COUNT, p.CREATE_TIME, p.ALTER_TIME,
               p.REMARKS
        FROM   SYSCAT.PROCEDURES p
        WHERE  p.PROCSCHEMA NOT LIKE '{_SYS_LIKE}'
          AND  p.PROCSCHEMA NOT IN ({', '.join(f"'{s}'" for s in _SYS_SCHEMAS)}) {sf}
        ORDER BY p.PROCSCHEMA, p.PROCNAME
        FETCH FIRST {limit} ROWS ONLY
    """)


def get_functions(conn, schema_filter: Optional[str] = None, limit: int = 2000) -> list[dict]:
    sf = f"AND f.FUNCSCHEMA = '{schema_filter.upper()}'" if schema_filter else ""
    return _fetch_all(conn, f"""
        SELECT f.FUNCSCHEMA AS schema_name, f.FUNCNAME AS func_name,
               f.FUNCTYPE AS func_type, f.LANGUAGE, f.CREATE_TIME,
               f.ORIGIN, f.REMARKS
        FROM   SYSCAT.FUNCTIONS f
        WHERE  f.FUNCSCHEMA NOT LIKE '{_SYS_LIKE}'
          AND  f.FUNCSCHEMA NOT IN ({', '.join(f"'{s}'" for s in _SYS_SCHEMAS)})
          AND  f.ORIGIN NOT IN ('B','S') {sf}
        ORDER BY f.FUNCSCHEMA, f.FUNCNAME
        FETCH FIRST {limit} ROWS ONLY
    """)


def get_triggers(conn, schema_filter: Optional[str] = None, limit: int = 2000) -> list[dict]:
    sf = f"AND t.TRIGSCHEMA = '{schema_filter.upper()}'" if schema_filter else ""
    return _fetch_all(conn, f"""
        SELECT t.TRIGSCHEMA AS schema_name, t.TRIGNAME AS trigger_name,
               t.TABSCHEMA AS table_schema, t.TABNAME AS table_name,
               t.TRIGTYPE AS trigger_type, t.TRIGEVENT AS trigger_time,
               t.ENABLED, t.CREATE_TIME
        FROM   SYSCAT.TRIGGERS t
        WHERE  t.TRIGSCHEMA NOT LIKE '{_SYS_LIKE}'
          AND  t.TRIGSCHEMA NOT IN ({', '.join(f"'{s}'" for s in _SYS_SCHEMAS)}) {sf}
        ORDER BY t.TRIGSCHEMA, t.TRIGNAME
        FETCH FIRST {limit} ROWS ONLY
    """)


def get_sequences(conn, schema_filter: Optional[str] = None, limit: int = 1000) -> list[dict]:
    sf = f"AND SEQSCHEMA = '{schema_filter.upper()}'" if schema_filter else ""
    return _fetch_all(conn, f"""
        SELECT SEQSCHEMA AS schema_name, SEQNAME AS seq_name,
               SEQTYPE AS seq_type, DATATYPENAME AS data_type,
               CAST(START AS VARCHAR(30)) AS start,
               CAST(INCREMENT AS VARCHAR(30)) AS increment,
               CAST(MINVALUE AS VARCHAR(30)) AS min_val,
               CAST(MAXVALUE AS VARCHAR(30)) AS max_val,
               CYCLE, CREATE_TIME
        FROM   SYSCAT.SEQUENCES
        WHERE  SEQSCHEMA NOT LIKE '{_SYS_LIKE}'
          AND  SEQSCHEMA NOT IN ({', '.join(f"'{s}'" for s in _SYS_SCHEMAS)})
          AND  SEQTYPE = 'S' {sf}
        ORDER BY SEQSCHEMA, SEQNAME
        FETCH FIRST {limit} ROWS ONLY
    """)


def get_user_defined_types(conn, schema_filter: Optional[str] = None, limit: int = 1000) -> list[dict]:
    sf = f"AND TYPESCHEMA = '{schema_filter.upper()}'" if schema_filter else ""
    return _fetch_all(conn, f"""
        SELECT TYPESCHEMA AS schema_name, TYPENAME AS type_name,
               METATYPE, SOURCENAME AS source_name, CREATE_TIME
        FROM   SYSCAT.DATATYPES
        WHERE  TYPESCHEMA NOT LIKE '{_SYS_LIKE}'
          AND  TYPESCHEMA NOT IN ({', '.join(f"'{s}'" for s in _SYS_SCHEMAS)})
          AND  METATYPE IN ('S','D') {sf}
        ORDER BY TYPESCHEMA, TYPENAME
        FETCH FIRST {limit} ROWS ONLY
    """)


def get_packages(conn, schema_filter: Optional[str] = None, limit: int = 2000) -> list[dict]:
    sf = f"AND PKGSCHEMA = '{schema_filter.upper()}'" if schema_filter else ""
    return _fetch_all(conn, f"""
        SELECT PKGSCHEMA AS pkg_schema, PKGNAME AS pkg_name,
               PKGVERSION AS pkg_version, LANGUAGE, OWNER, CREATE_TIME
        FROM   SYSCAT.PACKAGES
        WHERE  PKGSCHEMA NOT LIKE '{_SYS_LIKE}'
          AND  PKGSCHEMA NOT IN ({', '.join(f"'{s}'" for s in _SYS_SCHEMAS)}) {sf}
        ORDER BY PKGSCHEMA, PKGNAME
        FETCH FIRST {limit} ROWS ONLY
    """)


def get_event_monitors(conn) -> list[dict]:
    return _fetch_all(conn, """
        SELECT EVMONNAME, TARGET_TYPE, ENABLED, EVENT_MON_GROUP
        FROM   SYSCAT.EVENTMONITORS
        ORDER BY EVMONNAME
    """)


# ═══════════════════════════════════════════════════════════════════════════════
# Storage
# ═══════════════════════════════════════════════════════════════════════════════

def get_tablespaces(conn) -> list[dict]:
    rows = _fetch_all(conn, """
        SELECT t.TBSPACE, t.TBSPACETYPE AS tbspace_type, t.DATATAG AS data_tag,
               t.PAGESIZE AS page_size, t.EXTENTSIZE AS extent_size,
               t.PREFETCHSIZE AS prefetch_size,
               m.TOTAL_PAGES, m.USABLE_PAGES, m.USED_PAGES, m.FREE_PAGES,
               t.OVERHEAD, b.BPNAME AS bufferpool_name
        FROM   SYSCAT.TABLESPACES t
        LEFT JOIN TABLE(MON_GET_TABLESPACE('', -1)) AS m ON m.TBSP_NAME = t.TBSPACE
        LEFT JOIN SYSCAT.BUFFERPOOLS b ON b.BUFFERPOOLID = t.BUFFERPOOLID
        ORDER BY t.TBSPACE
    """)
    for r in rows:
        total = r.get("total_pages") or 0
        used  = r.get("used_pages")  or 0
        r["utilization_pct"] = round(used / total * 100, 1) if total > 0 else None
    return rows


def get_bufferpools(conn) -> list[dict]:
    """Returns bufferpool definitions merged with live hit-ratio from MON_GET_BUFFERPOOL."""
    bp_rows = _fetch_all(conn, """
        SELECT BPNAME, NPAGES, AUTOMATIC, PAGESIZE, NUMBLOCKPAGES
        FROM   SYSCAT.BUFFERPOOLS
        ORDER BY BPNAME
    """)
    mon_rows = _fetch_all(conn, """
        SELECT BP_NAME,
               POOL_DATA_L_READS  + POOL_INDEX_L_READS  +
               POOL_XDA_L_READS   + POOL_COL_L_READS    AS logical_reads,
               POOL_DATA_P_READS  + POOL_INDEX_P_READS  +
               POOL_XDA_P_READS   + POOL_COL_P_READS    AS physical_reads
        FROM   TABLE(MON_GET_BUFFERPOOL('', -1)) AS m
    """)
    mon_map = {r.get("bp_name", "").upper(): r for r in mon_rows}
    for r in bp_rows:
        mon = mon_map.get((r.get("bpname") or "").upper(), {})
        lr = int(mon.get("logical_reads")  or 0)
        pr = int(mon.get("physical_reads") or 0)
        r["logical_reads"]  = lr
        r["physical_reads"] = pr
        r["hit_ratio"] = round((lr - pr) / lr * 100, 2) if lr > 0 else None
    return bp_rows


def get_storage_groups(conn) -> list[dict]:
    return _fetch_all(conn, """
        SELECT SGNAME, OWNER, CREATE_TIME,
               (SELECT TBSPACE FROM SYSCAT.TABLESPACES WHERE SGID = g.SGID FETCH FIRST 1 ROWS ONLY) AS default_tbspace
        FROM   SYSCAT.STOGROUPS g
        ORDER BY SGNAME
    """)


# ═══════════════════════════════════════════════════════════════════════════════
# Configuration
# ═══════════════════════════════════════════════════════════════════════════════

def get_db_config(conn) -> list[dict]:
    return _fetch_all(conn, """
        SELECT NAME, VALUE, VALUE_FLAGS AS flags, DEFERRED_VALUE AS default_val
        FROM   SYSIBMADM.DBCFG
        ORDER BY NAME
    """)


def get_dbm_config(conn) -> list[dict]:
    return _fetch_all(conn, """
        SELECT NAME, VALUE, VALUE_FLAGS AS flags, DEFERRED_VALUE AS default_val
        FROM   SYSIBMADM.DBMCFG
        ORDER BY NAME
    """)


# ═══════════════════════════════════════════════════════════════════════════════
# Security
# ═══════════════════════════════════════════════════════════════════════════════

def get_security_summary(conn) -> dict:
    def cnt(sql: str) -> int:
        return _count(conn, sql)

    return {
        "total_users":           cnt("SELECT COUNT(*) AS c FROM SYSIBMADM.AUTHORIZATIONIDS"),
        "users_with_dbadm":      cnt("SELECT COUNT(*) AS c FROM SYSIBMADM.AUTHORIZATIONIDS WHERE DBADM     = 'Y'"),
        "users_with_secadm":     cnt("SELECT COUNT(*) AS c FROM SYSIBMADM.AUTHORIZATIONIDS WHERE SECADM    = 'Y'"),
        "users_with_dataaccess": cnt("SELECT COUNT(*) AS c FROM SYSIBMADM.AUTHORIZATIONIDS WHERE DATAACCESS= 'Y'"),
        "users_with_bindadd":    cnt("SELECT COUNT(*) AS c FROM SYSIBMADM.AUTHORIZATIONIDS WHERE BINDADD   = 'Y'"),
        "users_with_connect":    cnt("SELECT COUNT(*) AS c FROM SYSIBMADM.AUTHORIZATIONIDS WHERE CONNECT   = 'Y'"),
        "total_roles":           cnt("SELECT COUNT(*) AS c FROM SYSCAT.ROLES"),
        "role_member_count":     cnt("SELECT COUNT(*) AS c FROM SYSCAT.ROLEAUTH"),
        "rcac_row_permissions":  cnt("SELECT COUNT(*) AS c FROM SYSCAT.ROWPERMISSIONS"),
        "rcac_col_masks":        cnt("SELECT COUNT(*) AS c FROM SYSCAT.COLUMNMASKS"),
        "schemas_with_rcac":     cnt("SELECT COUNT(*) AS c FROM SYSCAT.ROWPERMISSIONS WHERE CONTROL = 'Y'"),
        "trusted_contexts_count":cnt("SELECT COUNT(*) AS c FROM SYSCAT.TRUSTED_CONTEXTS"),
        "audit_policies_count":  cnt("SELECT COUNT(*) AS c FROM SYSCAT.AUDITPOLICIES"),
        "table_grants_count":    cnt("SELECT COUNT(*) AS c FROM SYSCAT.TABAUTH"),
        "column_grants_count":   cnt("SELECT COUNT(*) AS c FROM SYSCAT.COLAUTH"),
        "schema_grants_count":   cnt("SELECT COUNT(*) AS c FROM SYSCAT.SCHEMAAUTH"),
        "package_grants_count":  cnt("SELECT COUNT(*) AS c FROM SYSCAT.PACKAGEAUTH"),
    }


# ═══════════════════════════════════════════════════════════════════════════════
# Performance
# ═══════════════════════════════════════════════════════════════════════════════

def get_performance_summary(conn) -> dict:
    row = _fetch_one(conn, """
        SELECT DB_STATUS, CATALOG_NODE_NAME,
               TOTAL_CONS, APPLS_CUR_CONS,
               LOCK_WAITS, LOCK_TIMEOUTS, LOCK_ESCALS, DEADLOCKS,
               SORT_OVERFLOWS, ROWS_READ, ROWS_WRITTEN,
               PKG_CACHE_NUM_OVERFLOWS,
               BUFF_POOL_HIT_RATIO,
               LOG_UTILIZATION_PERCENT,
               TOTAL_LOG_USED, TOTAL_LOG_AVAILABLE,
               DB_HEAP_TOP,
               DIRECT_READS, DIRECT_WRITES
        FROM   TABLE(MON_GET_DATABASE(-2)) AS t
        FETCH FIRST 1 ROWS ONLY
    """) or {}
    pkg_ov = int(row.get("pkg_cache_num_overflows") or 0)
    bp     = float(row.get("buff_pool_hit_ratio")    or 0)
    log_u  = float(row.get("log_utilization_percent") or 0)
    return {
        "db_status":           row.get("db_status"),
        "catalog_node_name":   row.get("catalog_node_name"),
        "total_cons":          row.get("total_cons"),
        "appls_cur_cons":      row.get("appls_cur_cons"),
        "lock_waits":          row.get("lock_waits"),
        "lock_timeouts":       row.get("lock_timeouts"),
        "lock_escals":         row.get("lock_escals"),
        "deadlocks":           row.get("deadlocks"),
        "sort_overflows":      row.get("sort_overflows"),
        "rows_read":           row.get("rows_read"),
        "rows_written":        row.get("rows_written"),
        "pkg_cache_hit_ratio": None if pkg_ov == 0 else max(0.0, 100.0 - pkg_ov),
        "bp_hit_ratio":        bp,
        "log_utilization_pct": log_u,
        "total_log_used":      row.get("total_log_used"),
        "total_log_available": row.get("total_log_available"),
        "db_heap_top":         row.get("db_heap_top"),
        "direct_reads":        row.get("direct_reads"),
        "direct_writes":       row.get("direct_writes"),
    }


def get_active_connections(conn, limit: int = 100) -> list[dict]:
    return _fetch_all(conn, f"""
        SELECT AGENT_ID, APPL_NAME, APPL_STATUS, AUTHID,
               CLIENT_PLATFORM, WORKLOAD_NAME, NUM_LOCKS_HELD,
               STATUS_CHANGE_TIME
        FROM   SYSIBMADM.APPLICATIONS
        ORDER BY NUM_LOCKS_HELD DESC, AGENT_ID
        FETCH FIRST {limit} ROWS ONLY
    """)


def get_top_sql(conn, limit: int = 25) -> list[dict]:
    rows = _fetch_all(conn, f"""
        SELECT STMT_TEXT,
               NUM_EXECUTIONS            AS exec_count,
               TOTAL_ACT_TIME            AS total_exec_time,
               CASE WHEN NUM_EXECUTIONS > 0
                    THEN TOTAL_ACT_TIME / NUM_EXECUTIONS
                    ELSE 0 END           AS avg_exec_time,
               ROWS_READ, ROWS_RETURNED,
               TOTAL_SORTS, SORT_OVERFLOWS
        FROM   TABLE(MON_GET_PKG_CACHE_STMT(NULL, NULL, NULL, -2)) AS t
        WHERE  STMT_TEXT IS NOT NULL
          AND  NUM_EXECUTIONS > 0
        ORDER BY TOTAL_ACT_TIME DESC
        FETCH FIRST {limit} ROWS ONLY
    """)
    # Truncate very long SQL text for display
    for r in rows:
        txt = r.get("stmt_text") or ""
        r["stmt_text"] = txt[:500] if len(txt) > 500 else txt
    return rows


# ═══════════════════════════════════════════════════════════════════════════════
# WLM (Workload Management)
# ═══════════════════════════════════════════════════════════════════════════════

def get_wlm_service_classes(conn) -> list[dict]:
    return _fetch_all(conn, """
        SELECT SERVICECLASSNAME, PARENTSERVICECLASSNAME, ENABLED, CREATE_TIME
        FROM   SYSCAT.SERVICECLASSES
        ORDER BY PARENTSERVICECLASSNAME NULLS FIRST, SERVICECLASSNAME
    """)


def get_wlm_workloads(conn) -> list[dict]:
    return _fetch_all(conn, """
        SELECT WORKLOADNAME, ENABLED, CREATE_TIME
        FROM   SYSCAT.WORKLOADS
        ORDER BY WORKLOADNAME
    """)


# ═══════════════════════════════════════════════════════════════════════════════
# Federation
# ═══════════════════════════════════════════════════════════════════════════════

def get_federation_wrappers(conn) -> list[dict]:
    return _fetch_all(conn, """
        SELECT WRAPNAME, LIBRARY, CREATE_TIME
        FROM   SYSCAT.WRAPPERS
        ORDER BY WRAPNAME
    """)


def get_federation_servers(conn) -> list[dict]:
    rows = _fetch_all(conn, """
        SELECT s.SERVERNAME, s.SERVERTYPE, s.WRAPNAME, s.CREATE_TIME,
               COUNT(n.TABNAME) AS nickname_count
        FROM   SYSCAT.SERVERS   s
        LEFT JOIN SYSCAT.NICKNAMES n ON n.REMOTE_SERVER = s.SERVERNAME
        GROUP BY s.SERVERNAME, s.SERVERTYPE, s.WRAPNAME, s.CREATE_TIME
        ORDER BY s.SERVERNAME
    """)
    return rows


# ═══════════════════════════════════════════════════════════════════════════════
# Db2-specific features — feature counts
# ═══════════════════════════════════════════════════════════════════════════════

def get_db2_specific_features(conn) -> dict:
    def cnt(sql: str) -> int:
        return _count(conn, sql)

    wlm_sc   = cnt("SELECT COUNT(*) AS c FROM SYSCAT.SERVICECLASSES")
    wlm_wl   = cnt("SELECT COUNT(*) AS c FROM SYSCAT.WORKLOADS")
    wlm_th   = cnt("SELECT COUNT(*) AS c FROM SYSCAT.THRESHOLDS")
    wrappers = cnt("SELECT COUNT(*) AS c FROM SYSCAT.WRAPPERS")
    servers  = cnt("SELECT COUNT(*) AS c FROM SYSCAT.SERVERS")
    nicks    = cnt("SELECT COUNT(*) AS c FROM SYSCAT.NICKNAMES")
    xsr      = cnt("SELECT COUNT(*) AS c FROM SYSCAT.XSROBJECTS")
    sg       = cnt("SELECT COUNT(*) AS c FROM SYSCAT.STOGROUPS")

    return {
        "column_org_tables":    cnt("SELECT COUNT(*) AS c FROM SYSCAT.TABLES WHERE TYPE='T' AND TABLEORG='C'"),
        "row_org_tables":       cnt("SELECT COUNT(*) AS c FROM SYSCAT.TABLES WHERE TYPE='T' AND TABLEORG='R'"),
        "rcac_row_permissions": cnt("SELECT COUNT(*) AS c FROM SYSCAT.ROWPERMISSIONS"),
        "rcac_col_masks":       cnt("SELECT COUNT(*) AS c FROM SYSCAT.COLUMNMASKS"),
        "federation_enabled":   wrappers > 0,
        "wrapper_count":        wrappers,
        "server_count":         servers,
        "nickname_count":       nicks,
        "wlm_service_classes":  wlm_sc,
        "wlm_workloads":        wlm_wl,
        "wlm_thresholds":       wlm_th,
        "sequence_count":       cnt("SELECT COUNT(*) AS c FROM SYSCAT.SEQUENCES WHERE SEQTYPE='S' AND SEQSCHEMA NOT LIKE 'SYS%'"),
        "alias_count":          cnt("SELECT COUNT(*) AS c FROM SYSCAT.TABLES WHERE TYPE='A'"),
        "mqt_count":            cnt("SELECT COUNT(*) AS c FROM SYSCAT.TABLES WHERE TYPE='S'"),
        "typed_table_count":    cnt("SELECT COUNT(*) AS c FROM SYSCAT.TABLES WHERE TYPE='H'"),
        "udt_count":            cnt("SELECT COUNT(*) AS c FROM SYSCAT.DATATYPES WHERE METATYPE IN ('S','D') AND TYPESCHEMA NOT LIKE 'SYS%'"),
        "event_monitor_count":  cnt("SELECT COUNT(*) AS c FROM SYSCAT.EVENTMONITORS"),
        "package_count":        cnt("SELECT COUNT(*) AS c FROM SYSCAT.PACKAGES WHERE PKGSCHEMA NOT LIKE 'SYS%'"),
        "xsr_count":            xsr,
        "storage_group_count":  sg,
        "declared_temp_table_count": 0,
    }
