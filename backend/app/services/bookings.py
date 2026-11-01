"""Spectra-week venue requests: dataset requests plus the ones made in the app, decided together.

Code decides every booking (solver/fest.py, checked by core/checker.py). A person only steps in where
the problem statement asks: a coordinator confirms a booking of their department's lab, and nobody
confirms their own request (the Admin does instead)."""
import dataclasses
import threading
from dataclasses import asdict
from datetime import datetime, timedelta, timezone

from sqlalchemy import event, select, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from ..auth import DATASET_ROLE
from ..config import settings
from ..core.checker import _room_feats, check_booking, check_fest, free_rooms, week_view
from ..core.model import MAX_PERIOD, Dataset
from ..core.priority import effective_category
from ..errors import ApiError, bad_request, forbidden, not_found
from ..models import BookingRequest, TimetableVersion, User
from ..solver.fest import CAT_LABEL, Decision, FestResult, decide_fest
from . import state

IST = timezone(timedelta(hours=5, minutes=30))
CLOSED = ("cancelled", "declined")


# ---------------------------------------------------------------- building requests
def validate_draft(ds: Dataset, d: dict) -> list[str]:
    """Problems with the request itself (before any room or time is considered)."""
    out = []
    types = {r["type"] for r in ds.rooms.values() if "event" in r["allowed_uses"]}
    feats = set().union(*(_room_feats(r) for r in ds.rooms.values()))
    for w in d["windows"]:
        if w["day"] not in ds.days:
            out.append(f"{w['day']} is not a Spectra-week day ({', '.join(ds.days)})")
        if w["to_period"] < w["from_period"]:
            out.append(f"Window {w['day']} ends (P{w['to_period']}) before it starts (P{w['from_period']})")
        elif w["to_period"] - w["from_period"] + 1 < d["duration_periods"]:
            out.append(f"Window {w['day']} P{w['from_period']}–P{w['to_period']} is shorter than "
                       f"{d['duration_periods']} period(s)")
    for day in d.get("repeat_days", []):
        if day not in ds.days:
            out.append(f"Repeat day {day} is not a Spectra-week day")
    bad_types = [t for t in d["room_types"] if t not in types]
    if bad_types:
        out.append(f"No bookable rooms of type {', '.join(bad_types)} (bookable: {', '.join(sorted(types))})")
    bad_needs = [n for n in d["needs"] if n not in feats]
    if bad_needs:
        out.append(f"No room has {', '.join(bad_needs)} (rooms offer: {', '.join(sorted(feats))})")
    if d.get("requested_room") and d["requested_room"] not in ds.rooms:
        out.append(f"There is no room called {d['requested_room']}")
    bad_groups = [g for g in d["mandatory_for_groups"] if g not in ds.groups]
    if bad_groups:
        out.append(f"Unknown student group(s): {', '.join(bad_groups)}")
    return out


def as_request(d: dict, user: User, rid: str, submitted_at: str, series_id: str | None = None) -> dict:
    return {"id": rid, "submitted_at": submitted_at, "requester": user.name, "role": DATASET_ROLE[user.role],
            "department": user.department, "requested_category": d["requested_category"], "title": d["title"],
            "attendance": d["attendance"], "duration_periods": d["duration_periods"],
            "windows": [dict(w) for w in d["windows"]], "room_types": list(d["room_types"]),
            "needs": list(d["needs"]), "requested_room": d.get("requested_room") or None,
            "mandatory_for_groups": list(d["mandatory_for_groups"]), "series_id": series_id,
            "raw_text": d.get("raw_text"), "week": d.get("week") or "spectra"}


# ---------------------------------------------------------------- the booking queue
QUEUE_KEY = 74_200_001        # names the queue's Postgres lock; any fixed number no other code uses
QUEUE_WAIT_S = 120
_local_turn = threading.Lock()


def take_turn(db: Session) -> None:
    """Booking writes take turns, in the order they arrive: each waits until the one before it has
    committed, so it decides with every request made so far and two people can't both get one room.

    On Postgres the turn is a transaction-level advisory lock, held across every server instance until
    commit or rollback (it works behind Neon's pooled connection too). On SQLite (one local process) it is
    a lock released when the transaction ends. Taking it twice in one transaction is a no-op."""
    if db.info.get("booking_turn"):
        return
    db.connection()      # the turn belongs to this transaction, so start it now
    if db.get_bind().dialect.name == "postgresql":
        try:
            db.execute(text(f"SET LOCAL lock_timeout = '{QUEUE_WAIT_S}s'"))
            db.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": QUEUE_KEY})
        except OperationalError:
            raise _busy() from None
        db.info["booking_turn"] = "pg"
    else:
        if not _local_turn.acquire(timeout=QUEUE_WAIT_S):
            raise _busy()
        db.info["booking_turn"] = "local"


