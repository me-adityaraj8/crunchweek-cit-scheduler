"""Velo's answers. Every card is built from the same code the pages use (the room search, the booking
parser and checker, the session explanations, the proposal summaries), so Velo can never say something
the app would not. Nothing here writes: submitting, cancelling and asking for a move are sent by the
browser to the usual endpoints, after the person confirms, with the usual role checks and validation."""
import re
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.explain import _time, explain_session
from ..core.model import Dataset
from ..errors import ApiError
from ..llm import velo as route
from ..llm.parse_booking import parse_booking
from ..llm.parse_change import parse_change
from ..llm.timeparse import romanise
from ..models import User, VeloConversation, VeloMessage
from ..routers.timetable import course_dept, course_titles
from ..routers.views import pending_for, rooms_free
from ..schemas import VeloIn
from . import bookings, proposals, state

DAY = {"MON": "Monday", "TUE": "Tuesday", "WED": "Wednesday", "THU": "Thursday", "FRI": "Friday", "SAT": "Saturday",
       "SUN": "Sunday"}
PAGE_LABEL = {"/": "Overview", "/timetable": "Timetable", "/exams": "Exams", "/spectra": "Spectra week",
              "/changes": "Changes", "/approvals": "Approvals", "/rooms": "Find a room", "/book": "Book a venue",
              "/data": "Data and export", "/settings": "Settings"}
ROLE_PAGES = {"admin": list(PAGE_LABEL),
              "coordinator": ["/", "/timetable", "/book", "/approvals", "/spectra", "/changes", "/rooms", "/exams"],
              "faculty": ["/", "/timetable", "/changes", "/rooms", "/book", "/exams", "/spectra"],
              "club": ["/", "/book", "/spectra", "/rooms", "/timetable", "/exams"]}
STATUS = {"approved": "approved", "alternative_offered": "offered another slot", "rejected": "rejected",
          "pending_approval": "waiting for approval", "submitted": "submitted", "cancelled": "cancelled",
          "declined": "declined"}
PROPOSAL_STATUS = {"pending": "waiting for the Admin", "approved": "applied", "rejected": "rejected",
                   "infeasible": "has no valid fix"}


@dataclass
class Turn:
    db: Session
    user: User
    body: VeloIn
    focus: dict | None
    found: dict


def chip(label: str, guessed: bool = False) -> dict:
    return {"label": label, "guessed": guessed}


def card(card_kind: str, /, **data) -> dict:
    return {"kind": card_kind, "data": data}


def when(ds: Dataset, day: str, start: int, end: int) -> str:
    return f"{DAY.get(day, day)} {_time(ds, start, end - start + 1)}"


def _version(t: Turn):
    row, ds = state.active_dataset(t.db)
    return ds, state.require_version(t.db, row)


# ---------------------------------------------------------------- rooms and bookings
def too_big(ds: Dataset, people: int, needs: list[str]) -> str:
    """Why no room type fits, naming the biggest bookable venue so the person knows what is possible."""
    venues = [r for r in ds.rooms.values() if "event" in r["allowed_uses"]]
    big = max(venues, key=lambda r: r["capacity"], default=None)
    if big and big["capacity"] < people:
        return (f"No venue seats {people} people: the largest is {big['id']} with {big['capacity']}. "
                f"Split the event or plan for {big['capacity']} or fewer.")
    return f"No bookable room fits {people} people with {', '.join(needs) or 'those needs'}. Try fewer people or fewer needs."


