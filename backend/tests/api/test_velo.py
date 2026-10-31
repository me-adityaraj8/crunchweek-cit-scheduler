"""Velo: the router (keywords and model), every intent through the API, role limits, and that Velo
itself never changes anything."""
import json

import pytest

from conftest import SAMPLE, fresh

from backend.app.llm import client as llm
from backend.app.llm import velo as route


@pytest.fixture(scope="module")
def gen(client, heads):
    return fresh(client, heads)


def ask(client, heads, who, text, **extra):
    r = client.post("/api/velo", json={"text": text, "today": "MON", **extra}, headers=heads[who])
    assert r.status_code == 200, r.text
    return r.json()


def kinds(out):
    return [c["kind"] for c in out["cards"]]


# ---------------------------------------------------------------- the router on its own
@pytest.mark.parametrize("text,intent", [
    ("free rooms tuesday 10 to 12 for 40", "find_rooms"),
    ("koi room khali hai kal shaam?", "find_rooms"),
    ("seminar hall chahiye friday 4 baje, 100 log", "book_venue"),
    ("Book the auditorium for our fest night", "book_venue"),
    ("BR-03 ka kya hua", "booking_status"),
    ("what happened to my requests?", "booking_status"),
    ("cancel APP-0002", "cancel_booking"),
    ("why is CS101 on monday?", "explain_session"),
    ("other slots for PH101", "alternatives"),
    ("what's waiting for my approval", "approvals"),
    ("explain proposal #4", "proposals"),
    ("take me to exams", "navigate"),
    ("hi", "help"),
])
def test_keyword_routes(text, intent):
    assert route.rules(text, None, booking_open=False) == intent


def test_short_answers_continue_a_booking():
    assert route.rules("120 people", None, booking_open=True) == "book_venue"
    assert route.rules("2 ghante", None, booking_open=True) == "book_venue"
    assert route.rules("120 people", None, booking_open=False) is None


def test_open_session_makes_why_an_explanation():
    assert route.rules("why is it here?", {"kind": "session", "id": "S001"}, booking_open=False) == "explain_session"
    assert route.rules("find another slot", {"kind": "session", "id": "S001"}, booking_open=False) == "alternatives"


def test_ids_are_normalised():
    assert route.ids("status of br03")["request_id"] == "BR-03"
    assert route.ids("cancel app2")["request_id"] == "APP-0002"
    assert route.ids("is #12 approved")["proposal_id"] == 12


def test_model_routes_what_the_rules_cannot(monkeypatch):
    monkeypatch.setattr(llm, "transport", lambda s, t, schema: json.dumps(
        {"intent": "find_rooms", "course_id": "drop table", "request_id": None, "proposal_id": None, "page": None}))
    out = route.classify("is there anywhere 30 of us could meet on tuesday afternoon", "/", None, False)
    assert out["intent"] == "find_rooms" and out["mode"] == "model"
    assert out["course_id"] is None          # junk ids from the model are dropped


def test_model_down_falls_back(monkeypatch):
    def boom(*a):
        raise TimeoutError("slow")
    monkeypatch.setattr(llm, "transport", boom)
    assert route.classify("hmm", "/", None, False)["intent"] == "help"
    assert route.classify("tomorrow then", "/", None, True)["intent"] == "book_venue"


# ---------------------------------------------------------------- through the API
def test_find_rooms_matches_the_room_search(client, heads, gen):
    out = ask(client, heads, "club", "free rooms tuesday 10 to 12 for 40 people")
    assert out["intent"] == "find_rooms" and kinds(out) == ["rooms"]
    c = out["cards"][0]["data"]
    same = client.get("/api/rooms/free", params={"day": "TUE", "from": c["start"], "to": c["end"], "capacity": 40},
                      headers=heads["club"]).json()
    assert [r["id"] for r in c["rooms"]] == [r["id"] for r in same][:6] and c["total"] == len(same)
    assert all(r["capacity"] >= 40 for r in c["rooms"])
    assert {"label": "40 people", "guessed": False} in out["understood"]


def test_find_rooms_asks_for_a_time(client, heads, gen):
    out = ask(client, heads, "club", "any free rooms?")
    assert out["intent"] == "find_rooms" and not out["cards"] and "day" in out["reply"].lower()