def _busy() -> ApiError:
    return ApiError(503, "busy", "Bookings are busy deciding other requests. Try again in a minute.")


@event.listens_for(Session, "after_transaction_end")
def _end_turn(session: Session, transaction) -> None:
    if transaction.parent is None and session.info.pop("booking_turn", None) == "local":
        _local_turn.release()


def _ids(db: Session, n: int) -> list[str]:
    nums = [int(i.split("-")[1]) for i in db.scalars(select(BookingRequest.id)) if i.startswith("APP-")]
    start = max(nums, default=0) + 1
    return [f"APP-{k:04d}" for k in range(start, start + n)]


def _submitted_at(db: Session, ds: Dataset) -> str:
    """Now (IST), but never earlier than anything already submitted: priority ties go to the earlier
    submission, so a new request must not jump ahead of the dataset's (dated in the future) ones."""
    latest = max([r["submitted_at"] for r in ds.requests.values()] +
                 [b.data["submitted_at"] for b in db.scalars(select(BookingRequest))], default="")
    t = datetime.now(IST).replace(microsecond=0)
    if latest:
        floor = datetime.fromisoformat(latest) + timedelta(seconds=1)
        t = max(t, floor.astimezone(IST))
    return t.isoformat()


def live_requests(db: Session) -> list[BookingRequest]:
    return list(db.scalars(select(BookingRequest).order_by(BookingRequest.id)))


def extras(db: Session, week: str = "spectra") -> list[dict]:
    """Open app requests for one week: Spectra week (decided with the dataset's requests) or a regular week."""
    return [b.data for b in live_requests(db) if b.status not in CLOSED and b.data.get("week", "spectra") == week]


def _regular(ds: Dataset) -> Dataset:
    """The dataset without its Spectra requests: a regular week has only the app's own requests."""
    return dataclasses.replace(ds, requests={})


def decide_regular(db: Session, ds: Dataset, version: TimetableVersion) -> FestResult:
    """Decide regular-week requests by the same priority order, against the normal timetable. App
    requests never move a class, so classes always keep their rooms."""
    assign = state.to_assign(version.assignments)
    extra = extras(db, "regular")
    res = decide_fest(_regular(ds), assign, extra_requests=extra, time_limit_s=10)
    viol = check_fest(_with_extras(_regular(ds), extra), assign, [asdict(d) for d in res.decisions], res.overrides)[0]
    if viol:
        raise ApiError(500, "check_failed", "Regular-week booking decisions failed the hard-rule check",
                       {"violations": [asdict(v) for v in viol[:30]]})
    apply_to_requests(db, ds, res)
    db.flush()
    return res


# ---------------------------------------------------------------- deciding
def _with_extras(ds: Dataset, extra: list[dict]) -> Dataset:
    return dataclasses.replace(ds, requests={**ds.requests, **{r["id"]: r for r in extra}})


def verify(ds: Dataset, assign, fest: FestResult, extra: list[dict]) -> dict:
    """Run every decision (dataset and app requests) through the checker. Raises if any fails."""
    viol, warn, stats = check_fest(_with_extras(ds, extra), assign, [asdict(d) for d in fest.decisions], fest.overrides)
    if viol:
        raise ApiError(500, "check_failed", "Booking decisions failed the hard-rule check; nothing was saved",
                       {"violations": [asdict(v) for v in viol[:30]]})
    ds_stats = check_fest(ds, assign, [asdict(d) for d in fest.decisions if d.request_id in ds.requests],
                          fest.overrides)[2]
    return {**stats, "dataset_booking_score": ds_stats["booking_score"],
            "dataset_booking_score_max": ds_stats["booking_score_max_if_all_approved"],
            "dataset_inversions": ds_stats["priority_inversions"]}


def _approver(db: Session, ds: Dataset, b: BookingRequest, d: Decision, owner: User | None) -> str | None:
    """Who has to confirm this placement, or None if the code's decision stands on its own."""
    if d.status not in ("approved", "alternative_offered") or not d.room_id:
        return None
    owners = state.get_settings(db, ds)["lab_owners"].get(d.room_id, [])
    if not owners:
        return None
    if owner is not None and owner.role == "coordinator" and owner.department in owners:
        return "admin"                      # nobody approves their own request
    return owners[0]