def find_rooms(t: Turn) -> dict:
    row, ds = state.active_dataset(t.db)
    p = parse_booking(ds, t.body.text, t.user.role, t.body.today)
    d, guessed = p["draft"], set(p["guessed_fields"])
    chips = [chip("Find a room")]
    if not d["windows"]:
        # keep the parser's question about the day ("today" is Sunday...), not the booking-only ones
        ask = (p["follow_up"] or "").replace("About how many people will attend?", "").replace(
            "Which day of Spectra week, and what time?", "").strip()
        return {"reply": ask or "Which day and time? For example, Tuesday 4 to 6 pm.", "understood": chips,
                "suggestions": ["Free rooms tomorrow 10 to 12", "Free halls Friday evening for 100"], "_llm": p["llm"]}
    w = d["windows"][0]
    a, b = w["from_period"], w["to_period"]
    if "windows" in guessed and (a, b) == (1, 9):
        return {"reply": f"What time on {DAY[w['day']]}?", "understood": chips + [chip(DAY[w["day"]])],
                "suggestions": [f"{DAY[w['day']]} 10 to 12", f"{DAY[w['day']]} 2 to 4 pm", f"{DAY[w['day']]} evening"],
                "_llm": p["llm"]}
    spectra = bool(re.search(r"spectra|fest|week ?7|event", t.body.text.lower())) or b > 9
    capacity = d["attendance"] or 1
    types = [] if "room_types" in guessed else d["room_types"]
    rooms = rooms_free(day=w["day"], from_period=a, to_period=b, capacity=capacity, needs=",".join(d["needs"]),
                       types=",".join(types), week="spectra" if spectra else "regular", db=t.db, _=t.user)
    chips += [chip(DAY[w["day"]], "windows" in guessed), chip(_time(ds, a, b - a + 1), "windows" in guessed)]
    if d["attendance"]:
        chips.append(chip(f"{d['attendance']} people"))
    chips += [chip(n.replace("_", " ")) for n in d["needs"]] + [chip(x.replace("_", " ")) for x in types]
    chips.append(chip("Spectra week" if spectra else "Regular week"))
    slot = when(ds, w["day"], a, b)
    reply = (f"{len(rooms)} {'room is' if len(rooms) == 1 else 'rooms are'} free {slot}"
             + (f" for {capacity} people" if d["attendance"] else "") + "." if rooms else
             f"No room is free {slot} with what you asked for. Try another time or fewer needs.")
    if (want := d.get("requested_room")) in ds.rooms:      # "is LH-3 free...": answer about LH-3 first
        others = [r for r in rooms if r["id"] != want]
        if len(others) < len(rooms):
            reply = f"Yes, {want} is free {slot}." + (f" {len(others)} similar rooms are too." if others else "")
            rooms = [next(r for r in rooms if r["id"] == want)] + others
        else:
            cap = ds.rooms[want]["capacity"]
            reply = (f"{want} seats {cap}, fewer than {capacity}." if cap < capacity else f"No, {want} is taken {slot}.") + (
                f" {len(others)} similar {'room is' if len(others) == 1 else 'rooms are'} free: "
                + ", ".join(r["id"] for r in others[:3]) + "." if others else " Try another time.")
    return {"reply": reply, "understood": chips, "_llm": p["llm"],
            "cards": [card("rooms", day=w["day"], start=a, end=b, when=slot, people=d["attendance"],
                           needs=d["needs"], week="spectra" if spectra else "regular", total=len(rooms),
                           rooms=rooms[:6])],
            "suggestions": ([f"Book {rooms[0]['id']} on {DAY[w['day']]} from "
                             + " to ".join(_time(ds, a, b - a + 1).split("–"))
                             + (f" for {d['attendance']} people" if d["attendance"] else "")] if rooms else []) +
                           [f"Free rooms {DAY[w['day']]} at another time", "Only rooms with a projector"]}


_ANSWERS = {"About how many people": ["50 people", "100 people", "200 people"],
            "Which day": ["Tomorrow 4 to 6 pm", "Friday 10 to 12"],
            "Is any time": ["Yes, any time", "Evening only", "Morning only"],
            "too late": ["6 pm instead", "Earlier, at 4 pm"]}