def test_booking_by_conversation_then_preview_saves_nothing(client, heads, gen):
    before = client.get("/api/bookings", params={"mine": True}, headers=heads["club"]).json()
    first = ask(client, heads, "club", "book a seminar hall friday 4 to 6 pm for our robotics talk")
    assert first["intent"] == "book_venue" and kinds(first) == ["draft"]
    assert "how many" in first["reply"].lower() and first["draft_text"]
    second = ask(client, heads, "club", "80 people", draft_text=first["draft_text"], last_intent="book_venue")
    assert second["intent"] == "book_venue" and kinds(second) == ["preview"]
    prev = second["cards"][0]["data"]
    assert prev["draft"]["attendance"] == 80 and prev["draft"]["windows"][0]["day"] == "FRI"
    assert prev["check"]["valid"] is True
    after = client.get("/api/bookings", params={"mine": True}, headers=heads["club"]).json()
    assert len(after) == len(before)          # a preview is only a preview
    # the browser sends the confirmed draft to the usual endpoint, which decides
    sent = client.post("/api/bookings", json=prev["draft"], headers=heads["club"])
    assert sent.status_code == 200, sent.text


def test_status_and_cancel_preview(client, heads, gen):
    mine = client.get("/api/bookings", params={"mine": True}, headers=heads["club"]).json()
    assert mine, "the booking test above sends one"
    rid = mine[-1]["id"]
    out = ask(client, heads, "club", f"what happened to {rid}?")
    assert out["intent"] == "booking_status" and out["cards"][0]["data"]["items"][0]["id"] == rid
    cancel = ask(client, heads, "club", f"cancel {rid}")
    assert cancel["intent"] == "cancel_booking" and kinds(cancel) == ["confirm_cancel"]
    still = client.get("/api/bookings", params={"mine": True}, headers=heads["club"]).json()
    assert next(b for b in still if b["id"] == rid)["status"] != "cancelled"
    other = ask(client, heads, "faculty", f"cancel {rid}")      # not theirs
    assert not other["cards"]


def test_explain_and_alternatives_follow_roles(client, heads, gen):
    me = client.get("/api/me", headers=heads["faculty"]).json()["faculty_id"]
    tt = client.get("/api/timetable", params={"view": "faculty", "id": me, "week": "regular"},
                    headers=heads["faculty"]).json()
    e = tt["entries"][0]
    out = ask(client, heads, "faculty", f"why is {e['course_id']} where it is?")
    assert out["intent"] == "explain_session" and kinds(out) == ["explain"]
    card = out["cards"][0]["data"]
    assert card["course_id"] == e["course_id"] and card["facts"] and card["can_move"] is True
    focus = ask(client, heads, "club", "find another slot", focus={"kind": "session", "id": e["session_id"]})
    assert focus["intent"] == "alternatives" and focus["cards"][0]["data"]["session_id"] == e["session_id"]
    assert focus["cards"][0]["data"]["can_move"] is False


def test_approvals_by_role(client, heads, gen):
    admin = ask(client, heads, "admin", "what's waiting for my approval?")
    assert admin["intent"] == "approvals" and admin["cards"][0]["data"]["mine"] is False
    club = ask(client, heads, "club", "anything pending approval?")
    assert club["intent"] == "approvals" and "doesn't approve" in club["reply"]


def test_proposals_explained(client, heads, gen):
    p = client.post("/api/changes/file", content=SAMPLE.read_bytes(), headers=heads["admin"]).json()
    out = ask(client, heads, "admin", f"explain proposal #{p['id']}")
    assert out["intent"] == "proposals"
    one = out["cards"][0]["data"]["items"][0]
    assert one["id"] == p["id"] and one["moved"] == p["moved"] and f"moves {p['moved']}" in out["reply"]


def test_navigation_respects_roles(client, heads, gen):
    assert ask(client, heads, "admin", "take me to exams")["navigate"] == "/exams"
    club = ask(client, heads, "club", "open settings")
    assert club["navigate"] is None and "doesn't have" in club["reply"]


def test_no_timetable_is_a_reply_not_an_error(client, heads):
    assert client.post("/api/admin/reset", headers=heads["admin"]).status_code == 200
    out = ask(client, heads, "admin", "why is CS101 on monday?")
    assert out["intent"] == "explain_session" and out["reply"] and not out["cards"]
    fresh(client, heads)         # leave a timetable for any test after this one