def apply_to_requests(db: Session, ds: Dataset, fest: FestResult) -> None:
    by_id = {d.request_id: d for d in fest.decisions}
    for b in live_requests(db):
        if b.status in CLOSED:
            continue
        d = by_id.get(b.id)
        if d is None:
            continue
        b.decision = asdict(d)
        approver = _approver(db, ds, b, d, db.get(User, b.created_by))
        placement = {"room_id": d.room_id, "day": d.day, "start_period": d.start_period}
        if approver and b.confirmed != placement:
            b.status, b.approver = "pending_approval", approver
        else:
            b.status, b.approver = d.status, (approver if approver else None)


def redecide(db: Session, ds: Dataset, version: TimetableVersion, user: User | None) -> tuple[FestResult, dict]:
    """Decide every Spectra request against the active timetable and save the result on that version."""
    take_turn(db)
    assign = state.to_assign(version.assignments)
    extra = extras(db)
    cache = dict((version.fest or {}).get("cache") or {})
    fest = decide_fest(ds, assign, extra_requests=extra, time_limit_s=min(settings.solver_time_limit_s, 30), cache=cache)
    stats = verify(ds, assign, fest, extra)
    version.fest = {**state.fest_to_json(fest), "cache": cache}
    apply_to_requests(db, ds, fest)
    decide_regular(db, ds, version)
    state.audit(db, user, "fest.decide", f"version:{version.id}",
                {"approved": stats["approved"], "alternatives": stats["alternatives"], "rejected": stats["rejected"]})
    db.flush()
    return fest, stats


def adopt(db: Session, ds: Dataset, version: TimetableVersion, raw: dict | None, user: User | None) -> None:
    """Use decisions already computed for this timetable (by the repair that proposed it) if they still
    cover exactly the open app requests and pass the checker; otherwise decide again."""
    take_turn(db)
    fest = state.fest_from(raw)
    extra = extras(db)
    if fest is not None and {r["id"] for r in extra} == {d.request_id for d in fest.decisions
                                                       if d.request_id not in ds.requests}:
        try:
            verify(ds, state.to_assign(version.assignments), fest, extra)
        except ApiError:
            fest = None
        else:
            version.fest = state.fest_to_json(fest)
            apply_to_requests(db, ds, fest)
            decide_regular(db, ds, version)
            db.flush()
            return
    redecide(db, ds, version, user)


def summary(db: Session, ds: Dataset, version: TimetableVersion | None) -> dict | None:
    fest = state.fest_of(version)
    if fest is None:
        return None
    extra = extras(db)
    viol, _, stats = check_fest(_with_extras(ds, extra), state.to_assign(version.assignments),
                                [asdict(d) for d in fest.decisions], fest.overrides)
    ds_stats = check_fest(ds, state.to_assign(version.assignments),
                          [asdict(d) for d in fest.decisions if d.request_id in ds.requests], fest.overrides)[2]
    pending = sum(1 for b in live_requests(db) if b.status == "pending_approval")
    return {"approved": stats["approved"], "alternatives": stats["alternatives"], "rejected": stats["rejected"],
            "pending": pending, "overrides": len(fest.overrides), "booking_score": ds_stats["booking_score"],
            "booking_score_max": ds_stats["booking_score_max_if_all_approved"],
            "priority_inversions": stats["priority_inversions"], "hard_count": len(viol)}