def _draft_chips(ds: Dataset, d: dict, guessed: set[str]) -> list[dict]:
    chips = [chip("Book a venue")]
    if d.get("title") and d["title"] != "Venue request":
        chips.append(chip(d["title"]))
    for w in d.get("windows") or []:
        chips.append(chip(when(ds, w["day"], w["from_period"], w["to_period"]), "windows" in guessed))
    if d.get("attendance"):
        chips.append(chip(f"{d['attendance']} people", "attendance" in guessed))
    if d.get("duration_periods"):
        n = d["duration_periods"]
        chips.append(chip(f"{n} hour{'s' if n != 1 else ''}", "duration_periods" in guessed))
    if d.get("requested_room"):
        chips.append(chip(d["requested_room"]))
    chips += [chip(n.replace("_", " ")) for n in d.get("needs") or []]
    return chips


_SPECTRA = r"spectra|\bfest\b|week ?7"
_REGULAR = r"regular|normal week|usual week|this week|next week|every week|weekly"


def _week(text: str) -> str | None:
    """The week the person last named: "spectra", "regular", or None when they haven't said."""
    t = romanise(text).lower()
    last = {w: max((m.end() for m in re.finditer(pat, t)), default=-1) for w, pat in (("spectra", _SPECTRA), ("regular", _REGULAR))}
    best = max(last, key=last.get)
    return best if last[best] >= 0 else None


def _rooms_asked(t: Turn) -> str | None:
    """The room search this booking points back to ("book it", "that one", "wahi"), if the last turn was one."""
    if not t.body.conversation_id or not re.search(r"\b(it|that( one)?|this one|same|wahi|vahi|use)\b",
                                                   t.body.text.lower()):
        return None
    c = t.db.get(VeloConversation, t.body.conversation_id)
    if c is None or c.user_id != t.user.id:
        return None
    last = t.db.scalars(select(VeloMessage).where(VeloMessage.conversation_id == c.id)
                        .order_by(VeloMessage.id.desc()).limit(2)).all()
    if len(last) == 2 and last[0].role == "assistant" and last[1].role == "user" and any(
            k.get("kind") == "rooms" for k in (last[0].payload or {}).get("cards", [])):
        return last[1].content
    return None


def book_venue(t: Turn) -> dict:
    row, ds = state.active_dataset(t.db)
    carry = t.body.last_intent == "book_venue" and t.body.draft_text and not re.search(
        r"\b(book|reserve)\b", t.body.text.lower())
    text = f"{t.body.draft_text}. {t.body.text}" if carry else t.body.text
    if not carry and (asked := _rooms_asked(t)):     # "ok book it" right after "is LH-3 free Wednesday 2 to 4?"
        text = f"{asked}. {t.body.text}"
    p = parse_booking(ds, text, t.user.role, t.body.today)
    d, guessed = p["draft"], set(p["guessed_fields"])
    if (re.match(r"\s*(book|reserve|need|free|find|i want)\b", d["title"], re.I) or len(d["title"]) > 80
            or p["llm"] != "ok" and d["title"].rstrip("…").strip().lower() in re.sub(r"\s+", " ", text).lower()):
        d["title"] = "Venue request"          # the keyword parser keeps the whole sentence; that is not a title
    chips = _draft_chips(ds, d, guessed)
    if p["follow_up"]:
        hints = next((v for k, v in _ANSWERS.items() if k in p["follow_up"]), [])
        return {"reply": p["follow_up"], "understood": chips, "draft_text": text, "_llm": p["llm"],
                "cards": [card("draft", draft=d, guessed=sorted(guessed), notes=p["notes"], question=p["follow_up"])],
                "suggestions": hints}
    week = _week(text)
    if week is None:
        return {"reply": "Which week is this for: Spectra week (Week 7) or a regular week?",
                "understood": chips, "draft_text": text, "_llm": p["llm"],
                "cards": [card("draft", draft=d, guessed=sorted(guessed), notes=p["notes"], question="Which week?")],
                "suggestions": ["Spectra week", "Regular week"]}
    chips.append(chip("Spectra week" if week == "spectra" else "Regular week"))
    v = state.require_version(t.db, row)
    full = {**d, "attendance": d["attendance"], "room_types": d["room_types"] or [], "week": week}
    if not full["room_types"]:
        return {"reply": too_big(ds, d["attendance"], d["needs"]),
                "understood": chips, "draft_text": text, "_llm": p["llm"],
                "cards": [card("draft", draft=d, guessed=sorted(guessed), notes=p["notes"], question=None)]}
    chk = bookings.check(t.db, ds, v, full, t.user)
    place = chk.get("placement") or {}
    if not chk["valid"]:
        reply = "This can't be sent as it is: " + "; ".join(chk["violations"]) + "."
    elif place.get("status") == "approved":
        reply = (f"The rule checker would approve this right now: {place['room_id']}, "
                 f"{when(ds, place['day'], place['start_period'], place['end_period'])}. Send the request?")
    elif place.get("status") == "pending_approval":
        reply = (f"It fits in {place['room_id']}, {when(ds, place['day'], place['start_period'], place['end_period'])}, "
                 "but needs an approver to confirm. Send the request?")
    elif place.get("room_id"):
        reply = (f"Your exact slot is taken; the checker would offer {place['room_id']}, "
                 f"{when(ds, place['day'], place['start_period'], place['end_period'])} instead. Send the request?")
    else:
        reply = f"As it stands this would be rejected: {place.get('reason') or 'no room fits'}."
    for x in [place] + chk["alternatives"]:
        if x and x.get("day") and x.get("start_period"):
            x["when"] = when(ds, x["day"], x["start_period"], x["end_period"])
    return {"reply": reply, "understood": chips, "draft_text": text, "_llm": p["llm"],
            "cards": [card("preview", draft=full, guessed=sorted(guessed), notes=p["notes"], check=chk)],
            "suggestions": _tweaks(ds, full)}


