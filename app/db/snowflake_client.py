"""
Snowflake client — multi-method authentication + assessment queries.

Supported auth methods (auth_method field in credentials dict):
  username_password        — snowflake.connector default (user + password)
  browser_sso              — authenticator='externalbrowser'
  browser_sso_cached       — externalbrowser + client_store_temporary_credential=True
  mfa_push                 — authenticator='username_password_mfa' (Duo push)
  mfa_totp                 — username_password_mfa + passcode=<6-digit>
  key_pair                 — authenticator='SNOWFLAKE_JWT', RSA private key file
  oauth_token              — authenticator='oauth', pre-fetched token
  oauth_auth_code          — authenticator='OAUTH_AUTHORIZATION_CODE' (browser PKCE)
  oauth_client_credentials — authenticator='OAUTH_CLIENT_CREDENTIALS' (headless)
  workload_identity        — authenticator='WORKLOAD_IDENTITY' (Azure/AWS/GCP)
  toml_profile             — connection_name= from ~/.snowflake/connections.toml

All methods run in a background thread; callers poll get_auth_status().
Assessment queries use SHOW commands, INFORMATION_SCHEMA, and ACCOUNT_USAGE.
"""

import logging
import threading
from typing import Optional

logger = logging.getLogger(__name__)

# Methods that open a system browser (useful for UI messaging)
BROWSER_METHODS = {"browser_sso", "browser_sso_cached", "oauth_auth_code"}


def _run_query(conn, sql: str) -> list[dict]:
    """Execute SQL and return list of row dicts (lowercased column names)."""
    try:
        cursor = conn.cursor()
        cursor.execute(sql)
        if not cursor.description:
            cursor.close()
            return []
        cols = [d[0].lower() for d in cursor.description]
        rows = cursor.fetchall()
        cursor.close()
        return [dict(zip(cols, row)) for row in rows]
    except Exception as exc:
        logger.warning("Query failed [%.80s]: %s", sql.strip(), exc)
        return []


def _scalar(conn, sql: str):
    rows = _run_query(conn, sql)
    if rows:
        vals = list(rows[0].values())
        return vals[0] if vals else None
    return None


# ── Connection kwargs builder ─────────────────────────────────────────────────

def _build_connection_kwargs(creds: dict) -> dict:
    """
    Translate a credentials dict into snowflake.connector.connect() kwargs.
    For toml_profile the dict only contains connection_name.
    """
    method = creds.get("auth_method", "browser_sso")

    # TOML profile — all credentials live in the .toml file
    if method == "toml_profile":
        return {"connection_name": creds.get("toml_connection_name") or "myconnection"}

    # Build common kwargs present in most methods
    kwargs: dict = {}
    if creds.get("account"):
        kwargs["account"] = creds["account"]
    if creds.get("username"):
        kwargs["user"] = creds["username"]
    if creds.get("role"):
        kwargs["role"] = creds["role"]
    if creds.get("warehouse"):
        kwargs["warehouse"] = creds["warehouse"]
    if creds.get("database"):
        kwargs["database"] = creds["database"]

    # Method-specific kwargs
    if method == "username_password":
        kwargs["password"] = creds.get("password", "")

    elif method == "browser_sso":
        kwargs["authenticator"] = "externalbrowser"

    elif method == "browser_sso_cached":
        kwargs["authenticator"] = "externalbrowser"
        kwargs["client_store_temporary_credential"] = True

    elif method == "mfa_push":
        kwargs["password"] = creds.get("password", "")
        kwargs["authenticator"] = "username_password_mfa"

    elif method == "mfa_totp":
        kwargs["password"] = creds.get("password", "")
        kwargs["authenticator"] = "username_password_mfa"
        if creds.get("passcode"):
            kwargs["passcode"] = creds["passcode"]

    elif method == "key_pair":
        kwargs["authenticator"] = "SNOWFLAKE_JWT"
        kwargs["private_key_file"] = creds.get("private_key_path", "")
        pp = creds.get("private_key_passphrase")
        if pp:
            kwargs["private_key_file_pwd"] = pp

    elif method == "oauth_token":
        kwargs["authenticator"] = "oauth"
        kwargs["token"] = creds.get("oauth_token", "")

    elif method == "oauth_auth_code":
        kwargs["authenticator"] = "OAUTH_AUTHORIZATION_CODE"
        kwargs["oauth_client_id"] = creds.get("oauth_client_id", "")
        kwargs["oauth_client_secret"] = creds.get("oauth_client_secret", "")
        kwargs["oauth_authorization_url"] = creds.get("oauth_auth_url", "")
        kwargs["oauth_token_request_url"] = creds.get("oauth_token_url", "")
        if creds.get("oauth_scope"):
            kwargs["oauth_scope"] = creds["oauth_scope"]

    elif method == "oauth_client_credentials":
        kwargs["authenticator"] = "OAUTH_CLIENT_CREDENTIALS"
        kwargs["oauth_client_id"] = creds.get("oauth_client_id", "")
        kwargs["oauth_client_secret"] = creds.get("oauth_client_secret", "")
        kwargs["oauth_token_request_url"] = creds.get("oauth_token_url", "")
        if creds.get("oauth_scope"):
            kwargs["oauth_scope"] = creds["oauth_scope"]

    elif method == "workload_identity":
        kwargs["authenticator"] = "WORKLOAD_IDENTITY"
        provider = creds.get("workload_identity_provider") or "AZURE"
        kwargs["workload_identity_provider"] = provider.upper()

    return kwargs


