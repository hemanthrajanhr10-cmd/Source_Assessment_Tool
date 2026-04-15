from typing import Literal
from pydantic import BaseModel, SecretStr, Field

DbType = Literal["mssql", "postgres", "mysql"]


# ── Multi-server session models ────────────────────────────────────────────────

class DatabaseTarget(BaseModel):
    """One database within a server to be assessed."""
    name: str = Field(..., description="Database name")
    include_null_analysis: bool = Field(True, description="Run null/blank analysis")
    null_analysis_sample_limit: int = Field(30, ge=1, le=1000, description="Max tables to sample")


class ServerTarget(BaseModel):
    """One database server with credentials and selected databases."""
    db_type: DbType = Field("mssql", description="Database engine type: mssql, postgres, mysql")
    server: str = Field(..., description="Hostname or IP")
    port: int = Field(1433, description="Port (default 1433 for SQL Server, 5432 for PostgreSQL, 3306 for MySQL)")
    username: str = Field(..., description="Login username")
    password: SecretStr = Field(..., description="Login password")
    trust_server_certificate: bool = Field(True)
    encrypt: bool = Field(True)
    databases: list[DatabaseTarget] = Field(default_factory=list)
    use_gateway: bool = Field(False, description="Route via gateway agent")
    gateway_key: str | None = Field(None, description="Specific gateway key to use (required when use_gateway=True)")


class SessionRequest(BaseModel):
    """Create a multi-server assessment session."""
    label: str | None = Field(None, description="Optional session label")
    servers: list[ServerTarget] = Field(..., min_length=1)


class ConnectivityTestRequest(BaseModel):
    """TCP connectivity test for a list of servers."""
    servers: list[dict] = Field(..., description="List of {server: str, port: int} objects")


class ListDatabasesRequest(BaseModel):
    """List available databases on a server."""
    connection: "ConnectionParams"


# ── Single-server assessment models ───────────────────────────────────────────

class ConnectionParams(BaseModel):
    db_type: DbType = Field("mssql", description="Database engine: mssql, postgres, mysql")
    server: str = Field(..., description="Hostname or IP")
    port: int = Field(1433, description="Port")
    database: str = Field(..., description="Target database name")
    username: str = Field(..., description="Login username")
    password: SecretStr = Field(..., description="Login password")
    trust_server_certificate: bool = Field(True, description="Skip TLS certificate validation (SQL Server)")
    encrypt: bool = Field(True, description="Require encrypted connection (SQL Server)")

    model_config = {"json_schema_extra": {"example": {
        "db_type": "mssql",
        "server": "myserver.database.windows.net",
        "port": 1433,
        "database": "MyDatabase",
        "username": "db_user",
        "password": "s3cr3t",
        "trust_server_certificate": True,
        "encrypt": True,
    }}}


class AssessmentRequest(BaseModel):
    connection: ConnectionParams
    include_null_analysis: bool = Field(True, description="Run null/blank analysis on sampled tables")
    null_analysis_sample_limit: int = Field(
        30, ge=1, le=1000,
        description="Max number of tables to sample for null analysis"
    )
    label: str | None = Field(None, description="Optional human-readable job label")
    gateway_key: str | None = Field(
        None,
        description="If set, the job is routed to the gateway agent with this key instead of running directly"
    )
