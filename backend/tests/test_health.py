def test_health_ok(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "version": "dev", "db": "ok"}


def test_public_settings_defaults(client):
    body = client.get("/api/settings/public").json()
    assert body["app_name"] == "StrideBook"
    assert body["club_name"] == "Endurance Athletics Club"