# ── In-memory auth session store ─────────────────────────────────────────────

_auth_sessions: dict[str, dict] = {}
_auth_lock = threading.Lock()


def _run_auth(auth_id: str, credentials: dict) -> None:
    """
    Background thread: connect to Snowflake using the specified auth method,
    verify identity, and update the session record on success or failure.
    """
    method = credentials.get("auth_method", "browser_sso")
    try:
        import snowflake.connector  # type: ignore

        logger.info(
            "[sf-auth:%s] Starting auth method=%s account=%s",
            auth_id[:8], method, credentials.get("account", ""),
        )

        kwargs = _build_connection_kwargs(credentials)
        conn = snowflake.connector.connect(**kwargs)

        # Verify identity after connection
        cur = conn.cursor()
        cur.execute(
            "SELECT CURRENT_USER(), CURRENT_ACCOUNT(), CURRENT_ROLE(), CURRENT_VERSION()"
        )
        row = cur.fetchone()
        cur.close()

        with _auth_lock:
            _auth_sessions[auth_id].update({
                "status": "authenticated",
                "conn": conn,
                "current_user": row[0] if row else credentials.get("username"),
                "current_account": row[1] if row else credentials.get("account"),
                "current_role": row[2] if row else credentials.get("role"),
                "snowflake_version": row[3] if row else None,
            })
        logger.info(
            "[sf-auth:%s] Authenticated as %s", auth_id[:8], row[0] if row else "unknown"
        )

    except Exception as exc:
        logger.exception("[sf-auth:%s] Auth failed: %s", auth_id[:8], exc)
        with _auth_lock:
            if auth_id in _auth_sessions:
                _auth_sessions[auth_id].update(
                    {"status": "failed", "error": str(exc), "conn": None}
                )


def init_auth_session(auth_id: str, credentials: dict) -> None:
    """
    Register a pending auth session and start the connection attempt in a
    background thread.  Callers poll get_auth_status() until authenticated/failed.
    """
    method = credentials.get("auth_method", "browser_sso")
    with _auth_lock:
        _auth_sessions[auth_id] = {
            "auth_id": auth_id,
            "auth_method": method,
            "account": credentials.get("account", ""),
            "username": credentials.get("username", ""),
            "status": "pending",
            "conn": None,
            "error": None,
            "current_user": None,
            "current_account": None,
            "current_role": None,
            "snowflake_version": None,
        }
    threading.Thread(
        target=_run_auth,
        args=(auth_id, credentials),
        daemon=True,
        name=f"sf-auth-{auth_id[:8]}",
    ).start()


def get_auth_status(auth_id: str) -> Optional[dict]:
    with _auth_lock:
        return _auth_sessions.get(auth_id)


def get_auth_connection(auth_id: str):
    """Return live connection for an authenticated session, or None."""
    with _auth_lock:
        session = _auth_sessions.get(auth_id)
    if session and session.get("status") == "authenticated":
        return session.get("conn")
    return None


