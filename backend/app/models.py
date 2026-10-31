"""Database tables. Scheduling state is kept as JSON next to the version it belongs to; the engine works
in memory and only results that pass core/checker.py are saved."""
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


def now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    role: Mapped[str] = mapped_column(String(20))            # admin | coordinator | faculty | club
    department: Mapped[str | None] = mapped_column(String(20), nullable=True)
    faculty_id: Mapped[str | None] = mapped_column(String(20), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(100))


class DatasetRow(Base):
    __tablename__ = "datasets"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    dataset_id: Mapped[str] = mapped_column(String(80))
    data: Mapped[dict] = mapped_column(JSON)                  # starter-pack format, changes already applied
    applied_changes: Mapped[list] = mapped_column(JSON, default=list)
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("datasets.id"), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    loaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class TimetableVersion(Base):
    __tablename__ = "timetable_versions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    dataset_fk: Mapped[int] = mapped_column(ForeignKey("datasets.id"))
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("timetable_versions.id"), nullable=True)
    kind: Mapped[str] = mapped_column(String(20))             # generated | change | manual
    status: Mapped[str] = mapped_column(String(20), index=True)   # active | archived
    assignments: Mapped[dict] = mapped_column(JSON)            # session id -> [day, start, room]
    fest: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # {decisions, overrides} for Week 7
    soft: Mapped[dict] = mapped_column(JSON, default=dict)
    soft_total: Mapped[int] = mapped_column(Integer, default=0)
    hard_count: Mapped[int] = mapped_column(Integer, default=0)
    solver_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    solve_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class ExamSchedule(Base):
    __tablename__ = "exam_schedules"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    dataset_fk: Mapped[int] = mapped_column(ForeignKey("datasets.id"))
    exams: Mapped[list] = mapped_column(JSON)
    penalty: Mapped[int] = mapped_column(Integer, default=0)
    solve_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class BookingRequest(Base):
    """A venue request made in the app (ids APP-0001...). Dataset requests live in the dataset itself."""
    __tablename__ = "booking_requests"
    id: Mapped[str] = mapped_column(String(20), primary_key=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    data: Mapped[dict] = mapped_column(JSON)                   # same shape as a dataset booking request
    status: Mapped[str] = mapped_column(String(30), index=True)
    # approved | alternative_offered | rejected | pending_approval | cancelled | declined
    decision: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    approver: Mapped[str | None] = mapped_column(String(20), nullable=True)   # department code or "admin"
    confirmed: Mapped[dict | None] = mapped_column(JSON, nullable=True)       # placement a person approved
    decided_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    decision_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class ChangeProposal(Base):
    __tablename__ = "change_proposals"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    kind: Mapped[str] = mapped_column(String(20))              # file | request | unavailability | manual
    title: Mapped[str] = mapped_column(String(200))
    payload: Mapped[dict] = mapped_column(JSON)                # change file ({"changes": [...]}) or manual move
    base_version: Mapped[int] = mapped_column(ForeignKey("timetable_versions.id"))
    status: Mapped[str] = mapped_column(String(20), index=True)   # pending | approved | rejected | infeasible
    proposed: Mapped[dict | None] = mapped_column(JSON, nullable=True)   # session id -> [day, start, room]
    fest: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    diff: Mapped[list] = mapped_column(JSON, default=list)
    moved: Mapped[int] = mapped_column(Integer, default=0)
    time_changed: Mapped[int] = mapped_column(Integer, default=0)
    room_only: Mapped[int] = mapped_column(Integer, default=0)
    added: Mapped[int] = mapped_column(Integer, default=0)
    removed: Mapped[int] = mapped_column(Integer, default=0)
    soft_before: Mapped[int] = mapped_column(Integer, default=0)
    soft_after: Mapped[int] = mapped_column(Integer, default=0)
    hard_count: Mapped[int] = mapped_column(Integer, default=0)
    proven_minimal: Mapped[bool] = mapped_column(Boolean, default=False)
    conflicts: Mapped[list] = mapped_column(JSON, default=list)
    alternatives: Mapped[list] = mapped_column(JSON, default=list)
    requested_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    decided_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    decision_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class AuditLog(Base):
    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    actor: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    action: Mapped[str] = mapped_column(String(60))
    entity: Mapped[str] = mapped_column(String(60))
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Setting(Base):
    __tablename__ = "settings"
    key: Mapped[str] = mapped_column(String(60), primary_key=True)
    value: Mapped[dict | list] = mapped_column(JSON)
