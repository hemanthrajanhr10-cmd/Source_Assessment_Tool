from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:5173"]
    reports_dir: Path = Path("reports")
    log_level: str = "INFO"
    max_null_analysis_tables: int = 100

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()
