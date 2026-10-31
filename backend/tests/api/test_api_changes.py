"""Change files, faculty requests, approval and the after-change export."""
import json

import pytest

from conftest import SAMPLE, fresh, load_validator

from backend.app.config import STARTER_DATASET


@pytest.fixture(scope="module")
def gen(client, heads):
    return fresh(client, heads, exams=True)


def _active(client, heads):
    return client.get("/api/dashboard", headers=heads["admin"]).json()["version_id"]


def test_bad_change_file_400(client, heads, gen):
    before = _active(client, heads)
    r = client.post("/api/changes/file", json={"changes": [{"type": "teleport"}]}, headers=heads["admin"])
    assert r.status_code == 400 and "teleport" in r.json()["error"]["message"]
    r = client.post("/api/changes/file", json={"changes": [{"type": "room_unavailable", "room_id": "NOPE",
                                                            "days": ["MON"], "periods": [1]}]}, headers=heads["admin"])
    assert r.status_code == 400
    assert _active(client, heads) == before


def test_infeasible_proposal_keeps_active(client, heads, gen):
    before = _active(client, heads)
    change = {"changes": [{"type": "faculty_unavailable", "faculty_id": "F01", "days": ["MON", "TUE", "WED", "THU", "FRI"],
                           "periods": list(range(1, 10)), "reason": "sabbatical"}]}
    p = client.post("/api/changes/file", json=change, headers=heads["admin"]).json()
    assert p["status"] == "infeasible" and any("F01" in c["text"] for c in p["conflicts"])
    assert not p["can_approve"]
    assert client.post(f"/api/changes/{p['id']}/approve", headers=heads["admin"]).status_code == 409
    assert _active(client, heads) == before


def test_stale_proposal_409(client, heads, gen):
    tt = client.get("/api/timetable", params={"view": "all"}, headers=heads["admin"]).json()["entries"]
    e = next(x for x in tt if x["duration"] == 1 and not x["basket_slot"])
    ok = client.post("/api/timetable/check-move", json={"session_id": e["session_id"], "day": e["day"],
                                                         "start_period": e["start_period"], "room_id": e["room_id"]},
                     headers=heads["admin"]).json()
    assert ok["ok"]          # staying put is always valid
    sugg = client.post("/api/timetable/check-move", json={"session_id": e["session_id"], "day": "SUN",
                                                           "start_period": 1, "room_id": e["room_id"]},
                       headers=heads["admin"]).json()
    assert not sugg["ok"] and sugg["suggestions"]
    s1, s2 = sugg["suggestions"][0], sugg["suggestions"][1]
    p1 = client.post("/api/timetable/manual", json={"session_id": e["session_id"], "day": s1["day"],
                                                     "start_period": s1["start"], "room_id": s1["room"]}, headers=heads["admin"])
    p2 = client.post("/api/timetable/manual", json={"session_id": e["session_id"], "day": s2["day"],
                                                     "start_period": s2["start"], "room_id": s2["room"]}, headers=heads["admin"])
    assert p1.status_code == p2.status_code == 200, (p1.text, p2.text)
    a = client.post(f"/api/changes/{p1.json()['proposal_id']}/approve", headers=heads["admin"])
    assert a.status_code == 200 and a.json()["status"] == "approved"
    assert client.post(f"/api/changes/{p1.json()['proposal_id']}/approve", headers=heads["admin"]).status_code == 409
    b = client.post(f"/api/changes/{p2.json()['proposal_id']}/approve", headers=heads["admin"])
    assert b.status_code == 409 and "out of date" in b.json()["error"]["message"]


def test_faculty_unavailability_needs_admin(client, heads, gen):
    me = client.get("/api/me", headers=heads["faculty"]).json()["faculty_id"]
    p = client.post("/api/faculty/unavailability", json={"days": ["FRI"], "periods": [1, 2], "reason": "clinic"},
                    headers=heads["faculty"]).json()
    assert p["status"] in ("pending", "infeasible") and me in p["title"]
    assert client.post(f"/api/changes/{p['id']}/approve", headers=heads["faculty"]).status_code == 403
    # the faculty sees only their own proposals
    mine = client.get("/api/changes", headers=heads["faculty"]).json()
    assert {x["requested_by"] for x in mine} == {p["requested_by"]}
    if p["status"] == "pending":
        assert client.post(f"/api/changes/{p['id']}/reject", json={"note": "not now"}, headers=heads["admin"]).json()["status"] == "rejected"


def test_assistant_change_rules_fallback(client, heads, gen):
    r = client.post("/api/assistant/change", json={"text": "I can't teach on Friday 8 to 10 am, doctor visit"},
                    headers=heads["faculty"]).json()
    assert r["llm"] == "unavailable"
    i = r["intent"]
    assert i["type"] == "faculty_unavailable" and i["days"] == ["FRI"] and i["periods"] == [1, 2]


def test_sample_disruption_then_export_after(client, heads, gen):
    V = load_validator()
    data = json.loads(STARTER_DATASET.read_text(encoding="utf-8"))
    base = client.get("/api/export/schedule.json", headers=heads["admin"]).json()
    before_active = client.get("/api/export/schedule.json", params={"after": 1}, headers=heads["admin"]).json()
    p = client.post("/api/changes/file", content=SAMPLE.read_bytes(), headers=heads["admin"]).json()
    assert p["status"] == "pending", p["conflicts"]
    assert p["moved"] > 0 and p["added"] == 1 and p["removed"] == 0 and p["diff"]
    a = client.post(f"/api/changes/{p['id']}/approve", headers=heads["admin"])
    assert a.status_code == 200, a.text
    d = client.get("/api/dashboard", headers=heads["admin"]).json()
    assert d["hard_count"] == 0 and d["placed"] == d["total"] == 190          # CS202-T2 added
    after = client.get("/api/export/schedule.json", params={"after": 1}, headers=heads["admin"]).json()
    dis = json.loads(SAMPLE.read_text(encoding="utf-8"))
    rep = V.run(V.apply_disruption(data, dis), after, baseline=before_active)
    assert rep["hard_violation_count"] == 0, rep["hard_violations"][:5]
    assert rep["stability"]["sessions_moved"] == p["moved"]
    assert V.run(data, base)["hard_violation_count"] == 0
