from conftest import PW


def test_login_and_me(client):
    r = client.post("/api/auth/login", json={"email": "admin@cit.demo", "password": PW})
    assert r.status_code == 200
    me = client.get("/api/me", headers={"Authorization": f"Bearer {r.json()['token']}"}).json()
    assert me["role"] == "admin"


def test_wrong_password_401(client):
    r = client.post("/api/auth/login", json={"email": "admin@cit.demo", "password": "nope"})
    assert r.status_code == 401 and r.json()["error"]["code"] == "bad_credentials"


def test_no_token_401(client):
    assert client.get("/api/dashboard").status_code == 401


def test_faculty_on_admin_route_403(client, heads):
    r = client.post("/api/timetable/generate", headers=heads["faculty"])
    assert r.status_code == 403 and "admin" in r.json()["error"]["message"]


def test_demo_accounts_cover_all_roles(client):
    roles = {a["role"] for a in client.get("/api/auth/demo-accounts").json()}
    assert roles == {"admin", "coordinator", "faculty", "club"}


def test_bad_dataset_upload_400_keeps_old(client, heads):
    before = client.get("/api/data/summary", headers=heads["admin"]).json()["counts"]
    r = client.post("/api/data/dataset", content=b'{"dataset_id": "x", "rooms": []}', headers=heads["admin"])
    assert r.status_code == 400 and r.json()["error"]["message"]
    r2 = client.post("/api/data/dataset", content=b"{not json", headers=heads["admin"])
    assert r2.status_code == 400
    assert client.get("/api/data/summary", headers=heads["admin"]).json()["counts"] == before


def test_reset_keeps_admin_logged_in(client, heads):
    assert client.post("/api/admin/reset", headers=heads["admin"]).status_code == 200
    assert client.get("/api/me", headers=heads["admin"]).status_code == 200
    s = client.get("/api/data/summary", headers=heads["admin"]).json()["counts"]
    assert (s["rooms"], s["sessions"], s["booking_requests"], s["exams"]) == (27, 189, 25, 41)
