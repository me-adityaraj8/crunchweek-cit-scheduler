import uuid

from conftest import PW


def bearer(r) -> dict:
    return {"Authorization": f"Bearer {r.json()['token']}"}


def signup(client, **kw):
    body = {"name": "Asha Rao", "email": f"{uuid.uuid4().hex[:10]}@example.org", "password": "long-enough-1"} | kw
    return client.post("/api/auth/signup", json=body)


def test_login_and_me(client):
    r = client.post("/api/auth/login", json={"email": "admin@cit.demo", "password": PW})
    assert r.status_code == 200
    me = client.get("/api/me", headers={"Authorization": f"Bearer {r.json()['token']}"}).json()
    assert me["role"] == "admin" and me["demo"] is True


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


# ---------------------------------------------------------------- people's own accounts
def test_signup_logs_in_and_password_works(client):
    r = signup(client, name="  Robotics   Club ", email=f"  Club-{uuid.uuid4().hex[:6]}@Example.org ")
    assert r.status_code == 200, r.text
    user = r.json()["user"]
    assert (user["role"], user["name"], user["demo"]) == ("club", "Robotics Club", False)
    assert user["email"] == user["email"].strip().lower()
    assert client.get("/api/me", headers=bearer(r)).json()["id"] == user["id"]
    again = client.post("/api/auth/login", json={"email": user["email"].upper(), "password": "long-enough-1"})
    assert again.status_code == 200 and again.json()["user"]["id"] == user["id"]


def test_signup_refuses_bad_input(client):
    email = f"{uuid.uuid4().hex[:8]}@example.org"
    assert signup(client, email=email).status_code == 200
    taken = signup(client, email=email.upper())
    assert taken.status_code == 409 and "Log in instead" in taken.json()["error"]["message"]
    assert signup(client, email="sneaky@cit.demo").status_code == 400
    assert signup(client, email="not-an-email").status_code == 400
    assert signup(client, password="short").status_code == 400
    assert signup(client, password="é" * 40).status_code == 400          # 80 bytes: more than bcrypt reads
    assert signup(client, name=" ").status_code == 400
    assert signup(client, role="admin").status_code == 422               # approving roles are given, not taken
    assert signup(client, role="coordinator").status_code == 422


def test_faculty_signup_links_one_account_per_faculty(client, heads):
    faculty = client.get("/api/auth/signup-options").json()["faculty"]
    assert len(faculty) > 3 and {"id", "name", "department"} <= set(faculty[0])
    f = faculty[3]
    assert signup(client, role="faculty").status_code == 400             # no faculty member picked
    assert signup(client, role="faculty", faculty_id="F-NOPE").status_code == 400
    r = signup(client, role="faculty", faculty_id=f["id"])
    assert r.status_code == 200, r.text
    assert (r.json()["user"]["faculty_id"], r.json()["user"]["department"]) == (f["id"], f["department"])
    second = signup(client, role="faculty", faculty_id=f["id"])
    assert second.status_code == 409 and f["id"] in second.json()["error"]["message"]
    # the demo account of a faculty member doesn't block the real person from signing up
    demo_fid = client.get("/api/me", headers=heads["faculty"]).json()["faculty_id"]
    assert signup(client, role="faculty", faculty_id=demo_fid).status_code == 200


def test_change_password(client, heads):
    r = signup(client)
    email, h = r.json()["user"]["email"], bearer(r)
    wrong = client.post("/api/auth/password", json={"current_password": "nope", "new_password": "another-one-2"}, headers=h)
    assert wrong.status_code == 400 and wrong.json()["error"]["code"] == "bad_credentials"
    short = client.post("/api/auth/password", json={"current_password": "long-enough-1", "new_password": "x"}, headers=h)
    assert short.status_code == 400
    ok = client.post("/api/auth/password", json={"current_password": "long-enough-1", "new_password": "another-one-2"}, headers=h)
    assert ok.status_code == 200
    assert client.post("/api/auth/login", json={"email": email, "password": "long-enough-1"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": email, "password": "another-one-2"}).status_code == 200
    demo = client.post("/api/auth/password", json={"current_password": PW, "new_password": "another-one-2"}, headers=heads["club"])
    assert demo.status_code == 403
    assert client.post("/api/auth/login", json={"email": "robotics-club@cit.demo", "password": PW}).status_code == 200


def test_admin_gives_roles(client, heads):
    r = signup(client)
    uid, h = r.json()["user"]["id"], bearer(r)
    users = client.get("/api/users", headers=heads["admin"]).json()
    assert users[0]["id"] == uid                                         # newest own account first
    assert users[-1]["demo"] is True
    assert client.get("/api/users", headers=heads["faculty"]).status_code == 403
    assert client.put(f"/api/users/{uid}", json={"role": "coordinator"}, headers=heads["admin"]).status_code == 400
    up = client.put(f"/api/users/{uid}", json={"role": "coordinator", "department": "CSE"}, headers=heads["admin"])
    assert up.status_code == 200 and (up.json()["role"], up.json()["department"]) == ("coordinator", "CSE")
    # takes effect on the next request; the old token carries no power of its own
    assert client.get("/api/me", headers=h).json()["role"] == "coordinator"
    assert client.put(f"/api/users/{uid}", json={"role": "admin"}, headers=h).status_code == 403
    assert client.put(f"/api/users/{uid}", json={"role": "admin"}, headers=heads["admin"]).status_code == 200
    assert client.put(f"/api/users/{uid}", json={"role": "club"}, headers=h).status_code == 403     # not your own role
    demo_admin = client.get("/api/me", headers=heads["admin"]).json()["id"]
    assert client.put(f"/api/users/{demo_admin}", json={"role": "club"}, headers=h).status_code == 409
    assert client.put("/api/users/999999", json={"role": "club"}, headers=heads["admin"]).status_code == 404


def test_reset_keeps_own_accounts(client, heads):
    r = signup(client, name="Kept Person")
    email = r.json()["user"]["email"]
    assert client.post("/api/admin/reset", headers=heads["admin"]).status_code == 200
    assert client.get("/api/me", headers=bearer(r)).json()["name"] == "Kept Person"
    assert client.post("/api/auth/login", json={"email": email, "password": "long-enough-1"}).status_code == 200
    assert {a["email"] for a in client.get("/api/auth/demo-accounts").json()} <= {
        u["email"] for u in client.get("/api/users", headers=heads["admin"]).json()}
