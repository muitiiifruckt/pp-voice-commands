def test_list_users_admin(client, admin_headers):
    r = client.get("/api/users", headers=admin_headers)
    assert r.status_code == 200
    users = r.json()
    names = {u["username"] for u in users}
    assert "admin" in names
    assert "operator" in names


def test_list_users_forbidden_for_operator(client, operator_headers):
    r = client.get("/api/users", headers=operator_headers)
    assert r.status_code == 403


def test_create_user(client, admin_headers):
    r = client.post(
        "/api/users",
        headers=admin_headers,
        json={"username": "op2", "password": "secret123", "role": "operator"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["username"] == "op2"


def test_create_user_duplicate_username(client, admin_headers):
    r = client.post(
        "/api/users",
        headers=admin_headers,
        json={"username": "admin", "password": "secret123", "role": "operator"},
    )
    assert r.status_code == 400


def test_patch_user_block(client, admin_headers):
    c = client.post(
        "/api/users",
        headers=admin_headers,
        json={"username": "toblock", "password": "pass1234", "role": "operator"},
    )
    assert c.status_code == 200
    uid = c.json()["id"]
    r2 = client.patch(
        f"/api/users/{uid}",
        headers=admin_headers,
        json={"is_active": False},
    )
    assert r2.status_code == 200
    assert r2.json()["is_active"] is False
