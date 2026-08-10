"""
Database connector — routes to the right driver based on db_type.

PostgreSQL platform support matrix:
  On-premises          hostname / IP                   sslmode=prefer
  Azure Flexible       *.postgres.database.azure.com   sslmode=require
  Azure Single (legacy)*.database.windows.net          sslmode=require
  AWS RDS              *.rds.amazonaws.com             sslmode=require
  AWS Aurora           *.cluster-*.rds.amazonaws.com   sslmode=require
  GCP Cloud SQL (IP)   any plain IP or hostname        sslmode=require
  GCP Cloud SQL (name) project:region:instance         Cloud SQL Connector
  GCP AlloyDB          *.alloydb.goog                  sslmode=require
  Supabase             *.supabase.co / *.supabase.com  sslmode=require
  Neon                 *.neon.tech                     sslmode=require
  CockroachDB Cloud    *.cockroachlabs.cloud           sslmode=require
  Aiven                *.aivencloud.com                sslmode=require
  Railway              *.railway.app                   sslmode=require
  Render               *.render.com                    sslmode=require
  TimescaleDB Cloud    *.tsdb.io                       sslmode=require
  ElephantSQL          *.db.elephantsql.com            sslmode=require
  Heroku               *.compute-1.amazonaws.com       sslmode=require
"""

import re
import threading
import time
from app.models.requests import ConnectionParams


# ── Azure Entra ID token cache (Managed Identity / DefaultAzureCredential) ─────

class _AzureTokenCache:
    """
    Thread-safe token cache for DefaultAzureCredential.

    Reuses the same credential instance across calls (important — the Azure SDK
    maintains its own internal token cache keyed to the credential object).
    Proactively refreshes the token 5 minutes before it expires so connections
    never fail mid-assessment due to a stale token.
    """

    _SCOPE = "https://ossrdbms-aad.database.windows.net/.default"
    _REFRESH_BUFFER_SEC = 300  # refresh when ≤5 min remain

    def __init__(self):
        self._lock = threading.Lock()
        self._credential = None   # lazily initialised; reused for SDK-level caching
        self._token: str | None = None
        self._expires_on: float = 0.0  # Unix timestamp from AccessToken.expires_on

    def get_token(self) -> str:
        with self._lock:
            now = time.time()
            if self._token and now < self._expires_on - self._REFRESH_BUFFER_SEC:
                return self._token
            # Lazy-init: DefaultAzureCredential tries Managed Identity → env vars →
            # Workload Identity → Azure CLI → VS Code login → browser, in that order.
            if self._credential is None:
                try:
                    from azure.identity import DefaultAzureCredential
                    self._credential = DefaultAzureCredential()
                except ImportError as exc:
                    raise RuntimeError(
                        "azure-identity is not installed.\n"
                        "Run: pip install azure-identity"
                    ) from exc
            token_obj = self._credential.get_token(self._SCOPE)
            self._token = token_obj.token
            self._expires_on = float(token_obj.expires_on)  # seconds since epoch
            return self._token


_azure_token_cache = _AzureTokenCache()


# ── Platform detection ─────────────────────────────────────────────────────────

_CLOUD_SUFFIXES = (
    # Azure
    ".postgres.database.azure.com",
    ".database.windows.net",
    # AWS
    ".rds.amazonaws.com",
    ".amazonaws.com",
    # GCP AlloyDB
    ".alloydb.goog",
    ".alloydb-dev.goog",
    # Supabase
    ".supabase.co",
    ".supabase.com",
    ".pooler.supabase.com",
    # Neon
    ".neon.tech",
    # CockroachDB Serverless
    ".cockroachlabs.cloud",
    # Aiven
    ".aivencloud.com",
    # Railway
    ".railway.app",
    # Render
    ".render.com",
    # TimescaleDB Cloud
    ".tsdb.io",
    # ElephantSQL
    ".db.elephantsql.com",
    # Heroku (Postgres add-on proxies via EC2)
    ".compute-1.amazonaws.com",
    ".compute.amazonaws.com",
)

# Patterns that unambiguously identify a managed cloud service
_CLOUD_PATTERNS = [
    re.compile(r"\.postgres\.database\.azure\.com$", re.I),
    re.compile(r"\.rds\.amazonaws\.com$", re.I),
    re.compile(r"\.cluster-[^.]+\.rds\.amazonaws\.com$", re.I),
    re.compile(r"\.alloydb\.goog$", re.I),
    re.compile(r"\.supabase\.(co|com)$", re.I),
    re.compile(r"\.neon\.tech$", re.I),
    re.compile(r"\.cockroachlabs\.cloud$", re.I),
    re.compile(r"\.aivencloud\.com$", re.I),
    re.compile(r"\.railway\.app$", re.I),
    re.compile(r"\.render\.com$", re.I),
    re.compile(r"\.tsdb\.io$", re.I),
    re.compile(r"\.db\.elephantsql\.com$", re.I),
    re.compile(r"\.compute(-\d+)?\.amazonaws\.com$", re.I),
]

