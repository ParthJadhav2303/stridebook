from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """App configuration, read from environment variables (or a local .env file)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "StrideBook"
    app_version: str = "dev"
    environment: str = "development"

    # Defaults only; admins can override these from the app (stored in app_settings).
    club_name: str = "Endurance Athletics Club"
    club_short: str = "EAC"

    database_url: str = "postgresql+psycopg://stridebook:stridebook@localhost:5432/stridebook"
    secret_key: str = "change-me-in-production"

    # Only needed in local dev when the Vite dev server runs on another port.
    cors_origins: list[str] = []


@lru_cache
def get_settings() -> Settings:
    return Settings()
