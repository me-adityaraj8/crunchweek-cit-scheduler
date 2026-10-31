from dataclasses import asdict

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..auth import current_user, require_roles
from ..config import settings
from ..core.checker import check_exams
from ..db import get_db
from ..errors import ApiError
from ..models import ExamSchedule, User
from ..schemas import ExamsOut, GenerateIn
from ..services import state
from ..solver.exams import solve_exams

router = APIRouter(tags=["exams"])


def _out(ds, exams: list[dict], penalty: int, solve_ms: int | None) -> ExamsOut:
    viol, _ = check_exams(ds, exams)
    meta = {e["id"]: e for e in ds.exams}
    cal = ds.calendar["exam_week"]
    rows = []
    for e in exams:
        m = meta.get(e["exam_id"], {})
        rows.append({**e, "course_ids": m.get("course_ids", []), "groups": m.get("groups", []), "size": m.get("size", 0),
                     "seats": sum(ds.rooms[r]["capacity"] // 2 for r in e["rooms"] if r in ds.rooms)})
    order = {d: i for i, d in enumerate(cal["days"])}
    rows.sort(key=lambda r: (order.get(r["day"], 99), r["session"], r["exam_id"]))
    return ExamsOut(exams=rows, penalty=penalty, hard_count=len(viol), violations=[asdict(v) for v in viol],
                    total=len(ds.exams), days=cal["days"], sessions=cal["sessions"], solve_ms=solve_ms)


@router.post("/exams/generate", response_model=ExamsOut)
def generate(body: GenerateIn | None = None, db: Session = Depends(get_db),
             user: User = Depends(require_roles("admin"))):
    row, ds = state.active_dataset(db)
    limit = (body.time_limit_s if body and body.time_limit_s else None) or min(settings.solver_time_limit_s, 60)
    r = solve_exams(ds, limit, workers=settings.solver_workers)
    if not r.exams or check_exams(ds, r.exams)[0]:
        raise ApiError(422, r.status, "No valid exam schedule was found" +
                       (" in the time limit" if r.status == "timeout" else ": not enough exam seats or slots"))
    db.add(ExamSchedule(dataset_fk=row.id, exams=r.exams, penalty=r.penalty))
    state.audit(db, user, "exams.generate", "exams", {"penalty": r.penalty})
    db.commit()
    return _out(ds, r.exams, r.penalty, None)


@router.get("/exams", response_model=ExamsOut)
def get_exams(db: Session = Depends(get_db), _: User = Depends(current_user)):
    row, ds = state.active_dataset(db)
    ex = state.latest_exams(db, row)
    if ex is None:
        return _out(ds, [], 0, None)
    return _out(ds, ex.exams, ex.penalty, ex.solve_ms)
