"""Generate -> views -> bookings -> export, through the HTTP API."""
import pytest

from conftest import fresh, load_validator

from backend.app.config import STARTER_DATASET


@pytest.fixture(scope="module")
def gen(client, heads):
    return fresh(client, heads, exams=True)


def test_generate_zero_hard(gen):
    assert gen["hard_count"] == 0 and gen["placed"] == gen["total"] == 189
    assert gen["fest"]["hard_count"] == 0 and gen["fest"]["priority_inversions"] == []


def test_dashboard(client, heads, gen):
    d = client.get("/api/dashboard", headers=heads["admin"]).json()
    assert d["has_timetable"] and d["hard_count"] == 0 and d["conflicts"] == []
    assert d["exams_scheduled"] == 41 and len(d["utilisation"]) == 27


def test_group_view_no_overlap(client, heads, gen):
    r = client.get("/api/timetable", params={"view": "group", "id": "Y1-A"}, headers=heads["club"])
    entries = r.json()["entries"]
    assert entries
    cells = [(e["day"], p) for e in entries if not e["basket_slot"]
             for p in range(e["start_period"], e["start_period"] + e["duration"])]
    assert len(cells) == len(set(cells))


def test_faculty_cannot_open_other_faculty(client, heads, gen):
    me = client.get("/api/me", headers=heads["faculty"]).json()["faculty_id"]
    assert client.get("/api/timetable", params={"view": "faculty", "id": me}, headers=heads["faculty"]).status_code == 200
    other = "F02" if me != "F02" else "F03"
    assert client.get("/api/timetable", params={"view": "faculty", "id": other}, headers=heads["faculty"]).status_code == 403


def test_invalid_manual_move_422_with_suggestions(client, heads, gen):
    tt = client.get("/api/timetable", params={"view": "all"}, headers=heads["admin"]).json()["entries"]
    a = next(e for e in tt if e["duration"] == 1 and not e["basket_slot"] and e["kind"] == "lecture")
    b = next(e for e in tt if e["room_id"] != a["room_id"] and e["duration"] == 1 and e["day"] != a["day"])
    body = {"session_id": a["session_id"], "day": b["day"], "start_period": b["start_period"], "room_id": b["room_id"]}
    r = client.post("/api/timetable/manual", json=body, headers=heads["admin"])
    assert r.status_code == 422
    det = r.json()["error"]["details"]
    assert any(v["rule"] == "H4" for v in det["violations"]) and det["suggestions"]


def test_explain_session(client, heads, gen):
    sid = client.get("/api/timetable", params={"view": "all"}, headers=heads["admin"]).json()["entries"][0]["session_id"]
    ex = client.get(f"/api/explain/session/{sid}", headers=heads["club"]).json()
    assert ex["facts"] and "alternatives" in ex


def test_club_category_capped(client, heads, gen):
    draft = {"title": "Official Spectra jam", "attendance": 50, "duration_periods": 2,
             "windows": [{"day": "TUE", "from_period": 10, "to_period": 11}], "room_types": ["classroom", "lecture_hall"],
             "needs": [], "requested_category": "institute_event"}
    chk = client.post("/api/bookings/check", json=draft, headers=heads["club"]).json()
    assert chk["category"] == "club_event" and chk["category_note"]
    r = client.post("/api/bookings", json=draft, headers=heads["club"])
    assert r.status_code == 200, r.text
    b = r.json()["bookings"][0]
    assert b["category"] == "club_event" and b["status"] in ("approved", "alternative_offered")