def _tweaks(ds: Dataset, d: dict) -> list[str]:
    """Follow-ups that change one thing about this draft (never one it already has)."""
    w = d["windows"][0]
    out = [f"Make it {3 if d['duration_periods'] == 2 else 2} hours"]
    if "projector" not in d["needs"]:
        out.append("Add a projector")
    other = next((x for x in ("FRI", "THU", "WED") if x in ds.days and x != w["day"]), None)
    if other:
        out.append(f"Try {DAY[other]} instead")
    return out


def _request_row(ds: Dataset, r: dict) -> dict:
    d = r.get("decision") or {}
    slot = when(ds, d["day"], d["start_period"], d["end_period"]) if d.get("day") and d.get("start_period") else None
    return {"id": r["id"], "title": r["title"], "status": r["status"], "reason": r["reason"], "when": slot,
            "room": d.get("room_id"), "attendance": r["attendance"], "can_cancel": r["can_cancel"],
            "approver": r.get("approver")}


def booking_status(t: Turn) -> dict:
    row, ds = state.active_dataset(t.db)
    v = state.active_version(t.db, row)
    rid = t.found["request_id"] or ((t.focus or {}).get("id") if (t.focus or {}).get("kind") == "request" else None)
    if rid:
        r = bookings.get_request(t.db, ds, v, t.user, rid)
        row_ = _request_row(ds, r)
        reply = f"{r['id']}, {r['title']}: {STATUS.get(r['status'], r['status'])}." + (f" {r['reason']}" if r["reason"] else "")
        sugg = [f"Cancel {r['id']}"] if r["can_cancel"] else []
        return {"reply": reply, "understood": [chip("Booking status"), chip(rid)],
                "cards": [card("requests", items=[row_])], "suggestions": sugg + ["Show all my requests"]}
    mine = bookings.list_requests(t.db, ds, v, t.user, mine=True)
    if not mine:
        return {"reply": "You haven't sent any venue requests yet.", "understood": [chip("Booking status")],
                "suggestions": ["Book the seminar hall Friday 4 to 6 pm for 80 people", "Free halls tomorrow evening"]}
    counts: dict[str, int] = {}
    for r in mine:
        counts[STATUS.get(r["status"], r["status"])] = counts.get(STATUS.get(r["status"], r["status"]), 0) + 1
    reply = f"You have {len(mine)} request{'s' if len(mine) != 1 else ''}: " + ", ".join(f"{n} {k}" for k, n in counts.items()) + "."
    return {"reply": reply, "understood": [chip("Booking status"), chip("All my requests")],
            "cards": [card("requests", items=[_request_row(ds, r) for r in mine[-8:][::-1]])],
            "suggestions": [f"Why was {r['id']} {STATUS[r['status']]}?" for r in mine[-2:] if r["status"] in STATUS][:2]}


