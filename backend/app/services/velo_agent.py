"""Velo's agent: the model reads the conversation, picks tools, and writes a short grounded reply.

Conversation manager: a server-side thread per person (velo_conversations), the last WINDOW messages sent as
history, older ones folded into a one-paragraph summary, and a small memory of what is being discussed (room, day,
periods, course, request) taken from the tools' own arguments, so follow-ups resolve against real ids. Context
resolver: role, department and faculty id come from the account, the page and open item from the request.
Orchestration: at most AGENT_MAX_STEPS model rounds; every call goes through velo_tools.run (validation,
permission, the real services). Cards come from the tools, never from the model's text.

run() returns None when the model can't be reached before any tool ran; the caller then answers with the
keyword rules, so Velo keeps working without a model."""
import json
import secrets
import time
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..llm import chat
from ..llm.client import LLMUnavailable, prompt
from ..models import User, VeloConversation, VeloMessage
from ..schemas import VeloIn
from . import state, velo_tools
from .velo import PAGE_LABEL, chip

WINDOW = 8
RESULT_CHARS = 6000
MEMORY_KEYS = ("room_id", "day", "from_period", "to_period", "attendance", "course_id", "session_id", "request_id",
               "group_id", "faculty_id", "proposal_id")
LABEL = {"get_my_timetable": "Your timetable", "get_faculty_schedule": "Faculty timetable",
         "get_group_schedule": "Group timetable", "find_available_rooms": "Room availability",
         "get_room_details": "Room details", "get_room_occupancy": "Room occupancy",
         "get_booking_status": "Booking status", "get_pending_approvals": "Approvals",
         "get_schedule_conflicts": "Conflicts", "get_exam_schedule": "Exams", "get_spectra_decisions": "Spectra week",
         "get_room_utilisation": "Room utilisation", "get_faculty_workload": "Workload",
         "explain_scheduling_decision": "Explain a class", "list_change_proposals": "Change proposals",
         "compare_schedule_versions": "Before and after", "simulate_disruption": "What-if",
         "generate_analytics_report": "Report", "create_booking_draft": "Booking draft",
         "cancel_booking": "Cancel a request", "create_change_proposal": "Change request",
         "decide_request": "Decision", "navigate_to_page": "Go to"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(t: datetime) -> datetime:
    return t if t.tzinfo else t.replace(tzinfo=timezone.utc)


def conversation(db: Session, user: User, cid: str | None) -> VeloConversation:
    """The person's thread, or a fresh one when there is none, it isn't theirs, or it has been idle too long."""
    c = db.get(VeloConversation, cid) if cid else None
    if c is not None and c.user_id == user.id and _aware(c.updated_at) > _now() - timedelta(minutes=settings.velo_context_ttl_min):
        return c
    c = VeloConversation(id="c_" + secrets.token_urlsafe(12), user_id=user.id, memory={}, summary="")
    db.add(c)
    db.flush()
    return c


def history(db: Session, c: VeloConversation) -> list[VeloMessage]:
    rows = db.scalars(select(VeloMessage).where(VeloMessage.conversation_id == c.id)
                      .order_by(VeloMessage.id.desc()).limit(WINDOW))
    return list(rows)[::-1]


def _summarise(db: Session, c: VeloConversation) -> None:
    """Fold messages that have left the window into the summary: what was asked and which tools answered."""
    rows = list(db.scalars(select(VeloMessage).where(VeloMessage.conversation_id == c.id).order_by(VeloMessage.id)))
    old = rows[:-WINDOW] if len(rows) > WINDOW else []
    done = c.memory.get("_summarised", 0)
    new = [m for m in old if m.id > done]
    if not new:
        return
    bits = []
    for m in new:
        if m.role == "user":
            bits.append(f"asked \"{m.content[:90]}\"")
        elif m.payload.get("tools"):
            bits.append("Velo used " + ", ".join(m.payload["tools"]))
    c.summary = ("; ".join(x for x in [c.summary] + bits if x))[-900:]
    c.memory = {**c.memory, "_summarised": new[-1].id}


def _who(db: Session, user: User) -> str:
    parts = [f"{user.name} ({user.email}), role: {user.role}"]
    if user.department:
        parts.append(f"department: {user.department}")
    if user.faculty_id:
        parts.append(f"faculty id: {user.faculty_id}")
    if user.role == "club":
        parts.append("a club representative: books venues for the club")
    return ", ".join(parts)


def system_prompt(db: Session, user: User, body: VeloIn, c: VeloConversation) -> str:
    _, ds = state.active_dataset(db)
    cal = ds.calendar
    periods = ", ".join(f"P{p['id']} {p['start']}–{p['end']}" for p in cal.get("periods", []))
    feats = sorted({f for r in ds.rooms.values() for f in r["features"]})
    groups = ", ".join(ds.groups)
    mem = {k: v for k, v in (c.memory or {}).items() if not k.startswith("_")}
    memory = ("Earlier: " + c.summary + "\n" if c.summary else "") + \
             ("Currently discussing: " + json.dumps(mem) if mem else "Nothing yet.")
    focus = ""
    if body.focus:
        focus = f" They have {body.focus.kind} {body.focus.id} open on the page."
    page = PAGE_LABEL.get(body.page.split("?")[0].rstrip("/") or "/", body.page)
    return prompt("velo_agent").format(
        institute=ds.raw.get("institute", "the institute"), who=_who(db, user), today=body.today or "unknown",
        page=page, focus=focus, priority=" > ".join(ds.priority_order), days=", ".join(ds.days), periods=periods,
        room_types=", ".join(sorted({r["type"] for r in ds.rooms.values()})), features=", ".join(feats),
        groups=groups, memory=memory)


def _args(raw) -> dict | None:
    if isinstance(raw, dict):
        return raw
    try:
        v = json.loads(raw or "{}")
    except (TypeError, json.JSONDecodeError):
        return None
    return v if isinstance(v, dict) else None


def _raw(a) -> str:
    return a if isinstance(a, str) else json.dumps(a or {})


def run(db: Session, user: User, body: VeloIn) -> dict | None:
    t0 = time.monotonic()
    c = conversation(db, user, body.conversation_id)
    past = history(db, c)
    messages = [{"role": "system", "content": system_prompt(db, user, body, c)}]
    messages += [{"role": m.role, "content": m.content} for m in past]
    messages.append({"role": "user", "content": body.text})
    tools = [velo_tools.schema(t) for t in velo_tools.offered(user)]
    ctx = velo_tools.Ctx(db, user, c.id, body.today)

    used, cards, errors, memory, nav = [], [], [], {}, None
    seen: dict[str, str] = {}
    reply, failed = None, False
    for step in range(settings.agent_max_steps + 1):
        last = step == settings.agent_max_steps
        try:
            msg = chat.chat(messages, [] if last else tools)
        except LLMUnavailable:
            if not used:
                db.rollback()
                return None
            failed = True
            break
        calls = (msg.get("tool_calls") or []) if not last else []
        if not calls:
            reply = (msg.get("content") or "").strip()
            break
        ids = [tc.get("id") or f"call_{step}_{i}" for i, tc in enumerate(calls)]
        messages.append({"role": "assistant", "content": msg.get("content") or "", "tool_calls": [
            {"id": ids[i], "type": "function",
             "function": {"name": tc["function"]["name"], "arguments": _raw(tc["function"].get("arguments"))}}
            for i, tc in enumerate(calls)]})
        for i, tc in enumerate(calls):
            name = tc["function"]["name"]
            raw = tc["function"].get("arguments")
            args = _args(raw)
            key = f"{name}:{json.dumps(args, sort_keys=True)}"
            if args is None:
                content = json.dumps({"error": f"Arguments for {name} were not valid JSON"})
            elif key in seen:        # the same call twice in one turn: answer from the first result, run nothing
                content = seen[key]
            else:
                out = velo_tools.run(ctx, name, args)
                content = json.dumps(out.data, default=str)[:RESULT_CHARS]
                seen[key] = content
                used.append(name)
                if "error" in out.data:
                    errors.append(out.data["error"])
                cards += out.cards
                memory.update({k: v for k, v in out.memory.items() if k in MEMORY_KEYS and v is not None})
                nav = out.navigate or nav
            messages.append({"role": "tool", "tool_call_id": ids[i], "content": content})

    if not reply:
        if failed:
            reply = "I got the details below but couldn't finish writing the answer. Ask again if you need more."
        elif errors and not cards:
            reply = errors[-1]
        else:
            reply = "Here's what I found." if cards else "I couldn't work that out. Could you say it another way?"

    c.memory = {**(c.memory or {}), **memory}
    db.add(VeloMessage(conversation_id=c.id, role="user", content=body.text, payload={"page": body.page}))
    db.add(VeloMessage(conversation_id=c.id, role="assistant", content=reply,
                       payload={"tools": used, "cards": cards, "errors": errors}))
    db.flush()
    _summarise(db, c)
    c.updated_at = _now()
    db.commit()
    chips = [chip(LABEL.get(n, n)) for n in dict.fromkeys(used)]
    return {"intent": used[0] if used else "chat", "understood": chips, "reply": reply, "cards": cards,
            "suggestions": [], "draft_text": None, "navigate": nav, "mode": "agent", "conversation_id": c.id,
            "tools": used, "latency_ms": int((time.monotonic() - t0) * 1000)}


def messages_of(db: Session, user: User, cid: str) -> list[dict]:
    c = db.get(VeloConversation, cid)
    if c is None or c.user_id != user.id:
        return []
    rows = db.scalars(select(VeloMessage).where(VeloMessage.conversation_id == cid).order_by(VeloMessage.id))
    return [{"role": m.role, "content": m.content, "cards": m.payload.get("cards", []), "at": m.created_at}
            for m in rows]
