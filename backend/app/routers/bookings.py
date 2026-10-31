from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..auth import current_user, require_roles
from ..core.explain import explain_booking
from ..db import get_db
from ..errors import forbidden, not_found
from ..models import User
from ..schemas import (BookingCheckOut, BookingDecideIn, BookingDraft, BookingOut, BookingSubmitOut,
                       ExplainBookingOut, FestOut, FestSummary)
from ..services import bookings, state

router = APIRouter(tags=["bookings"])


def _ctx(db: Session):
    row, ds = state.active_dataset(db)
    return row, ds, state.require_version(db, row)


@router.post("/bookings/check", response_model=BookingCheckOut)
def check(draft: BookingDraft, db: Session = Depends(get_db), user: User = Depends(current_user)):
    """What the code would decide for this request right now. Saves nothing; works without the LLM."""
    _, ds, v = _ctx(db)
    return bookings.check(db, ds, v, draft.model_dump(), user)


@router.post("/bookings", response_model=BookingSubmitOut)
def submit(draft: BookingDraft, db: Session = Depends(get_db), user: User = Depends(current_user)):
    _, ds, v = _ctx(db)
    ids = bookings.submit(db, ds, v, draft.model_dump(), user)
    db.commit()
    mine = {r["id"]: r for r in bookings.list_requests(db, ds, v, user, mine=True)}
    return BookingSubmitOut(request_ids=ids, bookings=[mine[i] for i in ids if i in mine])


@router.get("/bookings", response_model=list[BookingOut])
def list_bookings(mine: bool = Query(False), db: Session = Depends(get_db), user: User = Depends(current_user)):
    row, ds = state.active_dataset(db)
    return bookings.list_requests(db, ds, state.active_version(db, row), user, mine=mine)


@router.post("/bookings/{request_id}/cancel", response_model=BookingOut)
def cancel(request_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    row, ds = state.active_dataset(db)
    v = state.active_version(db, row)
    bookings.cancel(db, ds, v, request_id, user)
    db.commit()
    return bookings.get_request(db, ds, v, user, request_id)


@router.post("/bookings/{request_id}/decide", response_model=BookingOut)
def decide(request_id: str, body: BookingDecideIn, db: Session = Depends(get_db),
           user: User = Depends(require_roles("admin", "coordinator"))):
    _, ds, v = _ctx(db)
    bookings.decide(db, ds, v, request_id, user, body.action, body.note)
    db.commit()
    return bookings.get_request(db, ds, v, user, request_id)


@router.post("/fest/decide-all", response_model=FestSummary)
def decide_all(db: Session = Depends(get_db), user: User = Depends(require_roles("admin"))):
    _, ds, v = _ctx(db)
    bookings.redecide(db, ds, v, user)
    db.commit()
    return bookings.summary(db, ds, v)


@router.get("/fest", response_model=FestOut)
def fest_board(db: Session = Depends(get_db), user: User = Depends(current_user)):
    row, ds = state.active_dataset(db)
    v = state.active_version(db, row)
    f = state.fest_of(v)
    rooms = sorted(r["id"] for r in ds.rooms.values() if "event" in r["allowed_uses"])
    return FestOut(version_id=v.id if v else None, decided=f is not None,
                   summary=bookings.summary(db, ds, v) if f else None,
                   requests=bookings.list_requests(db, ds, v, user), overrides=f.overrides if f else [], rooms=rooms)


@router.get("/explain/booking/{request_id}", response_model=ExplainBookingOut)
def explain(request_id: str, words: bool = Query(False), db: Session = Depends(get_db),
            user: User = Depends(current_user)):
    row, ds = state.active_dataset(db)
    v = state.active_version(db, row)
    f = state.fest_of(v)
    live = {b.id: b for b in bookings.live_requests(db)}
    if request_id in live and user.role != "admin" and live[request_id].created_by != user.id and not (
            user.role == "coordinator" and live[request_id].approver == user.department):
        raise forbidden("You can only see the reasons for your own requests")
    if f is None or request_id not in {d.request_id for d in f.decisions}:
        raise not_found(f"{request_id} has not been decided yet")
    out = explain_booking(ds, f, request_id)
    if words:
        from ..llm.reword import reword
        out["words"] = reword([out["reason"]] + out["facts"])
    return out