def cancel_booking(t: Turn) -> dict:
    row, ds = state.active_dataset(t.db)
    v = state.active_version(t.db, row)
    rid = t.found["request_id"] or ((t.focus or {}).get("id") if (t.focus or {}).get("kind") == "request" else None)
    if not rid:
        open_ = [r for r in bookings.list_requests(t.db, ds, v, t.user, mine=True) if r["can_cancel"]]
        return {"reply": "Which request?" if open_ else "You have no requests that can be cancelled.",
                "understood": [chip("Cancel a request")], "suggestions": [f"Cancel {r['id']}" for r in open_[:3]]}
    r = bookings.get_request(t.db, ds, v, t.user, rid)
    if not r["can_cancel"]:
        return {"reply": f"{rid} can't be cancelled: it is {STATUS.get(r['status'], r['status'])}"
                         + ("" if r["status"] in ("cancelled", "rejected", "declined") else " and isn't yours") + ".",
                "understood": [chip("Cancel a request"), chip(rid)]}
    return {"reply": f"Cancelling {rid} frees its slot and re-decides the other requests. Confirm to cancel.",
            "understood": [chip("Cancel a request"), chip(rid)], "cards": [card("confirm_cancel", request=_request_row(ds, r))]}


# ---------------------------------------------------------------- timetable
def _session(t: Turn, ds: Dataset, assign) -> str | None:
    focus = (t.focus or {}).get("id") if (t.focus or {}).get("kind") == "session" else None
    cid = t.found["course_id"]
    if focus in assign and (not cid or ds.sessions[focus]["course_id"] == cid):
        return focus
    if not cid:
        return None
    text = t.body.text.lower()
    cands = [sid for sid, s in ds.sessions.items() if s["course_id"] == cid and sid in assign]
    for word, kind in (("lab", "lab"), ("tutorial", "tutorial"), ("lecture", "lecture")):
        if word in text and any(ds.sessions[s]["kind"] == kind for s in cands):
            cands = [s for s in cands if ds.sessions[s]["kind"] == kind]
    groups = [g for g in ds.groups if g.lower() in text]
    if groups:
        cands = [s for s in cands if set(ds.sessions[s]["groups"]) & set(groups)] or cands
    days = [code for code, name in DAY.items() if name.lower() in text or f" {code.lower()} " in f" {text} "]
    if days:
        cands = [s for s in cands if assign[s][0] in days] or cands
    if t.user.faculty_id:
        cands = [s for s in cands if ds.sessions[s]["faculty_id"] == t.user.faculty_id] or cands
    cands.sort(key=lambda s: (ds.days.index(assign[s][0]), assign[s][1]))
    return cands[0] if cands else None


def _can_move(user: User, ds: Dataset, sid: str) -> bool:
    if user.role == "admin":
        return True
    if user.role == "faculty":
        return ds.sessions[sid]["faculty_id"] == user.faculty_id
    return user.role == "coordinator" and course_dept(ds, sid) == user.department


def _session_card(t: Turn, ds: Dataset, assign, sid: str) -> tuple[dict, dict]:
    s = ds.sessions[sid]
    ex = explain_session(ds, assign, sid)
    at = ex["placed_at"]
    opts = sorted((a for a in ex["alternatives"] if not a["blocked_by"] and a["room"]),
                  key=lambda a: (a["soft_delta"], a["day"] != at["day"], ds.days.index(a["day"]), a["start"]))
    options = [{"day": a["day"], "start": a["start"], "room": a["room"], "soft_delta": a["soft_delta"],
                "when": when(ds, a["day"], a["start"], a["start"] + s["duration"] - 1)} for a in opts[:5]]
    head = {"session_id": sid, "course_id": s["course_id"], "title": course_titles(ds).get(s["course_id"], s["course_id"]),
            "kind": s["kind"], "groups": s["groups"], "faculty": ds.faculty.get(s["faculty_id"], {}).get("name", s["faculty_id"]),
            "when": when(ds, at["day"], at["start"], at["start"] + s["duration"] - 1), "day": at["day"],
            "start": at["start"], "room": at["room"], "can_move": _can_move(t.user, ds, sid)}
    return head, {"facts": ex["facts"], "options": options, "blocked": sum(1 for a in ex["alternatives"] if a["blocked_by"]),
                  "total": len(ex["alternatives"]) + 1}


