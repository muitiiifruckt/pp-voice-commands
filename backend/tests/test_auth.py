def test_login_ok_admin(client):
    r = client.post(
        "/api/auth/token",
        data={"username": "admin", "password": "admin123"},
    )
    assert r.status_code == 200
    data = r.json()
    assert "access_token" in data
    assert data.get("token_type") == "bearer"


def test_login_fail(client):
    r = client.post(
        "/api/auth/token",
        data={"username": "admin", "password": "wrong"},
    )
    assert r.status_code == 401


def test_me_requires_auth(client):
    r = client.get("/api/me")
    assert r.status_code == 401


def test_me_with_token(client, admin_headers):
    r = client.get("/api/me", headers=admin_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["username"] == "admin"
    assert body["role"] == "admin"
    assert body["is_active"] is True
