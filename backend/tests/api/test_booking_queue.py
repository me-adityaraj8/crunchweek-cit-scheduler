"""Two people asking for the same room at the same moment, from different devices."""
import threading

from conftest import token

SLOT = {"title": "Same room test", "attendance": 100, "duration_periods": 1,
        "windows": [{"day": "MON", "from_period": 10, "to_period": 10}], "room_types": ["auditorium"],
        "needs": [], "requested_room": "AUD", "mandatory_for_groups": [], "requested_category": "club_event",
        "repeat_days": []}


def _at_once(client, calls):
    """Send every call at the same instant, each on its own thread, like two phones tapping Send together."""
    start, out = threading.Barrier(len(calls)), [None] * len(calls)

    def run(i, headers, body):
        start.wait()
        out[i] = client.post("/api/bookings", json=body, headers=headers)

    threads = [threading.Thread(target=run, args=(i, h, b)) for i, (h, b) in enumerate(calls)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    return out


def test_two_requests_for_one_room_at_once_take_turns(client, heads):
    assert client.post("/api/admin/reset", headers=heads["admin"]).status_code == 200
    r = client.post("/api/timetable/generate", json={"time_limit_s": 60}, headers=heads["admin"])
    assert r.status_code == 200, r.text
    drama = token(client, "dramatics-society@cit.demo")
    a, b = _at_once(client, [(heads["club"], {**SLOT, "title": "Robotics demo"}),
                             (drama, {**SLOT, "title": "Street play"})])
    assert a.status_code == 200, a.text
    assert b.status_code == 200, b.text
    ids = a.json()["request_ids"] + b.json()["request_ids"]
    assert len(set(ids)) == 2

    board = client.get("/api/fest", headers=heads["admin"]).json()
    decided = {r["id"]: r for r in board["requests"] if r["id"] in ids}
    assert set(decided) == set(ids), "each request has a decision on the board"
    in_aud = [r for r in decided.values() if r["status"] in ("approved", "alternative_offered")
              and (r["decision"] or {}).get("room_id") == "AUD" and r["decision"]["day"] == "MON"
              and r["decision"]["start_period"] == 10]
    assert len(in_aud) == 1, "only one of them gets the auditorium then"
    assert board["summary"]["hard_count"] == 0


def test_a_request_that_waits_too_long_is_told_to_try_again(client, monkeypatch):
    from backend.app.db import SessionLocal
    from backend.app.errors import ApiError
    from backend.app.services import bookings

    monkeypatch.setattr(bookings, "QUEUE_WAIT_S", 0.2)
    first, second = SessionLocal(), SessionLocal()
    try:
        bookings.take_turn(first)
        bookings.take_turn(first)            # the same transaction asking again doesn't wait on itself
        try:
            bookings.take_turn(second)
        except ApiError as e:
            assert (e.status, e.code) == (503, "busy")
        else:
            raise AssertionError("the second request should not get a turn while the first holds it")
        first.commit()                       # the first one finishing frees the turn
        bookings.take_turn(second)
    finally:
        second.close()
        first.close()
