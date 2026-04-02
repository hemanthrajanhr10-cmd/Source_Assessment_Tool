from app.models.requests import ConnectionParams


def get_connection(params: ConnectionParams):
    """
    Build a SQL Server connection. The password is extracted from SecretStr
    exactly once here and never stored, logged, or returned.
    """
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