def explain(t: Turn) -> dict:
    ds, v = _version(t)
    assign = state.to_assign(v.assignments)
    sid = _session(t, ds, assign)
    if not sid:
        return {"reply": "Which class? Name the course, like CS101, or open a session in the timetable and ask again.",
                "understood": [chip("Explain a class")], "suggestions": ["Why is CS101 on Monday?", "Where is PH191 lab?"]}
    head, ex = _session_card(t, ds, assign, sid)
    reply = (f"{head['course_id']} {head['kind']} for {', '.join(head['groups'])} is on {head['when']} in {head['room']}. "
             f"{ex['blocked']} of the {ex['total']} possible slots break a hard rule; this one has the least soft penalty "
             "the solver could find.")
    return {"reply": reply, "understood": [chip("Explain a class"), chip(head["course_id"]), chip(sid)],
            "cards": [card("explain", **head, facts=ex["facts"], options=ex["options"][:3], blocked=ex["blocked"],
                           total=ex["total"])],
            "suggestions": [f"Other slots for {head['course_id']}", "Take me to the timetable"]}


def alternatives(t: Turn) -> dict:
    ds, v = _version(t)
    assign = state.to_assign(v.assignments)
    sid = _session(t, ds, assign)
    if not sid:
        return {"reply": "Which class should I find other slots for? Name the course, like CS101.",
                "understood": [chip("Find another slot")], "suggestions": ["Other slots for CS101"]}
    head, ex = _session_card(t, ds, assign, sid)
    n = len(ex["options"])
    reply = (f"{n} valid slot{'s' if n != 1 else ''} for {head['course_id']} {head['kind']} ({', '.join(head['groups'])}), "
             "cheapest in soft penalty first." if n else f"No other slot for {head['course_id']} keeps every hard rule right now.")
    if n and head["can_move"]:
        reply += " Asking to move one sends it to the Admin as a proposal."
    return {"reply": reply, "understood": [chip("Find another slot"), chip(head["course_id"]), chip(sid)],
            "cards": [card("alternatives", **head, options=ex["options"])],
            "suggestions": [f"Why is {head['course_id']} where it is?"]}


# ---------------------------------------------------------------- approvals and proposals
def approvals(t: Turn) -> dict:
    row, ds = state.active_dataset(t.db)
    v = state.active_version(t.db, row)
    if t.user.role in ("admin", "coordinator"):
        items = pending_for(t.db, t.user, v)
        n = len(items)
        reply = (f"{n} item{'s' if n != 1 else ''} waiting for you." if n else "Nothing is waiting for your approval.")
        return {"reply": reply, "understood": [chip("Approvals"), chip("Waiting for me")],
                "cards": [card("approvals", items=items[:8], total=n, mine=False)],
                "suggestions": ["Take me to approvals"] if n else ["Show change proposals"]}
    mine = [{"kind": "booking", "id": r["id"], "title": r["title"], "requested_by": "you", "created_at": r["submitted_at"]}
            for r in bookings.list_requests(t.db, ds, v, t.user, mine=True) if r["status"] == "pending_approval"]
    mine += [{"kind": "change", "id": str(p.id), "title": p.title, "requested_by": "you", "created_at": p.created_at}
             for p in proposals.visible(t.db, t.user, "pending") if p.requested_by == t.user.id]
    reply = ("Your account doesn't approve anything; coordinators and the Admin do. "
             + (f"{len(mine)} of your requests {'is' if len(mine) == 1 else 'are'} waiting on them." if mine else
                "None of your requests is waiting on them."))
    return {"reply": reply, "understood": [chip("Approvals"), chip("My requests waiting")],
            "cards": [card("approvals", items=mine, total=len(mine), mine=True)] if mine else []}


