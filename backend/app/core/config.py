from datetime import date
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
    access_token_minutes: int = 12 * 60
    refresh_token_days: int = 30
    login_max_failures: int = 5
    login_lockout_minutes: int = 15

    # First month the app tracks dues for. Students who joined earlier get dues from this month
    # onward (older history stays in the register book / Excel).
    tracking_start: date = date(2026, 11, 1)

    # Only needed in local dev when the Vite dev server runs on another port.
    cors_origins: list[str] = []


@lru_cache
def get_settings() -> Settings:
    return Settings()
