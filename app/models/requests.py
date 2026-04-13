from pydantic import BaseModel, SecretStr, Field


# ── Multi-server session models ────────────────────────────────────────────────

class DatabaseTarget(BaseModel):
    """One database within a server to be assessed."""
    name: str = Field(..., description="Database name")
    include_null_analysis: bool = Field(True, description="Run null/blank analysis")
    null_analysis_sample_limit: int = Field(30, ge=1, le=1000, description="Max tables to sample")


class ServerTarget(BaseModel):
    """One SQL Server instance with credentials and selected databases."""
    server: str = Field(..., description="SQL Server hostname or host\\instance")
    port: int = Field(1433, description="SQL Server port")
    username: str = Field(..., description="SQL login username")
    password: SecretStr = Field(..., description="SQL login password")
    trust_server_certificate: bool = Field(True)
    encrypt: bool = Field(True)
    databases: list[DatabaseTarget] = Field(default_factory=list)
    use_gateway: bool = Field(False, description="Route via auto-assigned gateway agent")


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
    server: str = Field(..., description="SQL Server hostname or host\\instance")
    port: int = Field(1433, description="SQL Server port")
    database: str = Field(..., description="Target database name")
    username: str = Field(..., description="SQL login username")
    password: SecretStr = Field(..., description="SQL login password")
    trust_server_certificate: bool = Field(True, description="Skip TLS certificate validation")
    encrypt: bool = Field(True, description="Require encrypted connection")

    model_config = {"json_schema_extra": {"example": {
        "server": "UIAP-S-SQL-01V",
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