def _proposal(o: dict) -> dict:
    keys = ("id", "title", "status", "kind", "moved", "time_changed", "room_only", "added", "removed", "soft_before",
            "soft_after", "hard_count", "proven_minimal", "stale")
    return {k: o.get(k) for k in keys}


def disruptions(t: Turn) -> dict:
    pid = t.found["proposal_id"] or (int(t.focus["id"]) if (t.focus or {}).get("kind") == "proposal"
                                     and str(t.focus["id"]).isdigit() else None)
    ps = [proposals.to_out(t.db, p, t.user) for p in proposals.visible(t.db, t.user)]
    if pid is not None:
        one = next((p for p in ps if p["id"] == pid), None)
        if not one:
            return {"reply": f"I can't find proposal #{pid} among the ones you can see.",
                    "understood": [chip("Change proposals"), chip(f"#{pid}")]}
        p = _proposal(one)
        reply = (f"#{p['id']} {p['title']}: " + ("there is no valid fix." if p["status"] == "infeasible" else
                 f"moves {p['moved']} session{'s' if p['moved'] != 1 else ''} ({p['time_changed']} to new times, "
                 f"{p['room_only']} rooms only), soft penalty {p['soft_before']} → {p['soft_after']}"
                 + (", proven minimal" if p["proven_minimal"] else "") + f". It is {PROPOSAL_STATUS.get(p['status'], p['status'])}.")
                 + (" The timetable has changed since, so it needs re-checking." if p["stale"] else ""))
        return {"reply": reply, "understood": [chip("Change proposals"), chip(f"#{p['id']}")],
                "cards": [card("proposals", items=[p], detail=True)], "suggestions": ["Show all proposals"]}
    if not ps:
        return {"reply": "There are no change proposals yet.", "understood": [chip("Change proposals")],
                "suggestions": ["Take me to changes"] if "/changes" in ROLE_PAGES[t.user.role] else []}
    waiting = sum(1 for p in ps if p["status"] == "pending")
    reply = f"{len(ps)} proposal{'s' if len(ps) != 1 else ''}, {waiting} waiting for the Admin. Newest first."
    items = sorted(ps, key=lambda p: -p["id"])[:6]
    return {"reply": reply, "understood": [chip("Change proposals")],
            "cards": [card("proposals", items=[_proposal(p) for p in items], detail=False)],
            "suggestions": [f"Explain proposal #{items[0]['id']}"]}


def unavailable(t: Turn) -> dict:
    """"I'm on leave tomorrow": prepare the same unavailability change the agent would, for them to confirm."""
    from . import velo_tools     # it imports this module
    chips = [chip("Can't teach")]
    if t.user.role not in velo_tools.TEACHING:
        return {"reply": "Leave is handled for teaching staff. To move a venue booking, cancel it and book another slot.",
                "understood": chips, "suggestions": ["What happened to my requests?"]}
    ds, v = _version(t)
    p = parse_change(ds, state.to_assign(v.assignments), t.body.text, t.user.faculty_id, t.body.today)
    it = p["intent"]
    if not it or it["type"] != "faculty_unavailable":
        return {"reply": p["follow_up"] or "Which day(s) can't you teach?", "understood": chips, "_llm": p["llm"],
                "suggestions": ["Tomorrow, the whole day", "Friday 10 to 12"]}
    chips += [chip(", ".join(DAY[d] for d in it["days"])), chip(f"P{min(it['periods'])}–P{max(it['periods'])}")]
    ctx = velo_tools.Ctx(t.db, t.user, t.body.conversation_id)
    try:
        out = velo_tools.create_change_proposal(ctx, velo_tools.ChangeArgs(
            type="faculty_unavailable", faculty=it["faculty_id"], days=it["days"], periods=it["periods"],
            reason=it["reason"]))
    except velo_tools.ToolError as e:
        return {"reply": str(e) + ".", "understood": chips, "_llm": p["llm"]}
    hit = out.data["affected_sessions"]
    if not hit:     # nothing to repair: don't leave a card that would send an empty change
        t.db.rollback()
        return {"reply": f"You have no classes {', '.join(DAY[d] for d in it['days'])} in that time, so nothing needs "
                         "to move.", "understood": chips, "_llm": p["llm"]}
    reply = (f"{len(hit)} of your sessions fall{'s' if len(hit) == 1 else ''} in that time"
             f" ({', '.join(hit)}). Press Send to Admin and the repair solver will propose the fewest moves; nothing "
             "changes until the Admin approves.")
    return {"reply": reply, "understood": chips, "cards": out.cards, "_llm": p["llm"]}


