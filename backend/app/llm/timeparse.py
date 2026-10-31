"""Clock times, vague times and relative days -> the dataset's days and periods. Pure code."""
from datetime import datetime, timedelta, timezone

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


def today_code(ds: Dataset, today: str | None) -> str:
    """The reference weekday for "kal"/"tomorrow": what the user picked, else the real weekday
    (Monday on a weekend, since Spectra week is MON-FRI)."""
    if today and today.upper()[:3] in ds.days:
        return today.upper()[:3]
    code = WEEK[datetime.now(IST).weekday()]
    return code if code in ds.days else ds.days[0]


def resolve_relative(ds: Dataset, rel: str, today: str) -> str | None:
    shift = {"today": 0, "tomorrow": 1, "day_after": 2}.get(rel)
    if shift is None:
        return None
    i = ds.days.index(today) + shift
    return ds.days[i] if i < len(ds.days) else None
