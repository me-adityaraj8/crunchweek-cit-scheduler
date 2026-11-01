"""Clock times, vague times and relative days -> the dataset's days and periods. Pure code."""
import re
from datetime import date, datetime, timedelta, timezone

from ..core.model import Dataset

HINTS = {"morning": (1, 5), "afternoon": (6, 9), "after_lunch": (6, 9), "evening": (10, 13), "night": (10, 13)}
WEEK = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]
IST = timezone(timedelta(hours=5, minutes=30))


def _mins(t: str) -> int | None:
    try:
        h, m = t.strip().split(":")
        return int(h) * 60 + int(m)
    except (ValueError, AttributeError):
        return None


def _periods(ds: Dataset) -> list[tuple[int, int, int]]:
    out = []
    for p in ds.calendar.get("periods", []):
        a, b = _mins(p["start"]), _mins(p["end"])
        if a is not None and b is not None:
            out.append((p["id"], a, b))
    return out or [(i, (7 + i) * 60 if i <= 5 else (8 + i) * 60, (8 + i) * 60 if i <= 5 else (9 + i) * 60)
                   for i in range(1, 14)]


def start_period(ds: Dataset, t: str) -> int | None:
    m = _mins(t)
    if m is None:
        return None
    ps = _periods(ds)
    for pid, a, b in ps:
        if a <= m < b:
            return pid
    later = [pid for pid, a, _ in ps if a >= m]      # e.g. 13:30 (lunch) -> the first period after it
    return min(later) if later else None


def end_period(ds: Dataset, t: str) -> int | None:
    m = _mins(t)
    if m is None:
        return None
    done = [pid for pid, a, b in _periods(ds) if b <= m]
    return max(done) if done else None


SHIFT = {"today": 0, "tomorrow": 1, "day_after": 2}
NAMES = {"MON": "Monday", "TUE": "Tuesday", "WED": "Wednesday", "THU": "Thursday", "FRI": "Friday",
         "SAT": "Saturday", "SUN": "Sunday"}


def now() -> datetime:
    """The real time at the institute. Tests replace this to pin a date."""
    return datetime.now(IST)


def today_code(ds: Dataset, today: str | None) -> str:
    """The reference weekday for "kal"/"tomorrow": what the user picked, else the real weekday, weekends
    included (on a Sunday, tomorrow is Monday)."""
    if today and today.upper()[:3] in ds.days:
        return today.upper()[:3]
    return WEEK[now().weekday()]


def relative_weekday(rel: str, today: str) -> str | None:
    """The weekday a relative day lands on, whether or not it is a teaching day."""
    shift = SHIFT.get(rel)
    if shift is None or today not in WEEK:
        return None
    return WEEK[(WEEK.index(today) + shift) % 7]


def resolve_relative(ds: Dataset, rel: str, today: str) -> str | None:
    """A relative day as one of the dataset's days, or None when it lands on a day off (a weekend)."""
    code = relative_weekday(rel, today)
    return code if code in ds.days else None


# Hindi typed in Devanagari, as the Hinglish the keyword rules already read
DEVANAGARI = {"परसों": "parso", "कल": "kal", "आज": "aaj", "सुबह": "subah", "दोपहर": "dopahar", "शाम": "shaam",
              "रात": "raat", "चाहिए": "chahiye", "लोगों": "logon", "लोग": "log", "बजे": "baje", "घंटे": "ghante",
              "घंटा": "ghanta", "सेमिनार": "seminar", "हॉल": "hall", "हाल": "hall", "कमरा": "room", "कमरे": "rooms",
              "खाली": "khali", "स्पेक्ट्रा": "spectra", "वीक": "week", "से": "se", "तक": "tak", "के लिए": "ke liye",
              "ऑडिटोरियम": "auditorium", "लैब": "lab", "प्रोजेक्टर": "projector", "है": "hai", "क्या": "kya"}
_DIGITS = str.maketrans("०१२३४५६७८९", "0123456789")
MONTHS = {m: i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov",
                                      "dec"], 1)}
_MONTH = r"(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?"


def romanise(text: str) -> str:
    """Devanagari words and digits -> the Hinglish spelling, so "कल सुबह 10 बजे" reads as "kal subah 10 baje"."""
    out = text.translate(_DIGITS)
    for word in sorted(DEVANAGARI, key=len, reverse=True):
        out = out.replace(word, f" {DEVANAGARI[word]} ")
    return re.sub(r"[ \t]+", " ", out).strip()


def date_weekday(text: str) -> str | None:
    """The weekday of a calendar date in the text ("4th November", "Nov 4", "4/11", "04-11-2026"), or None.
    Without a year it is this year's date, or next year's if that one is more than a week gone."""
    t = text.lower()
    m = (re.search(rf"\b(\d{{1,2}})(?:st|nd|rd|th)?(?:\s+of)?\s+{_MONTH}(?:\s+(\d{{4}}))?", t)
         or re.search(rf"\b{_MONTH}\s+(\d{{1,2}})(?:st|nd|rd|th)?(?:,?\s+(\d{{4}}))?", t))
    if m and m.group(1).isdigit():
        day, month, year = int(m.group(1)), MONTHS[m.group(2)[:3]], m.group(3)
    elif m:
        month, day, year = MONTHS[m.group(1)[:3]], int(m.group(2)), m.group(3)
    else:
        # 4/11 or 4/11/26; with dashes only when a year is given, since "2-4" is a time range
        m = re.search(r"\b(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?\b", t) or \
            re.search(r"\b(\d{1,2})-(\d{1,2})-(\d{2,4})\b", t)
        if not m:
            return None
        day, month, year = int(m.group(1)), int(m.group(2)), m.group(3)
        if year and len(year) == 2:
            year = "20" + year
    today = now().date()
    try:
        d = date(int(year) if year else today.year, month, day)
    except ValueError:
        return None
    if not year and d < today - timedelta(days=7):
        d = d.replace(year=d.year + 1)
    return WEEK[d.weekday()]


def day_context(ds: Dataset, today: str | None) -> str:
    """Today's date, the time and what "tomorrow" means, in words for the assistant's prompt."""
    t = now()
    ref = today_code(ds, today)
    parts = [f"{t.strftime('%A')} {t.day} {t.strftime('%B %Y, %H:%M')} IST"]
    if today and ref != WEEK[t.weekday()]:
        parts.append(f"the person set today to {NAMES[ref]} ({ref})")
    if ref not in ds.days:
        parts.append("today is not a teaching day")
    else:
        current = [pid for pid, a, b in _periods(ds) if a <= t.hour * 60 + t.minute < b]
        if not today and current:
            parts.append(f"P{current[0]} is under way, so earlier periods today have passed")
    for rel, label in (("tomorrow", "Tomorrow"), ("day_after", "The day after tomorrow")):
        code = relative_weekday(rel, ref)
        parts.append(f"{label} is {NAMES[code]} ({code})" if code in ds.days
                     else f"{label} is {NAMES[code]}, not a teaching day")
    return ". ".join(parts) + "."