# ---------------------------------------------------------------- navigation and help
def navigate(t: Turn) -> dict:
    path = route.PAGES.get(t.found.get("page") or "", None)
    if not path:
        return help_(t)
    label = PAGE_LABEL[path]
    if path not in ROLE_PAGES[t.user.role]:
        return {"reply": f"Your account doesn't have {label}.", "understood": [chip("Go to"), chip(label)]}
    return {"reply": f"Opening {label}.", "understood": [chip("Go to"), chip(label)], "navigate": path,
            "cards": [card("navigate", path=path, label=label)]}


CAN = {"find_rooms": ("Find free rooms", "Free rooms tomorrow 2 to 4 for 40"),
       "book_venue": ("Draft a venue booking", "Book the seminar hall Friday 4 to 6 pm for 80 people"),
       "booking_status": ("Check your requests", "What happened to my requests?"),
       "explain_session": ("Explain where a class is", "Why is CS101 on Monday?"),
       "alternatives": ("Find other slots for a class", "Other slots for PH101"),
       "approvals": ("See what's waiting for approval", "What's waiting for me?"),
       "proposals": ("Understand disruption proposals", "Explain the latest proposal"),
       "navigate": ("Open any page", "Take me to exams")}


def help_(t: Turn) -> dict:
    keys = ["find_rooms", "book_venue", "booking_status", "explain_session", "alternatives", "approvals", "proposals",
            "navigate"]
    if t.user.role == "club":
        keys.remove("alternatives")
    caps = [{"label": CAN[k][0], "example": CAN[k][1]} for k in keys]
    return {"reply": "I can find rooms, draft and check venue bookings, explain the timetable and show what's waiting. "
                     "I never change anything without showing you first.",
            "understood": [chip("Help")], "cards": [card("help", items=caps)],
            "suggestions": [c["example"] for c in caps[:3]]}


HANDLERS = {"find_rooms": find_rooms, "book_venue": book_venue, "booking_status": booking_status,
            "cancel_booking": cancel_booking, "explain_session": explain, "alternatives": alternatives,
            "approvals": approvals, "proposals": disruptions, "unavailable": unavailable, "navigate": navigate,
            "help": help_}


def answer(db: Session, user: User, body: VeloIn) -> dict:
    focus = body.focus.model_dump() if body.focus else None
    booking_open = body.last_intent == "book_venue" and bool(body.draft_text)
    c = route.classify(body.text, body.page, focus, booking_open)
    turn = Turn(db, user, body, focus, c)
    try:
        out = HANDLERS[c["intent"]](turn)
    except ApiError as e:       # no timetable yet, unknown request id, not yours: say so in the thread
        out = {"reply": e.message, "understood": [chip(c["intent"].replace("_", " ").capitalize())],
               "suggestions": ["What can you do?"]}
    used_model = c["mode"] == "model" or out.pop("_llm", None) == "ok"
    out.pop("_llm", None)
    return {"intent": c["intent"], "cards": [], "suggestions": [], "draft_text": None, "navigate": None, **out,
            "mode": "model" if used_model else "keywords"}
