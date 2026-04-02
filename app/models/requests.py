from pydantic import BaseModel, SecretStr, Field


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
