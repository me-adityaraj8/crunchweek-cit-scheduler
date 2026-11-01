"""Venue requests for an ordinary teaching week: checked against the normal timetable and decided by
the same priority order as Spectra week, without touching Spectra week or its score."""
import pytest

@pytest.fixture(scope="module")
def gen(client, heads):
    assert client.post("/api/admin/reset", headers=heads["admin"]).status_code == 200
    r = client.post("/api/timetable/generate", json={"time_limit_s": 90}, headers=heads["admin"])
    assert r.status_code == 200, r.text
    return r.json()


def draft(**over):
    d = {"title": "Regular week test", "attendance": 100, "duration_periods": 1,
         "windows": [{"day": "MON", "from_period": 11, "to_period": 11}], "room_types": ["auditorium"],
         "needs": [], "requested_room": "AUD", "mandatory_for_groups": [], "requested_category": "club_event",
         "repeat_days": [], "week": "regular"}
    return {**d, **over}


def send(client, heads, who, body):
    r = client.post("/api/bookings", json=body, headers=heads[who])
    assert r.status_code == 200, r.text
    rid = r.json()["request_ids"][0]
    return next(b for b in client.get("/api/bookings", headers=heads["admin"]).json() if b["id"] == rid)


def test_a_free_room_is_approved_and_spectra_week_is_untouched(client, heads, gen):
    score = client.get("/api/fest", headers=heads["admin"]).json()["summary"]["booking_score"]
    b = send(client, heads, "club", draft())
    assert b["week"] == "regular" and b["status"] == "approved" and b["decision"]["room_id"] == "AUD"
    fest = client.get("/api/fest", headers=heads["admin"]).json()
    assert b["id"] not in {x["id"] for x in fest["requests"]}
    assert fest["summary"]["booking_score"] == score
    free = client.get("/api/rooms/free", params={"day": "MON", "from": 11, "to": 11, "week": "regular"},
                      headers=heads["club"]).json()
    assert "AUD" not in {r["id"] for r in free}


def test_a_class_keeps_its_room(client, heads, gen):
    e = client.get("/api/timetable", params={"view": "all", "id": "", "week": "regular"},
                   headers=heads["admin"]).json()["entries"][0]
    room = e["room_id"]
    rooms = client.get("/api/data/summary", headers=heads["admin"]).json()["rooms"]
    body = draft(title="Clash test", attendance=10, requested_room=room,
                 windows=[{"day": e["day"], "from_period": e["start_period"], "to_period": e["start_period"]}],
                 room_types=[next(r["type"] for r in rooms if r["id"] == room)])
    chk = client.post("/api/bookings/check", json=body, headers=heads["club"]).json()
    placed = chk["placement"] or {}
    assert not (placed.get("room_id") == room and placed.get("day") == e["day"]
                and placed.get("start_period") == e["start_period"] and placed.get("status") == "approved")


def test_the_higher_priority_request_wins_whoever_asked_first(client, heads, gen):
    slot = {"windows": [{"day": "TUE", "from_period": 12, "to_period": 12}]}
    club = send(client, heads, "club", draft(title="Club night", **slot))
    dept = send(client, heads, "cse", draft(title="Dept talk", requested_category="department_event", **slot))
    club = next(b for b in client.get("/api/bookings", headers=heads["admin"]).json() if b["id"] == club["id"])
    assert dept["decision"]["room_id"] == "AUD" and dept["status"] in ("approved", "pending_approval")
    assert not (club["decision"].get("room_id") == "AUD" and club["decision"].get("start_period") == 12
                and club["decision"].get("day") == "TUE")