_LOCAL_PATTERNS = [
    re.compile(r"^localhost$", re.I),
    re.compile(r"^127\.\d+\.\d+\.\d+$"),
    re.compile(r"^::1$"),
    re.compile(r"^10\.\d+\.\d+\.\d+$"),
    re.compile(r"^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$"),
    re.compile(r"^192\.168\.\d+\.\d+$"),
]


def _is_azure_postgres(server: str) -> bool:
    """True for Azure Database for PostgreSQL (Flexible or Single Server)."""
    s = server.lower()
    return s.endswith(".postgres.database.azure.com") or s.endswith(".database.windows.net")


def _is_cloud_sql_instance_name(server: str) -> bool:
    """Return True if server is a GCP Cloud SQL instance name: project:region:instance."""
    parts = server.split(":")
    return len(parts) == 3 and all(p.strip() for p in parts)


def _is_local(server: str) -> bool:
    return any(p.match(server) for p in _LOCAL_PATTERNS)


def _is_known_cloud(server: str) -> bool:
    return any(p.search(server) for p in _CLOUD_PATTERNS)


def _detect_pg_platform(server: str) -> str:
    """Classify the PostgreSQL server into a routing category."""
    if _is_cloud_sql_instance_name(server):
        return "gcp_cloud_sql_connector"
    if _is_local(server):
        return "local"
    if _is_known_cloud(server):
        return "managed_cloud"
    # Plain IP or unknown hostname — treat as on-prem (use prefer)
    return "onprem"


def _ssl_mode(platform: str) -> str:
    """Choose the psycopg2 sslmode for the detected platform."""
    if platform == "managed_cloud":
        return "require"
    # local / onprem: prefer (try SSL, graceful plain-text fallback)
    return "prefer"


# ── Entry point ────────────────────────────────────────────────────────────────

def get_connection(params: ConnectionParams):
    """Build and return a DB-API connection for the configured db_type."""
    db_type = getattr(params, "db_type", "mssql")
    if db_type == "postgres":
        return _connect_postgres(params)
    if db_type == "mysql":
        return _connect_mysql(params)
    if db_type == "oracle":
        return _connect_oracle(params)
    return _connect_mssql(params)


# ── SQL Server ─────────────────────────────────────────────────────────────────

def _connect_mssql(params: ConnectionParams):
    import mssql_python
    # Named instances (SERVER\INSTANCE) must not include a port — the SQL Server Browser
    # service resolves the dynamic port. Appending ,1433 would connect to the wrong instance.
    if "\\" in params.server:
        server_part = params.server
    else:
        server_part = f"{params.server},{params.port}"
    conn_str = (
        f"SERVER={server_part};"
        f"DATABASE={params.database};"
        f"UID={params.username};"
        f"PWD={params.password.get_secret_value()};"
        f"TrustServerCertificate={'yes' if params.trust_server_certificate else 'no'};"
        f"Encrypt={'yes' if params.encrypt else 'no'};"
    )
    return mssql_python.connect(conn_str)


# ── PostgreSQL ─────────────────────────────────────────────────────────────────

def _connect_postgres(params: ConnectionParams):
    """
    Route to the correct PostgreSQL connection strategy based on the server value:

      project:region:instance  →  GCP Cloud SQL Python Connector (IAM / ADC)
      *.postgres.database.azure.com  + azure_managed_identity=True
                               →  psycopg2 with Entra ID token as password
      *.postgres.database.azure.com, *.rds.amazonaws.com, etc.
                               →  psycopg2, sslmode=require
      localhost / 10.x / 192.168.x / on-prem hostname
                               →  psycopg2, sslmode=prefer
    """
    platform = _detect_pg_platform(params.server)
    if platform == "gcp_cloud_sql_connector":
        return _connect_postgres_cloud_sql(params)

    password_override = None
    if getattr(params, "azure_managed_identity", False) and _is_azure_postgres(params.server):
        password_override = _azure_token_cache.get_token()

    return _connect_postgres_direct(params, sslmode=_ssl_mode(platform), password_override=password_override)


def _connect_postgres_direct(params: ConnectionParams, *, sslmode: str = "prefer", password_override: str | None = None):
    """Standard psycopg2 connection — works for all non-Cloud-SQL platforms."""
    import psycopg2

    # Normalize port: if the user left the SQL Server default (1433), use PostgreSQL default.
    port = params.port if params.port != 1433 else 5432
    password = password_override if password_override is not None else params.password.get_secret_value()

    def _build_conn(ssl: str):
        conn = psycopg2.connect(
            host=params.server,
            port=port,
            dbname=params.database,
            user=params.username,
            password=password,
            connect_timeout=30,
            sslmode=ssl,
        )
        conn.autocommit = True
        return conn

    try:
        return _build_conn(sslmode)
    except psycopg2.OperationalError as exc:
        # Some on-prem servers have SSL disabled entirely; retry without SSL.
        if sslmode == "prefer" and "ssl" in str(exc).lower():
            return _build_conn("disable")
        raise


