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
from app.models.requests import ConnectionParams


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
    conn_str = (
        f"SERVER={params.server},{params.port};"
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
      *.postgres.database.azure.com, *.rds.amazonaws.com, etc.
                               →  psycopg2, sslmode=require
      localhost / 10.x / 192.168.x / on-prem hostname
                               →  psycopg2, sslmode=prefer
    """
    platform = _detect_pg_platform(params.server)
    if platform == "gcp_cloud_sql_connector":
        return _connect_postgres_cloud_sql(params)
    return _connect_postgres_direct(params, sslmode=_ssl_mode(platform))


def _connect_postgres_direct(params: ConnectionParams, *, sslmode: str = "prefer"):
    """Standard psycopg2 connection — works for all non-Cloud-SQL platforms."""
    import psycopg2
    return psycopg2.connect(
        host=params.server,
        port=params.port,
        dbname=params.database,
        user=params.username,
        password=params.password.get_secret_value(),
        connect_timeout=30,
        sslmode=sslmode,
    )


def _connect_postgres_cloud_sql(params: ConnectionParams):
    """
    Connect to GCP Cloud SQL PostgreSQL via the Cloud SQL Python Connector.

    The `params.server` must be the instance connection name:
        <project-id>:<region>:<instance-name>
    e.g. "my-project:us-central1:my-pg-instance"

    Authentication — one of:
      1. Paste a service account key JSON into the `gcp_sa_key` field (UI option).
      2. Set GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json on
         the SAT server (the SA needs the 'Cloud SQL Client' IAM role).
      3. Run `gcloud auth application-default login` on the machine hosting SAT.
      4. If running on GCE/Cloud Run/GKE the default service account is used
         automatically — no extra setup needed.

    Alternative: enable a public IP on the Cloud SQL instance, whitelist SAT's
    outbound IP in Authorised Networks, and enter the public IP in the Server field
    instead. That bypasses the Connector entirely (standard psycopg2 path).
    """
    try:
        from google.cloud.sql.connector import Connector
    except ImportError as exc:
        raise RuntimeError(
            "cloud-sql-python-connector is not installed.\n"
            "Run: pip install 'cloud-sql-python-connector[psycopg2]>=1.9.0'"
        ) from exc

    # If the caller supplied a service account key JSON, parse it into credentials
    # so the Connector can authenticate without needing ADC on the host machine.
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

    try:
        sql_connector = Connector(credentials=credentials)
    except Exception as exc:
        _raise_adc_error(exc)

    try:
        return sql_connector.connect(
            params.server,       # "project:region:instance"
            "psycopg2",
            user=params.username,
            password=params.password.get_secret_value(),
            db=params.database,
        )
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
            "GCP Cloud SQL requires authentication to establish its secure tunnel.\n"
            "Option A (easiest — no GCP auth needed): use the instance's public IP address "
            "in the Server field instead of the instance connection name. "
            "Enable Public IP in GCP Console → Cloud SQL → Connections → Networking, "
            "add this server's outbound IP to Authorized Networks, then enter the public IP.\n"
            "Option B: paste your service account key JSON into the 'Service Account Key' field "
            "(the SA needs the 'Cloud SQL Client' IAM role)."
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
