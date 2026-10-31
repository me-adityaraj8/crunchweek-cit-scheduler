"""Demo accounts come from the loaded dataset: one coordinator per department, one account per faculty
member, one per club that makes requests. The login page shows them as dropdowns."""
import json

from backend.app.config import STARTER_DATASET
from backend.app.core.dataset import load_dataset
from backend.app.services.state import demo_accounts
from backend.tests.api.conftest import PW


def _raw():
    return json.loads(STARTER_DATASET.read_text())


def test_one_account_per_department_faculty_member_and_club():
    raw = _raw()
    accounts = demo_accounts(load_dataset(raw))
    by_role = {}
    for a in accounts:
        by_role.setdefault(a["role"], []).append(a)
    depts = {f["department"] for f in raw["faculty"]} - {"ADMIN"}
    clubs = {b["requester"] for b in raw["booking_requests"] if b["role"] == "club"}
    assert len(by_role["admin"]) == 1
    assert {a["department"] for a in by_role["coordinator"]} == depts
    assert {a["faculty_id"] for a in by_role["faculty"]} == {f["id"] for f in raw["faculty"]}
    assert {a["name"] for a in by_role["club"]} == clubs
    emails = [a["email"] for a in accounts]
    assert len(emails) == len(set(emails))
    assert "cse.coord@cit.demo" in emails and "f01@cit.demo" in emails and "robotics-club@cit.demo" in emails


def test_dataset_without_clubs_still_has_a_club_account():
    raw = _raw()
    for b in raw["booking_requests"]:
        b["role"] = "admin"
    clubs = [a for a in demo_accounts(load_dataset(raw)) if a["role"] == "club"]
    assert [a["email"] for a in clubs] == ["club@cit.demo"]


def test_api_lists_them_with_departments_and_every_one_can_log_in(client):
    listed = client.get("/api/auth/demo-accounts").json()
    fac = next(a for a in listed if a["email"] == "f07@cit.demo")
    assert fac["role"] == "faculty" and fac["department"]
    for email in ("me.coord@cit.demo", "f07@cit.demo", "dramatics-society@cit.demo"):
        r = client.post("/api/auth/login", json={"email": email, "password": PW})
        assert r.status_code == 200, (email, r.text)
    me = client.get("/api/me", headers={"Authorization": f"Bearer {r.json()['token']}"}).json()
    assert me["name"] == "Dramatics Society" and me["role"] == "club"


def test_startup_adds_demo_accounts_missing_from_an_older_database(client):
    from sqlalchemy import delete, select

    from backend.app.db import SessionLocal
    from backend.app.models import User
    from backend.app.services import state

    with SessionLocal() as db:
        db.execute(delete(User).where(User.email == "f12@cit.demo"))
        db.commit()
        state.ensure_seeded(db)
        assert db.scalar(select(User).where(User.email == "f12@cit.demo")) is not None
    r = client.post("/api/auth/login", json={"email": "f12@cit.demo", "password": PW})
    assert r.status_code == 200, r.text
