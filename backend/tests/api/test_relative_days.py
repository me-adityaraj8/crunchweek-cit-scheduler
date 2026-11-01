""""Today", "tomorrow", "kal" and "parso" are worked out from the real date (IST), weekends included."""
from datetime import datetime

import pytest

from backend.app.config import STARTER_DATASET
from backend.app.core.dataset import load_dataset
from backend.app.llm import timeparse
from backend.app.llm.timeparse import IST, day_context, resolve_relative, today_code

DS = load_dataset(STARTER_DATASET)


def at(monkeypatch, y, m, d, hh=10, mm=0):
    monkeypatch.setattr(timeparse, "now", lambda: datetime(y, m, d, hh, mm, tzinfo=IST))


@pytest.mark.parametrize("date, today, tomorrow, day_after", [
    ((2026, 11, 1), None, "MON", "TUE"),     # Sunday: tomorrow is Monday, not Tuesday
    ((2026, 10, 31), None, None, "MON"),     # Saturday: tomorrow is Sunday, off the timetable
    ((2026, 11, 6), "FRI", None, None),      # Friday: the weekend follows
    ((2026, 11, 4), "WED", "THU", "FRI"),
])
def test_relative_days_follow_the_calendar(monkeypatch, date, today, tomorrow, day_after):
    at(monkeypatch, *date)
    ref = today_code(DS, None)
    assert resolve_relative(DS, "today", ref) == today
    assert resolve_relative(DS, "tomorrow", ref) == tomorrow
    assert resolve_relative(DS, "day_after", ref) == day_after


def test_a_picked_reference_day_wins_over_the_clock(monkeypatch):
    at(monkeypatch, 2026, 11, 1)
    assert resolve_relative(DS, "tomorrow", today_code(DS, "WED")) == "THU"


def test_velo_is_told_the_real_date_and_what_tomorrow_is(monkeypatch):
    at(monkeypatch, 2026, 11, 1, 9, 40)
    text = day_context(DS, None)
    assert "Sunday 1 November 2026, 09:40" in text
    assert "Tomorrow is Monday (MON)" in text
    assert "today is not a teaching day" in text.lower()


def test_late_in_the_day_velo_knows_which_periods_have_passed(monkeypatch):
    at(monkeypatch, 2026, 11, 4, 15, 20)
    assert "P7 is under way" in day_context(DS, None)      # 15:20 is inside P7 (15:00–16:00, after lunch)


def test_the_prompt_never_says_today_is_unknown(client, monkeypatch):
    from backend.app.db import SessionLocal
    from backend.app.models import User, VeloConversation
    from backend.app.schemas import VeloIn
    from backend.app.services.velo_agent import system_prompt

    at(monkeypatch, 2026, 11, 1, 9, 40)
    with SessionLocal() as db:
        user = db.query(User).filter_by(email="cse.coord@cit.demo").one()
        prompt = system_prompt(db, user, VeloIn(text="Free rooms tomorrow 2 to 4 for 40 people"),
                               VeloConversation(id="t", user_id=user.id, memory={}, summary=""))
    assert "unknown" not in prompt.split("They are on")[0]
    assert "Tomorrow is Monday (MON)" in prompt


def test_tools_accept_tomorrow_as_a_day(monkeypatch):
    from backend.app.services.velo_tools import _day

    at(monkeypatch, 2026, 11, 1)
    assert _day(DS, "tomorrow") == "MON"
    assert _day(DS, "kal") == "MON"


def test_the_prompt_says_2_to_4_is_afternoon_periods(client, monkeypatch):
    from backend.app.db import SessionLocal
    from backend.app.models import User, VeloConversation
    from backend.app.schemas import VeloIn
    from backend.app.services.velo_agent import system_prompt

    at(monkeypatch, 2026, 11, 1)
    with SessionLocal() as db:
        user = db.query(User).filter_by(email="cse.coord@cit.demo").one()
        prompt = system_prompt(db, user, VeloIn(text="Free rooms tomorrow 2 to 4 for 40 people"),
                               VeloConversation(id="t", user_id=user.id, memory={}, summary=""))
    assert '"2 to 4" is 14:00–16:00, P6–P7' in prompt       # worked out from the period table, lunch included
