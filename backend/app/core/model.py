from collections import defaultdict
from dataclasses import dataclass, field

# session id -> (day, start_period, room_id)
Assign = dict[str, tuple[str, int, str]]

DAYS = ("MON", "TUE", "WED", "THU", "FRI")
TEACHING = range(1, 10)
EVENT_PERIODS = range(10, 14)
LAST_TEACHING = 9
MAX_PERIOD = 13
LUNCH_AFTER = 5
LAB_STARTS = frozenset({2, 6})


class DatasetError(ValueError):
    pass


@dataclass
class Dataset:
    raw: dict
    dataset_id: str
    calendar: dict
    priority_order: list[str]
    role_cap: dict[str, str]
    rooms: dict[str, dict]
    faculty: dict[str, dict]
    groups: dict[str, dict]
    sessions: dict[str, dict]
    requests: dict[str, dict]
    cancelled: set[str]
    exams: list[dict]
    fac_un: dict[str, set[tuple[str, int]]] = field(default_factory=lambda: defaultdict(set))
    room_un: dict[str, set[tuple[str, int]]] = field(default_factory=lambda: defaultdict(set))

    @property
    def days(self) -> list[str]:
        return self.calendar.get("days", list(DAYS))

    @property
    def lab_starts(self) -> set[int]:
        return set(self.calendar.get("lab_start_periods", LAB_STARTS))

    @property
    def lunch_after(self) -> int:
        return self.calendar.get("lunch", {}).get("after_period", LUNCH_AFTER)


def block(start: int, duration: int) -> list[int]:
    return list(range(start, start + duration))