def revoke_auth_session(auth_id: str) -> bool:
    """Close connection and remove the session. Returns True if found."""
    with _auth_lock:
        session = _auth_sessions.pop(auth_id, None)
    if session:
        conn = session.get("conn")
        if conn:
            try:
                conn.close()
            except Exception:
                pass
        return True
    return False


def list_auth_sessions() -> list[dict]:
    """Return all sessions (without connection objects) for UI display."""
    with _auth_lock:
        return [{k: v for k, v in s.items() if k != "conn"} for s in _auth_sessions.values()]


# ── Assessment queries ────────────────────────────────────────────────────────

def get_account_info(conn) -> dict:
    info: dict = {}
    rows = _run_query(conn, "SELECT CURRENT_USER(), CURRENT_ACCOUNT(), CURRENT_ROLE(), CURRENT_WAREHOUSE(), CURRENT_VERSION()")
    if rows:
        vals = list(rows[0].values())
        info = {
            "account_locator": vals[1],
            "current_user": vals[0],
            "current_role": vals[2],
            "current_warehouse": vals[3],
            "snowflake_version": vals[4],
        }

    for sql, keys in [
        ("SELECT CURRENT_ORGANIZATION_NAME(), CURRENT_ACCOUNT_NAME()", ["organization_name", "account_name"]),
        ("SELECT CURRENT_REGION()", ["region"]),
    ]:
        rows2 = _run_query(conn, sql)
        if rows2:
            for k, v in zip(keys, list(rows2[0].values())):
                info[k] = v

    return info


def list_warehouses(conn) -> list[dict]:
    rows = _run_query(conn, "SHOW WAREHOUSES")
    result = []
    for r in rows:
        result.append({
            "name": r.get("name", ""),
            "state": r.get("state", ""),
            "wh_type": r.get("type", "STANDARD"),
            "size": r.get("size", ""),
            "auto_suspend": int(r.get("auto_suspend") or 600),
            "auto_resume": str(r.get("auto_resume", "")).strip().upper() in ("TRUE", "Y", "YES"),
            "cluster_count": r.get("cluster_count"),
            "max_cluster_count": r.get("max_cluster_count"),
            "running": int(r.get("running") or 0),
            "queued": int(r.get("queued") or 0),
            "is_default": str(r.get("is_default", "")).strip().upper() in ("Y", "YES", "TRUE"),
            "owner": r.get("owner", ""),
            "comment": r.get("comment", ""),
            "scaling_policy": r.get("scaling_policy", ""),
        })
    return result


def list_databases(conn) -> list[dict]:
    rows = _run_query(conn, "SHOW DATABASES")
    result = []
    for r in rows:
        name = r.get("name", "")
        if name.upper() in ("SNOWFLAKE", "SNOWFLAKE_SAMPLE_DATA"):
            continue
        result.append({
            "name": name,
            "origin": r.get("origin", ""),
            "owner": r.get("owner", ""),
            "comment": r.get("comment", ""),
            "retention_time": int(r.get("retention_time") or 1),
            "created_on": str(r.get("created_on") or ""),
            "is_default": str(r.get("is_default", "")).strip().upper() in ("Y", "YES", "TRUE"),
            "is_transient": "TRANSIENT" in str(r.get("options", "")).upper(),
        })
    return result


def list_schemas(conn, databases: list[str]) -> list[dict]:
    result = []
    for db in databases:
        try:
            rows = _run_query(conn, f'SHOW SCHEMAS IN DATABASE "{db}"')
            for r in rows:
                name = r.get("name", "")
                if name.upper() == "INFORMATION_SCHEMA":
                    continue
                result.append({
                    "database_name": db,
                    "name": name,
                    "owner": r.get("owner", ""),
                    "retention_time": int(r.get("retention_time") or 1),
                    "comment": r.get("comment", ""),
                    "is_managed_access": "MANAGED ACCESS" in str(r.get("options", "")).upper(),
                    "is_transient": "TRANSIENT" in str(r.get("options", "")).upper(),
                })
        except Exception as exc:
            logger.warning("list_schemas db=%s: %s", db, exc)
    return result