def test_collision_gets_alternative_and_cancel_frees(client, heads, gen):
    # BR-07 (Dramatics) holds SH-1 on THU P10-12; a later club request for the same slot can't have it
    board = {r["id"]: r for r in client.get("/api/fest", headers=heads["club"]).json()["requests"]}
    held = board["BR-07"]["decision"]
    draft = {"title": "Late club meetup", "attendance": 120, "duration_periods": 3,     # too big for SH-2
             "windows": [{"day": held["day"], "from_period": held["start_period"], "to_period": held["end_period"]}],
             "room_types": ["seminar_hall"], "needs": [], "requested_room": held["room_id"],
             "requested_category": "club_event"}
    chk = client.post("/api/bookings/check", json=draft, headers=heads["club"]).json()
    assert chk["violations"], chk
    r = client.post("/api/bookings", json=draft, headers=heads["club"]).json()["bookings"][0]
    assert r["status"] in ("alternative_offered", "rejected") and r["reason"]
    assert r["decision"]["room_id"] != held["room_id"] or r["decision"]["day"] != held["day"]
    # cancelling our own request works; nobody else can cancel it
    assert client.post(f"/api/bookings/{r['id']}/cancel", headers=heads["faculty"]).status_code == 403
    c = client.post(f"/api/bookings/{r['id']}/cancel", headers=heads["club"]).json()
    assert c["status"] == "cancelled"


def test_coordinator_cannot_approve_own_lab_booking(client, heads, gen):
    draft = {"title": "CSE coding night", "attendance": 50, "duration_periods": 2,
             "windows": [{"day": "MON", "from_period": 10, "to_period": 13}], "room_types": ["lab_cs"],
             "needs": ["computers"], "requested_category": "department_event"}
    b = client.post("/api/bookings", json=draft, headers=heads["cse"]).json()["bookings"][0]
    assert b["status"] == "pending_approval" and b["approver"] == "admin"
    assert client.post(f"/api/bookings/{b['id']}/decide", json={"action": "approve"}, headers=heads["cse"]).status_code == 403
    ok = client.post(f"/api/bookings/{b['id']}/decide", json={"action": "approve"}, headers=heads["admin"]).json()
    assert ok["status"] == "approved"


def test_club_lab_booking_needs_owner_coordinator(client, heads, gen):
    draft = {"title": "Robotics build night", "attendance": 30, "duration_periods": 2,
             "windows": [{"day": "WED", "from_period": 10, "to_period": 13}], "room_types": ["lab_cs"],
             "needs": ["computers"], "requested_category": "club_event"}
    b = client.post("/api/bookings", json=draft, headers=heads["club"]).json()["bookings"][0]
    assert b["status"] == "pending_approval" and b["approver"] == "CSE"
    assert client.post(f"/api/bookings/{b['id']}/decide", json={"action": "approve"}, headers=heads["ece"]).status_code == 403
    d = client.post(f"/api/bookings/{b['id']}/decide", json={"action": "reject", "note": "lab maintenance"},
                    headers=heads["cse"]).json()
    assert d["status"] == "declined" and "lab maintenance" in d["reason"]


def test_assistant_falls_back_and_manual_form_still_works(client, heads, gen):
    r = client.post("/api/assistant/booking", json={"text": "seminar hall kal shaam 6 baje, 2 ghante, 100 log, mic chahiye",
                                                     "today": "MON"}, headers=heads["club"]).json()
    assert r["llm"] == "unavailable"
    d = r["draft"]
    assert d["windows"] == [{"day": "TUE", "from_period": 10, "to_period": 11}]
    assert d["attendance"] == 100 and "pa_system" in d["needs"] and d["room_types"] == ["seminar_hall"]
    draft = {**d, "title": "Hinglish test"}
    assert client.post("/api/bookings", json=draft, headers=heads["club"]).status_code == 200


def test_rooms_free(client, heads, gen):
    rooms = client.get("/api/rooms/free", params={"day": "TUE", "from": 10, "to": 11, "capacity": 100},
                       headers=heads["club"]).json()
    assert rooms and all(r["capacity"] >= 100 for r in rooms)


def test_export_passes_validator(client, heads, gen):
    import json
    V = load_validator()
    sched = client.get("/api/export/schedule.json", headers=heads["admin"]).json()
    rep = V.run(json.loads(STARTER_DATASET.read_text(encoding="utf-8")), sched)
    assert rep["hard_violation_count"] == 0, rep["hard_violations"][:5]
    assert rep["bookings"]["priority_inversions"] == []
    assert not [w for w in rep["warnings"] if w.startswith("No decision")]
