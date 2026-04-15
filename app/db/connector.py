"""
Database connector — routes to the right driver based on db_type.
Supported: mssql (SQL Server), postgres (PostgreSQL), mysql (MySQL).
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
    return psycopg2.connect(
        host=params.server,
        port=params.port,
        dbname=params.database,
        user=params.username,
        password=params.password.get_secret_value(),
        connect_timeout=15,
        sslmode="require",
    )


def _connect_mysql(params: ConnectionParams):
    import pymysql
    return pymysql.connect(
        host=params.server,
        port=params.port,
        database=params.database,
        user=params.username,
        password=params.password.get_secret_value(),
        connect_timeout=15,
        ssl={"ssl": {}},
        autocommit=True,
    )