def list_tables_in_db(conn, db_name: str) -> list[dict]:
    sql = (
        f'SELECT TABLE_CATALOG, TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE,'
        f' ROW_COUNT, BYTES, CLUSTERING_KEY, IS_TRANSIENT, RETENTION_TIME, CREATED, LAST_ALTERED'
        f' FROM "{db_name}".INFORMATION_SCHEMA.TABLES'
        f" WHERE TABLE_SCHEMA != 'INFORMATION_SCHEMA' LIMIT 2000"
    )
    rows = _run_query(conn, sql)
    result = []
    for r in rows:
        result.append({
            "database_name": str(r.get("table_catalog") or db_name),
            "schema_name": str(r.get("table_schema") or ""),
            "name": str(r.get("table_name") or ""),
            "table_type": str(r.get("table_type") or ""),
            "row_count": r.get("row_count"),
            "bytes": r.get("bytes"),
            "clustering_key": r.get("clustering_key"),
            "is_transient": str(r.get("is_transient") or "").upper() == "YES",
            "retention_time": int(r.get("retention_time") or 1),
            "created": str(r.get("created") or ""),
            "last_altered": str(r.get("last_altered") or ""),
        })
    return result


def count_objects(conn, show_sql: str) -> int:
    rows = _run_query(conn, show_sql)
    return len(rows)


def get_shares(conn) -> dict:
    outbound = inbound = 0
    for r in _run_query(conn, "SHOW SHARES"):
        kind = str(r.get("kind") or "").upper()
        if kind == "OUTBOUND":
            outbound += 1
        elif kind == "INBOUND":
            inbound += 1
    return {"outbound": outbound, "inbound": inbound}


def list_users(conn) -> list[dict]:
    result = []
    for r in _run_query(conn, "SHOW USERS"):
        result.append({
            "name": r.get("name", ""),
            "login_name": r.get("login_name", ""),
            "email": r.get("email", ""),
            "display_name": r.get("display_name", ""),
            "disabled": str(r.get("disabled", "")).upper() in ("TRUE", "YES"),
            "must_change_password": str(r.get("must_change_password", "")).upper() in ("TRUE", "YES"),
            "default_role": r.get("default_role", ""),
            "default_warehouse": r.get("default_warehouse", ""),
            "has_mfa": str(r.get("has_mfa", "")).upper() in ("TRUE", "YES"),
            "owner": r.get("owner", ""),
            "password_last_set_time": str(r.get("password_last_set_time") or ""),
            "last_success_login": str(r.get("last_success_login") or ""),
        })
    return result


def list_roles(conn) -> list[dict]:
    result = []
    for r in _run_query(conn, "SHOW ROLES"):
        result.append({
            "name": r.get("name", ""),
            "owner": r.get("owner", ""),
            "comment": r.get("comment", ""),
            "assigned_to_users": int(r.get("assigned_to_users") or 0),
            "granted_to_roles": int(r.get("granted_to_roles") or 0),
            "granted_roles": int(r.get("granted_roles") or 0),
        })
    return result


