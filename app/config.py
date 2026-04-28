from pathlib import Path

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # ── CORS ──────────────────────────────────────────────────────────────────
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:5173"]

    # ── Local paths ───────────────────────────────────────────────────────────
    reports_dir: Path = Path("reports")
    static_dir: Path = Path("static")
    log_level: str = "INFO"
    max_null_analysis_tables: int = 100

    # ── Azure SQL Store (job persistence + assessment results) ────────────────
    azure_store_server: str = "source-assessment.database.windows.net"
    azure_store_port: int = 1433
    azure_store_database: str = "SourceAssessment"
    azure_store_username: str = "hemanth"
    azure_store_password: SecretStr = SecretStr("Ubti@123")

    # ── Azure Service Bus (gateway agent messaging) ───────────────────────────
    # Set SERVICE_BUS_CONNECTION_STRING env var in Azure Web App settings
    service_bus_connection_string: SecretStr = SecretStr("")
    service_bus_jobs_queue: str = "sat-jobs"
    service_bus_results_queue: str = "sat-results"

    # ── Microsoft Fabric / Power BI assessment ────────────────────────────────
    # Register an Azure AD app with delegated permissions:
    #   Dataset.Read.All, Report.Read.All, Workspace.Read.All
    # Then set FABRIC_CLIENT_ID (and optionally FABRIC_TENANT_ID) as env vars.
    fabric_client_id: str = ""        # Azure AD app Client ID
    fabric_tenant_id: str = "common"  # Tenant ID or "common" for multi-tenant

    # ── OAuth SSO (Microsoft Entra ID + Google) ───────────────────────────────
    # Microsoft OAuth — register an app at https://portal.azure.com
    #   Redirect URI: {backend_url}/api/v1/auth/oauth/microsoft/callback
    oauth_microsoft_client_id: str = ""
    oauth_microsoft_client_secret: SecretStr = SecretStr("")
    oauth_microsoft_tenant_id: str = "common"
    oauth_microsoft_redirect_uri: str = "http://localhost:8000/api/v1/auth/oauth/microsoft/callback"

    # Google OAuth — register an app at https://console.cloud.google.com
    #   Redirect URI: {backend_url}/api/v1/auth/oauth/google/callback
    oauth_google_client_id: str = ""
    oauth_google_client_secret: SecretStr = SecretStr("")
    oauth_google_redirect_uri: str = "http://localhost:8000/api/v1/auth/oauth/google/callback"

    # Frontend base URL — used to redirect back after OAuth callback
    frontend_url: str = "http://localhost:5173"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()
