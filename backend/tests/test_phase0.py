from sqlalchemy import text

from app.core.db import engine


def test_health_ok(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"
    assert r.json()["db"] == "ok"


def test_public_settings_defaults(client):
    r = client.get("/api/settings/public")
    assert r.status_code == 200
    body = r.json()
    assert body["app_name"] == "StrideBook"
    assert body["club_name"] == "Endurance Athletics Club"


def test_club_name_from_db_overrides_env(client):
    with engine.begin() as conn:
        conn.execute(text("INSERT INTO app_settings(key, value) VALUES ('club_name', 'Pune Striders')"))
    assert client.get("/api/settings/public").json()["club_name"] == "Pune Striders"
