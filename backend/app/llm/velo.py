"""Velo's router: a message -> what the person wants, plus the ids it names.

Keyword rules go first because they are instant and predictable for the common phrasings; the model is
asked only when the rules can't place a message, and if it is unavailable the rules' best guess stands.
Nothing here answers anything: services/velo.py does that with the same code the pages use."""
import re

from . import client

INTENTS = ["find_rooms", "book_venue", "booking_status", "cancel_booking", "explain_session", "alternatives",
           "approvals", "proposals", "navigate", "help"]
PAGES = {"overview": "/", "timetable": "/timetable", "exams": "/exams", "spectra": "/spectra", "changes": "/changes",
         "approvals": "/approvals", "rooms": "/rooms", "book": "/book", "data": "/data", "settings": "/settings"}

COURSE = re.compile(r"\b([A-Z]{2,3}\d{3}[A-Z]?)\b")
REQUEST = re.compile(r"\b(BR-?\d+[A-Z]?|APP-?\d{1,4})\b", re.I)
PROPOSAL = re.compile(r"(?:#|\bproposal\s*#?\s*|\bchange\s*#\s*)(\d{1,5})\b", re.I)

# page words, most specific first; "timetable" also answers "schedule" and "my classes"
_PAGE_WORDS = [("approvals", r"approv"), ("exams", r"\bexam|midsem"), ("spectra", r"spectra|fest|decision board"),
               ("changes", r"\bchanges?\b|disruption|proposal"), ("rooms", r"find a room|room finder|\brooms? page"),
               ("book", r"book a venue|booking form|booking page"), ("data", r"\bdata\b|export|upload"),
               ("settings", r"settings|priority order|preferences"), ("timetable", r"timetable|schedule|my classes"),
               ("overview", r"overview|dashboard|home")]

_GO = r"\b(go to|goto|open|take me|navigate|jump to|show me the|bring up|le chalo|kholo)\b"
_CANCEL = r"\b(cancel|withdraw|call off|hatao|remove my)\b"
_STATUS = r"\b(status|what happened|kya hua|approved|rejected|my requests?|my bookings?|did (it|my|we) get|where is my)\b"
_APPROVALS = r"\b(approv\w*|pending|waiting for me|to review|my inbox|sign off)\b"
_PROPOSALS = r"\b(disruption|proposals?|repair|change requests?|leave|unavailab\w*|moved sessions?)\b"
_ALTS = r"\b(alternatives?|another (slot|time)|other (slots?|times?)|reschedul\w*|move (it|this|my|the)|shift|kahan aur)\b"
_WHY = r"\b(why|explain|reason|kyun|kyon|how come|where is|when is|when does|allocat\w*|placed)\b"
_FREE = r"\b(free|available|empty|vacant|khali|unused|open)\b"
_PLACE = r"\b(rooms?|halls?|labs?|venues?|classrooms?|auditorium|space|spaces|jagah)\b"
_BOOK = r"\b(book|reserve|booking|chahiye|need a (room|hall|venue|space|lab)|organi[sz]e|host)\b"
_HELP = r"^\s*(hi|hello|hey|namaste|help|what can you do|who are you|kya kar sakte)\b"


def _has(pat: str, t: str) -> bool:
    return re.search(pat, t) is not None


def ids(text: str) -> dict:
    up = text.upper()
    c, r, p = COURSE.search(up), REQUEST.search(text), PROPOSAL.search(text)
    rid = r.group(1).upper() if r else None
    if rid and "-" not in rid:          # BR03 -> BR-03, APP2 -> APP-0002
        head = "APP" if rid.startswith("APP") else "BR"
        num = rid[len(head):]
        rid = f"APP-{int(num):04d}" if head == "APP" else f"BR-{num}"
    return {"course_id": c.group(1) if c and not (r and c.group(1) in up[r.start():r.end()]) else None,
            "request_id": rid, "proposal_id": int(p.group(1)) if p else None}


def page_in(text: str) -> str | None:
    t = text.lower()
    return next((name for name, pat in _PAGE_WORDS if _has(pat, t)), None)


def rules(text: str, focus: dict | None, booking_open: bool) -> str | None:
    """The intent the keywords make clear, or None when they don't."""
    t = " " + text.lower() + " "
    found = ids(text)
    if _has(_HELP, text.lower()):
        return "help"
    if _has(_GO, t) and page_in(text):
        return "navigate"
    if _has(_CANCEL, t) and (found["request_id"] or _has(r"\b(request|booking)\b", t)):
        return "cancel_booking"
    if found["request_id"] or _has(_STATUS, t) and _has(r"\b(requests?|bookings?|venue|my)\b", t):
        return "booking_status"
    if _has(_APPROVALS, t) and not _has(r"\bmy (request|booking)", t):
        return "approvals"
    if found["proposal_id"] or _has(_PROPOSALS, t):
        return "proposals"
    session = found["course_id"] or (focus or {}).get("kind") == "session"
    if session and _has(_ALTS, t):
        return "alternatives"
    if session and (_has(_WHY, t) or found["course_id"] and not _has(_BOOK, t)):
        return "explain_session"
    if _has(_FREE, t) and _has(_PLACE, t) or _has(r"\bwhich rooms?\b|\bany rooms?\b|koi room", t):
        return "find_rooms"
    if _has(_BOOK, t):
        return "book_venue"
    if booking_open and _has(r"\d|\b(hour|ghant|people|log|students|tomorrow|kal|today|aaj|morning|evening|shaam|"
                             r"mon|tue|wed|thu|fri|yes|no|any time|hall|room|projector|mic|stage)", t):
        return "book_venue"
    return None


SCHEMA = {"type": "OBJECT", "properties": {
    "intent": {"type": "STRING", "enum": INTENTS},
    "course_id": {"type": "STRING", "nullable": True},
    "request_id": {"type": "STRING", "nullable": True},
    "proposal_id": {"type": "INTEGER", "nullable": True},
    "page": {"type": "STRING", "enum": list(PAGES), "nullable": True}}, "required": ["intent"]}


def classify(text: str, page: str, focus: dict | None, booking_open: bool) -> dict:
    """{intent, course_id, request_id, proposal_id, page, mode}. mode is "keywords" when no model was used."""
    found = ids(text)
    intent = rules(text, focus, booking_open)
    if intent:
        return {**found, "intent": intent, "page": page_in(text) if intent == "navigate" else None, "mode": "keywords"}
    context = f"Page: {page}. Open on the page: {focus or 'nothing'}. Booking in progress: {'yes' if booking_open else 'no'}."
    try:
        raw = client.ask(client.prompt("velo"), f"{context}\nMessage: {text}", SCHEMA)
    except client.LLMUnavailable:
        return {**found, "intent": "book_venue" if booking_open else "help", "page": None, "mode": "keywords"}
    intent = raw.get("intent") if raw.get("intent") in INTENTS else "help"
    page_name = raw.get("page") if raw.get("page") in PAGES else None
    if intent == "navigate" and not page_name:
        intent = "help"
    out = {"intent": intent, "page": page_name, "mode": "model"}
    # ids the model read are trusted only if they look like ids; the message's own matches win
    for key, pat in (("course_id", COURSE), ("request_id", REQUEST)):
        v = found[key] or (str(raw.get(key) or "").upper() or None)
        out[key] = v if v and pat.fullmatch(v) else found[key]
    pid = raw.get("proposal_id")
    out["proposal_id"] = found["proposal_id"] or (pid if isinstance(pid, int) and pid > 0 else None)
    return out
