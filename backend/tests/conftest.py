"""Tests run against a real Postgres (DATABASE_URL), migrated with Alembic once per session."""

import os

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import text

os.environ.setdefault(
    "DATABASE_URL", "postgresql+psycopg://stridebook:stridebook@localhost:5432/stridebook_test"
)

from app.core.db import engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def migrated_db():
    cfg = Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(os.path.dirname(__file__), "..", "alembic"))
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")
    yield


@pytest.fixture(autouse=True)
def clean_tables():
    yield
    with engine.begin() as conn:
        conn.execute(text("TRUNCATE app_settings"))


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c