def _connect_postgres_cloud_sql(params: ConnectionParams):
    """
    Connect to GCP Cloud SQL PostgreSQL via the Cloud SQL Python Connector.

    params.server   must be the instance connection name:  project:region:instance
    params.gcp_private_ip  True → connect over private IP (VPC); False → public IP

    Authentication priority (no SA key required):
      1. ADC on GCE / Cloud Run / GKE  → attached service account, automatic
      2. GOOGLE_APPLICATION_CREDENTIALS env var pointing at a key file
      3. `gcloud auth application-default login` on a developer machine
      4. Paste SA key JSON into the optional gcp_sa_key field (legacy fallback)
    """
    try:
        from google.cloud.sql.connector import Connector, IPTypes
    except ImportError as exc:
        raise RuntimeError(
            "cloud-sql-python-connector is not installed.\n"
            "Run: pip install 'cloud-sql-python-connector[psycopg2]>=1.9.0'"
        ) from exc

    # SA key is optional — only parse it when explicitly supplied.
    credentials = None
    sa_key = getattr(params, "gcp_sa_key", None)
    if sa_key and sa_key.strip():
        try:
            import json as _json
            from google.oauth2 import service_account as _sa
            sa_info = _json.loads(sa_key)
            credentials = _sa.Credentials.from_service_account_info(
                sa_info,
                scopes=["https://www.googleapis.com/auth/cloud-platform"],
            )
        except Exception as exc:
            raise ValueError(
                f"Invalid GCP service account key JSON: {exc}\n"
                "Paste the full JSON content from your downloaded service account key file."
            ) from exc

    ip_type = IPTypes.PRIVATE if getattr(params, "gcp_private_ip", False) else IPTypes.PUBLIC

    try:
        # LAZY refresh avoids a background thread — fine for short-lived assessment connections.
        sql_connector = Connector(credentials=credentials, refresh_strategy="LAZY")
    except Exception as exc:
        _raise_adc_error(exc)

    try:
        conn = sql_connector.connect(
            params.server,       # "project:region:instance"
            "psycopg2",
            user=params.username,
            password=params.password.get_secret_value(),
            db=params.database,
            ip_type=ip_type,
        )
        conn.autocommit = True

        # Ensure the Connector is closed when the caller closes the connection.
        _orig_close = conn.close
        def _close_with_connector():
            try:
                _orig_close()
            finally:
                sql_connector.close()
        conn.close = _close_with_connector

        return conn
    except Exception as exc:
        sql_connector.close()
        _raise_adc_error(exc)


def _raise_adc_error(exc: Exception) -> None:
    cname = type(exc).__name__.lower()
    msg = str(exc).lower()
    is_cred_error = (
        "credential" in cname
        or "credential" in msg
        or "defaultcredentials" in cname
        or "could not automatically determine" in msg
        or "application default" in msg
        or "unable to detect" in msg
        or ("default" in msg and "credentials" in msg)
    )
    if is_cred_error:
        raise RuntimeError(
            "GCP Cloud SQL authentication failed.\n"
            "Option A — ADC (no key file needed): on GCE/Cloud Run/GKE the attached service "
            "account is used automatically. On a dev machine run: gcloud auth application-default login\n"
            "Option B — SA key: paste the full service account key JSON into the "
            "'Service Account Key' field (the SA needs the 'Cloud SQL Client' IAM role).\n"
            "Option C — bypass the Connector: enable a public IP on the Cloud SQL instance, "
            "whitelist SAT's outbound IP in Authorized Networks, and enter the public IP "
            "directly in the Server field."
        ) from exc
    raise exc


# ── Oracle ─────────────────────────────────────────────────────────────────────

def _connect_oracle(params: ConnectionParams):
    import oracledb
    return oracledb.connect(
        user=params.username,
        password=params.password.get_secret_value(),
        dsn=f"{params.server}:{params.port}/{params.database}",
    )


# ── MySQL ──────────────────────────────────────────────────────────────────────

def _connect_mysql(params: ConnectionParams):
    import pymysql
    return pymysql.connect(
        host=params.server,
        port=params.port,
        database=params.database,
        user=params.username,
        password=params.password.get_secret_value(),
        connect_timeout=30,
        ssl={},          # negotiate SSL; plain-text fallback if server has no SSL
        autocommit=True,
        charset="utf8mb4",
    )