# ---------------------------------------------------------------- views
def _out(ds: Dataset, req: dict, source: str, status: str, decision: dict | None, user: User,
         b: BookingRequest | None = None) -> dict:
    cat = effective_category(ds, req)
    reason = (decision or {}).get("reason", "")
    if b is not None and b.status == "cancelled":
        reason = "Cancelled by requester"
    elif b is not None and b.status == "declined":
        reason = f"Declined: {b.decision_note}" if b.decision_note else "Declined by the approver"
    elif b is not None and b.status == "pending_approval":
        who = "the Admin" if b.approver == "admin" else f"the {b.approver} coordinator"
        reason = f"Waiting for {who} to confirm: {reason}"
    can_decide = bool(b is not None and b.status == "pending_approval" and b.created_by != user.id and (
        user.role == "admin" or (user.role == "coordinator" and user.department == b.approver)))
    return {"id": req["id"], "source": source, "title": req["title"], "requester": req["requester"],
            "role": req["role"], "department": req.get("department"),
            "requested_category": req["requested_category"], "category": cat, "attendance": req["attendance"],
            "duration_periods": req["duration_periods"], "windows": req["windows"], "room_types": req["room_types"],
            "needs": req["needs"], "requested_room": req.get("requested_room"),
            "mandatory_for_groups": req.get("mandatory_for_groups", []), "series_id": req.get("series_id"),
            "raw_text": req.get("raw_text"), "submitted_at": req["submitted_at"],
            "week": req.get("week", "spectra"), "status": status,
            "reason": reason, "decision": decision, "approver": b.approver if b else None,
            "can_cancel": bool(b is not None and b.status not in CLOSED and
                               (b.created_by == user.id or user.role == "admin")),
            "can_decide": can_decide}


def owns_dataset_request(user: User, req: dict) -> bool:
    """A request in the dataset that this account stands for: a club by its name, a coordinator by
    department, a faculty member by the id in the requester ("Dr. Amit Behera (F12)")."""
    role = req.get("role")
    if user.role == "club":
        return role == "club" and req.get("requester") == user.name
    if user.role == "coordinator":
        return role == "department_coordinator" and req.get("department") == user.department
    if user.role == "faculty" and user.faculty_id:
        return role == "faculty" and f"({user.faculty_id})" in (req.get("requester") or "")
    return False


def list_requests(db: Session, ds: Dataset, version: TimetableVersion | None, user: User,
                  mine: bool = False) -> list[dict]:
    """All requests, or with `mine` the user's own: dataset requests they stand for first, then the
    ones they made in the app (oldest first, so the newest is last)."""
    fest = state.fest_of(version)
    dec = {d.request_id: asdict(d) for d in fest.decisions} if fest else {}
    out = []
    for rid, req in ds.requests.items():
        if mine and not owns_dataset_request(user, req):
            continue
        d = dec.get(rid)
        status = d["status"] if d else ("rejected" if rid in ds.cancelled else "submitted")
        if not d and rid in ds.cancelled:
            d = {"request_id": rid, "status": "rejected", "reason": "Cancelled by requester"}
        out.append(_out(ds, req, "dataset", status, d, user))
    for b in live_requests(db):
        visible = (user.role == "admin" or b.created_by == user.id or not mine or
                   (user.role == "coordinator" and b.approver == user.department))
        if mine and b.created_by != user.id:
            continue
        if visible:
            out.append(_out(ds, b.data, "app", b.status, b.decision, user, b))
    return out


def get_request(db: Session, ds: Dataset, version, user: User, rid: str) -> dict:
    for r in list_requests(db, ds, version, user):
        if r["id"] == rid:
            return r
    raise not_found(f"No booking request {rid}")


# ---------------------------------------------------------------- check / submit / cancel / decide
def check(db: Session, ds: Dataset, version: TimetableVersion, draft: dict, user: User) -> dict:
    """What would happen to this request if it were submitted now. Pure code, nothing is saved."""
    req = as_request(draft, user, "DRAFT", _submitted_at(db, ds))
    cat = effective_category(ds, req)
    note = None
    if cat != req["requested_category"]:
        note = (f"A {req['role'].replace('_', ' ')} can claim at most {CAT_LABEL[cat]}, so this is treated as a "
                f"{CAT_LABEL[cat]}")
    problems = validate_draft(ds, draft)
    if problems:
        return {"valid": False, "category": cat, "category_note": note, "placement": None,
                "violations": problems, "alternatives": [], "free_rooms": []}
    assign = state.to_assign(version.assignments)
    regular = req["week"] == "regular"
    extra = extras(db, req["week"])
    fest = decide_fest(_regular(ds) if regular else ds, assign, extra_requests=extra + [req], time_limit_s=10,
                       cache=None if regular else dict((version.fest or {}).get("cache") or {}))
    mine = next(d for d in fest.decisions if d.request_id == "DRAFT")
    others = FestResult([d for d in fest.decisions if d.request_id != "DRAFT"], fest.overrides)
    view = week_view(ds, assign, fest.overrides)
    taken = [{"room_id": d.room_id, "day": d.day, "start_period": d.start_period, "end_period": d.end_period,
              "request_id": d.request_id} for d in others.decisions if d.room_id and d.status != "rejected"]
    w = draft["windows"][0]
    a, b = w["from_period"], min(w["from_period"] + draft["duration_periods"] - 1, MAX_PERIOD)
    violations = []
    if req["requested_room"]:
        trial = {**req, "room_id": req["requested_room"], "day": w["day"], "start_period": a, "end_period": b}
        violations = [v.detail.split(": ", 1)[1] for v in check_booking(ds, view, trial, taken)]
    if mine.status != "approved":
        violations.append(mine.reason)
    rooms = free_rooms(ds, view, taken, w["day"], a, b, draft["attendance"], draft["needs"], draft["room_types"])
    alts = []
    for win in draft["windows"]:
        for s0 in range(win["from_period"], win["to_period"] - draft["duration_periods"] + 2):
            e0 = s0 + draft["duration_periods"] - 1
            for rid in free_rooms(ds, view, taken, win["day"], s0, e0, draft["attendance"], draft["needs"],
                                  draft["room_types"]):
                if (rid, win["day"], s0) != (mine.room_id, mine.day, mine.start_period):
                    alts.append({"request_id": "DRAFT", "status": "approved", "day": win["day"], "start_period": s0,
                                 "end_period": e0, "room_id": rid, "reason": "Free now"})
                if len(alts) >= 3:
                    break
            if len(alts) >= 3:
                break
    return {"valid": True, "category": cat, "category_note": note, "placement": asdict(mine),
            "violations": violations, "alternatives": alts, "free_rooms": rooms}


