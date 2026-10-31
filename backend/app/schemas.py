"""Request and response shapes for the API. The frontend types are generated from these
(openapi.json -> frontend/src/api/types.ts)."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

Role = Literal["admin", "coordinator", "faculty", "club"]
Category = Literal["institute_event", "guest_lecture", "department_event", "club_event"]


# ---------------------------------------------------------------- auth
class UserOut(BaseModel):
    id: int
    email: str
    name: str
    role: Role
    department: str | None = None
    faculty_id: str | None = None


class LoginIn(BaseModel):
    email: str
    password: str


class LoginOut(BaseModel):
    token: str
    user: UserOut


class DemoAccount(BaseModel):
    email: str
    role: Role
    name: str
    description: str


# ---------------------------------------------------------------- shared
class ViolationOut(BaseModel):
    rule: str
    where: str
    detail: str


class ConflictOut(BaseModel):
    code: str
    text: str


class Slot(BaseModel):
    day: str
    start: int
    room: str


class Window(BaseModel):
    day: str
    from_period: int = Field(ge=1, le=13)
    to_period: int = Field(ge=1, le=13)


class WindowOut(BaseModel):
    """A window as stored; dataset requests may run past P13 (and are told so in their reason)."""
    day: str
    from_period: int
    to_period: int


# ---------------------------------------------------------------- data
class Counts(BaseModel):
    rooms: int
    faculty: int
    groups: int
    courses: int
    sessions: int
    booking_requests: int
    exams: int


class RoomOut(BaseModel):
    id: str
    name: str
    building: str | None = None
    type: str
    capacity: int
    features: list[str]
    accessible: bool
    allowed_uses: list[str]


class FacultyOut(BaseModel):
    id: str
    name: str
    department: str
    max_hours_per_day: int


class GroupOut(BaseModel):
    id: str
    name: str
    year: int | None = None
    department: str | None = None
    size: int


class PeriodOut(BaseModel):
    id: int
    start: str
    end: str
    teaching: bool


class SummaryOut(BaseModel):
    dataset_id: str
    institute: str | None = None
    loaded_at: datetime
    applied_changes: int
    counts: Counts
    days: list[str]
    periods: list[PeriodOut]
    lunch_after: int
    rooms: list[RoomOut]
    faculty: list[FacultyOut]
    groups: list[GroupOut]
    room_types: list[str]
    features: list[str]
    departments: list[str]


class DatasetLoaded(BaseModel):
    dataset_id: str
    counts: Counts


# ---------------------------------------------------------------- timetable
class GenerateIn(BaseModel):
    time_limit_s: float | None = Field(default=None, gt=0, le=280)


class GenerateOut(BaseModel):
    version_id: int
    status: str
    hard_count: int
    soft: dict[str, int]
    soft_total: int
    placed: int
    total: int
    solve_ms: int
    fest: "FestSummary | None" = None


class Entry(BaseModel):
    session_id: str
    course_id: str
    course_title: str
    kind: str
    day: str
    start_period: int
    duration: int
    room_id: str
    faculty_id: str
    faculty_name: str
    groups: list[str]
    size: int
    basket_slot: str | None = None
    week7_moved: bool = False           # only in the Spectra-week view: moved for Week 7 by an institute event


class BookingEntry(BaseModel):
    request_id: str
    title: str
    status: str
    day: str
    start_period: int
    end_period: int
    room_id: str
    attendance: int


class TimetableOut(BaseModel):
    version_id: int
    view: str
    id: str
    week: Literal["regular", "spectra"]
    entries: list[Entry]
    bookings: list[BookingEntry] = []


class ManualMoveIn(BaseModel):
    session_id: str
    day: str
    start_period: int
    room_id: str
    reason: str = ""


class ManualMoveOut(BaseModel):
    ok: bool
    violations: list[ViolationOut]
    suggestions: list[Slot]
    proposal_id: int | None = None


class Alternative(BaseModel):
    day: str
    start: int
    room: str | None
    blocked_by: list[str]
    soft_delta: int | None


class ExplainSessionOut(BaseModel):
    session_id: str
    placed_at: dict
    facts: list[str]
    alternatives: list[Alternative]
    words: str | None = None


# ---------------------------------------------------------------- exams
class ExamOut(BaseModel):
    exam_id: str
    day: str
    session: str
    rooms: list[str]
    course_ids: list[str] = []
    groups: list[str] = []
    size: int = 0
    seats: int = 0


class ExamsOut(BaseModel):
    exams: list[ExamOut]
    penalty: int
    hard_count: int
    violations: list[ViolationOut] = []
    total: int
    days: list[str]
    sessions: list[dict]
    solve_ms: int | None = None


# ---------------------------------------------------------------- bookings / Spectra
class BookingDraft(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    attendance: int = Field(ge=1, le=100000)
    duration_periods: int = Field(ge=1, le=13)
    windows: list[Window] = Field(min_length=1)
    room_types: list[str] = Field(min_length=1)
    needs: list[str] = []
    requested_room: str | None = None
    mandatory_for_groups: list[str] = []
    requested_category: Category = "club_event"
    repeat_days: list[str] = []          # "every Mon and Wed": the same window on each of these days
    raw_text: str | None = None


class DecisionOut(BaseModel):
    request_id: str
    status: str
    day: str | None = None
    start_period: int | None = None
    end_period: int | None = None
    room_id: str | None = None
    reason: str = ""
    facts: list[str] = []
    lost_to: str | None = None
    displaces: list[str] = []


class BookingCheckOut(BaseModel):
    valid: bool
    category: str
    category_note: str | None = None
    placement: DecisionOut | None = None     # where the code would put it right now
    violations: list[str]
    alternatives: list[DecisionOut]
    free_rooms: list[str]


class BookingOut(BaseModel):
    id: str
    source: Literal["dataset", "app"]
    title: str
    requester: str
    role: str
    department: str | None = None
    requested_category: str
    category: str
    attendance: int
    duration_periods: int
    windows: list[WindowOut]
    room_types: list[str]
    needs: list[str]
    requested_room: str | None = None
    mandatory_for_groups: list[str] = []
    series_id: str | None = None
    raw_text: str | None = None
    submitted_at: str
    status: str
    reason: str = ""
    decision: DecisionOut | None = None
    approver: str | None = None
    can_cancel: bool = False
    can_decide: bool = False


class BookingSubmitOut(BaseModel):
    request_ids: list[str]
    bookings: list[BookingOut]


class BookingDecideIn(BaseModel):
    action: Literal["approve", "reject"]
    note: str = ""


class FestSummary(BaseModel):
    approved: int
    alternatives: int
    rejected: int
    pending: int
    overrides: int
    booking_score: float
    booking_score_max: float
    priority_inversions: list[str]
    hard_count: int


class FestOut(BaseModel):
    version_id: int | None
    decided: bool
    summary: FestSummary | None
    requests: list[BookingOut]
    overrides: list[dict]
    rooms: list[str]


class ExplainBookingOut(BaseModel):
    request_id: str
    status: str
    reason: str
    facts: list[str]
    lost_to: str | None = None
    displaces: list[str] = []
    placed_at: dict | None = None
    words: str | None = None


# ---------------------------------------------------------------- changes
class Move(BaseModel):
    session_id: str
    course_id: str | None = None
    kind: str | None = None
    groups: list[str] = []
    before: Slot | None
    after: Slot | None


class ProposalOut(BaseModel):
    id: int
    kind: str
    title: str
    status: str
    base_version: int
    stale: bool
    moved: int
    time_changed: int
    room_only: int
    added: int
    removed: int
    soft_before: int
    soft_after: int
    hard_count: int
    proven_minimal: bool
    conflicts: list[ConflictOut]
    alternatives: list[Slot] = []
    diff: list[Move]
    payload: dict
    requested_by: int
    requested_by_name: str
    decided_by_name: str | None = None
    decision_note: str | None = None
    created_at: datetime
    decided_at: datetime | None = None
    can_approve: bool


class ChangeIntent(BaseModel):
    type: Literal["faculty_unavailable", "move_session", "add_session", "remove_session"]
    session_id: str | None = None
    faculty_id: str | None = None
    days: list[str] = []
    periods: list[int] = []
    target: Slot | None = None
    session: dict | None = None
    reason: str = ""


class UnavailabilityIn(BaseModel):
    days: list[str] = Field(min_length=1)
    periods: list[int] = Field(min_length=1)
    reason: str = ""


class DecideIn(BaseModel):
    note: str = ""


# ---------------------------------------------------------------- assistant
class AssistantIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    today: str | None = None              # reference weekday for "kal" / "tomorrow"


class PartialDraft(BaseModel):
    """What the assistant could fill in. Missing fields stay empty for the person to complete."""
    title: str | None = None
    attendance: int | None = None
    duration_periods: int | None = None
    windows: list[Window] = []
    room_types: list[str] = []
    needs: list[str] = []
    requested_room: str | None = None
    mandatory_for_groups: list[str] = []
    requested_category: Category = "club_event"
    repeat_days: list[str] = []
    raw_text: str | None = None


class BookingParseOut(BaseModel):
    draft: PartialDraft
    guessed_fields: list[str]
    notes: list[str]
    follow_up: str | None
    llm: Literal["ok", "unavailable"]
    today: str


class ChangeParseOut(BaseModel):
    intent: ChangeIntent | None
    notes: list[str]
    follow_up: str | None
    llm: Literal["ok", "unavailable"]


# ---------------------------------------------------------------- dashboard / settings / health
class RoomUse(BaseModel):
    room_id: str
    name: str
    type: str
    capacity: int
    used_hours: int
    total_hours: int
    pct: float


class PendingItem(BaseModel):
    kind: Literal["change", "booking"]
    id: str
    title: str
    requested_by: str
    created_at: datetime | None = None


class DashboardOut(BaseModel):
    has_timetable: bool
    version_id: int | None = None
    dataset_id: str
    hard_count: int
    soft: dict[str, int]
    soft_total: int
    placed: int
    total: int
    pending: list[PendingItem]
    conflicts: list[ViolationOut]
    utilisation: list[RoomUse]
    grid: dict[str, dict[str, list[int]]]       # room -> day -> 0/1 per teaching period
    fest: FestSummary | None = None
    exams_scheduled: int
    exams_total: int
    my_requests: int


class FreeRoom(BaseModel):
    id: str
    name: str
    type: str
    capacity: int
    features: list[str]
    accessible: bool


class SettingsOut(BaseModel):
    priority_order: list[str]
    lab_owners: dict[str, list[str]]


class Health(BaseModel):
    ok: bool
    ortools: str
    cpus: int
    solver_workers: int
    solve_ms: int
    db: str
    llm: str


GenerateOut.model_rebuild()
