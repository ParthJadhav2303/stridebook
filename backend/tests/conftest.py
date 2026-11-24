"""Tests run against a real Postgres (DATABASE_URL), migrated with Alembic once per session.
"Today" is frozen at 15 Nov 2026 IST so month logic is deterministic; tracking starts June 2026."""

import os
from datetime import date

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import text

os.environ.setdefault(
    "DATABASE_URL", "postgresql+psycopg://stridebook:stridebook@localhost:5432/stridebook_test"
)
os.environ["TRACKING_START"] = "2026-06-01"
os.environ["SECRET_KEY"] = "test-secret-key-with-enough-length-1234567890"

from app.core.dates import set_today_for_tests  # noqa: E402
from app.core.db import SessionLocal, engine  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User  # noqa: E402
from app.modules.auth.router import reset_lockouts  # noqa: E402

TODAY = date(2026, 11, 15)


@pytest.fixture(scope="session", autouse=True)
def migrated_db():
    here = os.path.dirname(__file__)
    cfg = Config(os.path.join(here, "..", "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(here, "..", "alembic"))
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")
    yield


@pytest.fixture(autouse=True)
def clean_db():
    reset_lockouts()
    set_today_for_tests(TODAY)
    yield
    set_today_for_tests(None)
    with engine.begin() as conn:
        conn.execute(text("DELETE FROM fee_group_rates WHERE effective_from <> '2020-01-01'"))
        conn.execute(text("UPDATE fee_group_rates SET created_by = NULL"))
        for table in ("payment_allocations", "payments", "fee_dues", "students", "users", "app_settings"):
            conn.execute(text(f"DELETE FROM {table}"))
        conn.execute(text("ALTER SEQUENCE receipt_no_seq RESTART WITH 1"))


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def make_user(username: str, role: str, password: str = "password123") -> None:
    with SessionLocal() as db:
        db.add(
            User(
                username=username,
                full_name=username.title(),
                role=role,
                password_hash=hash_password(password),
                is_active=True,
                token_version=0,
            )
        )
        db.commit()


def login(client, username: str, password: str = "password123") -> dict:
    r = client.post("/api/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def admin(client):
    make_user("mom", "admin")
    return login(client, "mom")


@pytest.fixture
def coach(client):
    make_user("coach1", "coach")
    return login(client, "coach1")