def submit(db: Session, ds: Dataset, version: TimetableVersion, draft: dict, user: User) -> list[str]:
    problems = validate_draft(ds, draft)
    if problems:
        raise bad_request(problems[0], {"problems": problems})
    take_turn(db)
    days = [d for d in draft.get("repeat_days", []) if d != draft["windows"][0]["day"]]
    drafts = [draft]
    for day in days:     # "every Mon and Wed": one linked request per extra day, same times
        drafts.append({**draft, "windows": [{**w, "day": day} for w in draft["windows"][:1]]})
    ids = _ids(db, len(drafts))
    series = ids[0] if len(drafts) > 1 else None
    for rid, d in zip(ids, drafts):
        db.add(BookingRequest(id=rid, created_by=user.id, data=as_request(d, user, rid, _submitted_at(db, ds), series),
                              status="submitted"))
        db.flush()
    state.audit(db, user, "booking.submit", ",".join(ids), {"title": draft["title"]})
    redecide(db, ds, version, user)
    return ids


def _live(db: Session, rid: str) -> BookingRequest:
    b = db.get(BookingRequest, rid)
    if b is None:
        raise not_found(f"No booking request {rid} made in the app" + (" (dataset requests can't be changed here)"
                                                                       if not rid.startswith("APP-") else ""))
    return b


def cancel(db: Session, ds: Dataset, version: TimetableVersion | None, rid: str, user: User) -> None:
    take_turn(db)
    b = _live(db, rid)
    if b.created_by != user.id and user.role != "admin":
        raise forbidden("Only the person who made a request can cancel it")
    if b.status in CLOSED:
        raise ApiError(409, "conflict", f"{rid} is already {b.status}")
    b.status = "cancelled"
    state.audit(db, user, "booking.cancel", rid)
    db.flush()
    if version is not None:
        redecide(db, ds, version, user)


def decide(db: Session, ds: Dataset, version: TimetableVersion, rid: str, user: User, action: str, note: str) -> None:
    take_turn(db)
    b = _live(db, rid)
    if b.status != "pending_approval":
        raise ApiError(409, "conflict", f"{rid} is not waiting for approval (it is {b.status.replace('_', ' ')})")
    if b.created_by == user.id:
        raise forbidden("You can't approve or reject your own request")
    if not (user.role == "admin" or (user.role == "coordinator" and user.department == b.approver)):
        who = "the Admin" if b.approver == "admin" else f"the {b.approver} coordinator or the Admin"
        raise forbidden(f"Only {who} can decide {rid}")
    d = b.decision or {}
    b.decided_by, b.decision_note = user.id, note or None
    if action == "approve":
        b.confirmed = {"room_id": d.get("room_id"), "day": d.get("day"), "start_period": d.get("start_period")}
        b.status = d.get("status", "approved")
    else:
        b.status = "declined"
    state.audit(db, user, f"booking.{action}", rid, {"note": note})
    db.flush()
    redecide(db, ds, version, user)