def get_query_history(conn) -> dict:
    """Stats from SNOWFLAKE.ACCOUNT_USAGE.QUERY_HISTORY (last 7 days)."""
    base = {
        "total_queries": 0, "failed_queries": 0, "avg_execution_ms": 0.0,
        "p95_execution_ms": 0.0, "bytes_scanned": 0, "bytes_spilled_local": 0,
        "bytes_spilled_remote": 0, "error_types": {}, "top_expensive": [],
    }
    rows = _run_query(conn, """
        SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN execution_status = 'FAIL' THEN 1 ELSE 0 END) AS failed,
            AVG(total_elapsed_time) AS avg_ms,
            PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY total_elapsed_time) AS p95_ms,
            SUM(bytes_scanned) AS scanned,
            SUM(bytes_spilled_to_local_storage) AS spill_local,
            SUM(bytes_spilled_to_remote_storage) AS spill_remote
        FROM SNOWFLAKE.ACCOUNT_USAGE.QUERY_HISTORY
        WHERE start_time >= DATEADD(day, -7, CURRENT_TIMESTAMP())
    """)
    if rows:
        v = list(rows[0].values())
        base.update({
            "total_queries": int(v[0] or 0),
            "failed_queries": int(v[1] or 0),
            "avg_execution_ms": float(v[2] or 0),
            "p95_execution_ms": float(v[3] or 0),
            "bytes_scanned": int(v[4] or 0),
            "bytes_spilled_local": int(v[5] or 0),
            "bytes_spilled_remote": int(v[6] or 0),
        })

    for r in _run_query(conn, """
        SELECT error_message, COUNT(*) AS cnt
        FROM SNOWFLAKE.ACCOUNT_USAGE.QUERY_HISTORY
        WHERE start_time >= DATEADD(day, -7, CURRENT_TIMESTAMP())
          AND execution_status = 'FAIL' AND error_message IS NOT NULL
        GROUP BY error_message ORDER BY cnt DESC LIMIT 10
    """):
        base["error_types"][str(r.get("error_message") or "unknown")[:100]] = int(r.get("cnt") or 0)

    for r in _run_query(conn, """
        SELECT query_text, total_elapsed_time, bytes_scanned, warehouse_name, user_name
        FROM SNOWFLAKE.ACCOUNT_USAGE.QUERY_HISTORY
        WHERE start_time >= DATEADD(day, -7, CURRENT_TIMESTAMP())
          AND execution_status = 'SUCCESS'
        ORDER BY total_elapsed_time DESC LIMIT 10
    """):
        base["top_expensive"].append({
            "query_text": str(r.get("query_text") or "")[:200],
            "elapsed_ms": float(r.get("total_elapsed_time") or 0),
            "bytes_scanned": int(r.get("bytes_scanned") or 0),
            "warehouse": str(r.get("warehouse_name") or ""),
            "user": str(r.get("user_name") or ""),
        })

    return base


def get_storage_usage(conn) -> dict:
    base = {"storage_bytes": 0, "stage_bytes": 0, "failsafe_bytes": 0}
    rows = _run_query(conn, """
        SELECT SUM(STORAGE_BYTES), SUM(STAGE_BYTES), SUM(FAILSAFE_BYTES)
        FROM SNOWFLAKE.ACCOUNT_USAGE.STORAGE_USAGE
        WHERE USAGE_DATE >= DATEADD(day, -1, CURRENT_DATE())
    """)
    if rows:
        v = list(rows[0].values())
        base = {
            "storage_bytes": int(v[0] or 0),
            "stage_bytes": int(v[1] or 0),
            "failsafe_bytes": int(v[2] or 0),
        }
    return base


def get_warehouse_credits(conn) -> dict:
    base = {"total_credits": 0.0, "compute_credits": 0.0, "cloud_services_credits": 0.0, "top_wh": []}
    rows = _run_query(conn, """
        SELECT SUM(CREDITS_USED), SUM(CREDITS_USED_COMPUTE), SUM(CREDITS_USED_CLOUD_SERVICES)
        FROM SNOWFLAKE.ACCOUNT_USAGE.WAREHOUSE_METERING_HISTORY
        WHERE START_TIME >= DATEADD(day, -30, CURRENT_TIMESTAMP())
    """)
    if rows:
        v = list(rows[0].values())
        base.update({
            "total_credits": float(v[0] or 0),
            "compute_credits": float(v[1] or 0),
            "cloud_services_credits": float(v[2] or 0),
        })

    for r in _run_query(conn, """
        SELECT WAREHOUSE_NAME, SUM(CREDITS_USED) AS credits
        FROM SNOWFLAKE.ACCOUNT_USAGE.WAREHOUSE_METERING_HISTORY
        WHERE START_TIME >= DATEADD(day, -30, CURRENT_TIMESTAMP())
        GROUP BY WAREHOUSE_NAME ORDER BY credits DESC LIMIT 5
    """):
        base["top_wh"].append({
            "name": str(r.get("warehouse_name") or ""),
            "credits": float(r.get("credits") or 0),
        })

    return base


def count_masking_policies(conn) -> int:
    return count_objects(conn, "SHOW MASKING POLICIES IN ACCOUNT")


def count_row_access_policies(conn) -> int:
    return count_objects(conn, "SHOW ROW ACCESS POLICIES IN ACCOUNT")
