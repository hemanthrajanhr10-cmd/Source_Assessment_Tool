"""
Database connector — routes to the right driver based on db_type.
Supported: mssql (SQL Server), postgres (PostgreSQL), mysql (MySQL).
Compatible with cloud-hosted engines: Azure SQL, Azure PostgreSQL,
AWS RDS, GCP Cloud SQL, PlanetScale, Amazon Aurora, etc.
"""

from app.models.requests import ConnectionParams


def get_connection(params: ConnectionParams):
    """
    Build a database connection for the given db_type.
    Password is extracted from SecretStr exactly once and never stored or logged.
    """
    db_type = getattr(params, "db_type", "mssql")

    if db_type == "postgres":
        return _connect_postgres(params)
    elif db_type == "mysql":
        return _connect_mysql(params)
    elif db_type == "oracle":
        return _connect_oracle(params)
    else:
        return _connect_mssql(params)


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


def _connect_postgres(params: ConnectionParams):
    import psycopg2
    # Use 'prefer' so the same code works for:
    #   - Cloud-hosted PG (Azure, AWS RDS, GCP) which use SSL
    #   - Local / on-prem PG which may have no SSL configured
    # 'prefer' tries SSL first and gracefully falls back to plain.
    # For platforms that REQUIRE SSL (Azure PG Flexible Server), prefer
    # still works because SSL is available; it just won't reject non-SSL peers.
    return psycopg2.connect(
        host=params.server,
        port=params.port,
        dbname=params.database,
        user=params.username,
        password=params.password.get_secret_value(),
        connect_timeout=30,
        sslmode="prefer",
    )


def _connect_oracle(params: ConnectionParams):
    import oracledb
    # Thin mode — no Oracle Client installation required.
    # params.database holds the Oracle service name (used in the Easy Connect DSN).
    # Works on OCI Autonomous DB, AWS RDS Oracle, on-premises 12c+.
    return oracledb.connect(
        user=params.username,
        password=params.password.get_secret_value(),
        dsn=f"{params.server}:{params.port}/{params.database}",
    )


def _connect_mysql(params: ConnectionParams):
    import pymysql
    # ssl={} enables SSL negotiation without requiring a specific CA cert,
    # which works for cloud-hosted MySQL (Azure MySQL, AWS RDS, GCP Cloud SQL,
    # PlanetScale, Amazon Aurora) as well as local MySQL with SSL off.
    # pymysql falls back to plain TCP if the server doesn't support SSL.
    return pymysql.connect(
        host=params.server,
        port=params.port,
        database=params.database,
        user=params.username,
        password=params.password.get_secret_value(),
        connect_timeout=30,
        ssl={},          # empty dict = enable SSL negotiation, no cert pinning
        autocommit=True,
        charset="utf8mb4",
    )
