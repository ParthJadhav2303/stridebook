from tests.conftest import login, make_user


def test_login_and_me(client, admin):
    r = client.get("/api/auth/me", headers=admin)
    assert r.status_code == 200
    assert r.json()["role"] == "admin"


def test_wrong_password_and_lockout(client):
    make_user("coach1", "coach")
    for _ in range(5):
        r = client.post("/api/auth/login", json={"username": "coach1", "password": "nope-nope"})
        assert r.status_code == 401
    r = client.post("/api/auth/login", json={"username": "coach1", "password": "password123"})
    assert r.status_code == 429


def test_username_is_case_insensitive(client):
    make_user("coach1", "coach")
    assert login(client, "Coach1")


def test_requires_login(client):
    assert client.get("/api/students").status_code == 401


def test_refresh_token(client):
    make_user("mom", "admin")
    tokens = client.post("/api/auth/login", json={"username": "mom", "password": "password123"}).json()
    r = client.post("/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert r.status_code == 200
    # An access token can't be used as a refresh token.
    assert client.post("/api/auth/refresh", json={"refresh_token": tokens["access_token"]}).status_code == 401


def test_coach_cannot_manage_users_or_fees(client, coach):
    assert client.get("/api/users", headers=coach).status_code == 403
    r = client.post(
        "/api/fee-groups/1/rates", headers=coach, json={"monthly_amount": 1500, "effective_from": "2027-01"}
    )
    assert r.status_code == 403


def test_admin_creates_coach_and_resets_password(client, admin):
    r = client.post(
        "/api/users",
        headers=admin,
        json={"username": "Coach2", "full_name": "Coach Two", "role": "coach", "password": "firstpass1"},
    )
    assert r.status_code == 201
    coach_id = r.json()["id"]
    headers = login(client, "coach2", "firstpass1")
    client.patch(f"/api/users/{coach_id}", headers=admin, json={"new_password": "secondpass2"})
    # Old session is signed out after reset.
    assert client.get("/api/auth/me", headers=headers).status_code == 401
    assert login(client, "coach2", "secondpass2")


def test_cannot_remove_last_admin(client, admin):
    me = client.get("/api/auth/me", headers=admin).json()
    r = client.patch(f"/api/users/{me['id']}", headers=admin, json={"role": "coach"})
    assert r.status_code == 400


def test_change_password(client, admin):
    r = client.post(
        "/api/auth/change-password",
        headers=admin,
        json={"current_password": "password123", "new_password": "brandnew123"},
    )
    assert r.status_code == 200
    assert login(client, "mom", "brandnew123")
