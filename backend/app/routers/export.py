from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import require_roles
from ..config import settings
from ..core.checker import full_report
from ..core.export import build_schedule
from ..db import get_db
from ..errors import not_found
from ..models import DatasetRow, TimetableVersion, User
from ..services import state
from ..solver.exams import ExamResult

router = APIRouter(tags=["export"])


def _pick(db: Session, after: bool, version: int | None) -> TimetableVersion:
    if version is not None:
        v = db.get(TimetableVersion, version)
    elif after:
        v = state.active_version(db)
    else:   # the most recent freshly generated timetable (before any change file)
        v = db.scalar(select(TimetableVersion).where(TimetableVersion.kind == "generated")
                      .order_by(TimetableVersion.id.desc()))
    if v is None:
        raise not_found("No timetable to export yet. Generate one first.")
    return v


def schedule_for(db: Session, v: TimetableVersion, with_exams: bool = True) -> dict:
    row = db.get(DatasetRow, v.dataset_fk)
    ds = state.dataset_of(db, row)
    ex = state.latest_exams(db, row) if with_exams else None
    exams = ExamResult("stored", ex.exams, ex.penalty) if ex else None
    return build_schedule(ds, state.to_assign(v.assignments), state.fest_of(v), exams, settings.team_name)


@router.get("/export/schedule.json")
def export(after: bool = Query(False), version: int | None = None, report: bool = Query(False),
           db: Session = Depends(get_db), _: User = Depends(require_roles("admin"))):
    """schedule.json in the starter-pack format. after=1 exports the timetable after the latest approved
    change (exams optional there), after=0 the generated one. report=1 adds our checker's report."""
    v = _pick(db, after, version)
    sched = schedule_for(db, v)
    name = "schedule_after.json" if after else "schedule.json"
    if report:
        ds = state.dataset_of(db, db.get(DatasetRow, v.dataset_fk))
        return {"schedule": sched, "report": full_report(ds, sched)}
    return JSONResponse(sched, headers={"Content-Disposition": f'attachment; filename="{name}"'})
