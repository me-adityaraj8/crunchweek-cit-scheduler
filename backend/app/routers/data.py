import json

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from ..auth import current_user, require_roles
from ..core.dataset import load_dataset
from ..db import get_db
from ..errors import bad_request
from ..models import User
from ..schemas import Counts, DatasetLoaded, SettingsOut, SummaryOut
from ..services import state

router = APIRouter(tags=["data"])


def counts(ds) -> Counts:
    return Counts(rooms=len(ds.rooms), faculty=len(ds.faculty), groups=len(ds.groups),
                  courses=len(ds.raw.get("courses", [])), sessions=len(ds.sessions),
                  booking_requests=len(ds.requests), exams=len(ds.exams))


async def read_json_upload(request: Request) -> dict:
    """A JSON file sent as multipart form data (field "file") or as the raw request body."""
    ctype = request.headers.get("content-type", "")
    try:
        if ctype.startswith("multipart/form-data"):
            form = await request.form()
            f = form.get("file")
            if f is None or not hasattr(f, "read"):
                raise bad_request('Attach the JSON file in a form field called "file"')
            raw = await f.read()
        else:
            raw = await request.body()
        data = json.loads(raw.decode("utf-8-sig"))
    except (UnicodeDecodeError, json.JSONDecodeError) as e:
        raise bad_request(f"Not valid JSON: {e}")
    if not isinstance(data, dict):
        raise bad_request("The file must contain a JSON object")
    return data


@router.post("/data/dataset", response_model=DatasetLoaded)
async def upload_dataset(request: Request, db: Session = Depends(get_db),
                         user: User = Depends(require_roles("admin"))):
    data = await read_json_upload(request)
    ds = load_dataset(data)                   # DatasetError -> 400; the active dataset stays as it was
    state.load_new_dataset(db, ds, user)
    db.commit()
    return DatasetLoaded(dataset_id=ds.dataset_id, counts=counts(ds))


@router.get("/data/summary", response_model=SummaryOut)
def summary(db: Session = Depends(get_db), _: User = Depends(current_user)):
    row, ds = state.active_dataset(db)
    feats = sorted({f for r in ds.rooms.values() for f in r["features"]} | {"accessible"})
    depts = sorted({f["department"] for f in ds.faculty.values()} |
                   {g["department"] for g in ds.groups.values() if g.get("department")})
    return SummaryOut(
        dataset_id=ds.dataset_id, institute=ds.raw.get("institute"), loaded_at=row.loaded_at,
        applied_changes=len(row.applied_changes or []), counts=counts(ds), days=ds.days,
        periods=ds.calendar.get("periods", []), lunch_after=ds.lunch_after,
        rooms=[{**r, "building": r.get("building")} for r in ds.rooms.values()],
        faculty=[{"id": f["id"], "name": f["name"], "department": f["department"],
                  "max_hours_per_day": f.get("max_hours_per_day", 4)} for f in ds.faculty.values()],
        groups=[{"id": g["id"], "name": g.get("name", g["id"]), "year": g.get("year"),
                 "department": g.get("department"), "size": g["size"]} for g in ds.groups.values()],
        room_types=sorted({r["type"] for r in ds.rooms.values()}), features=feats, departments=depts)


@router.get("/settings", response_model=SettingsOut)
def get_settings(db: Session = Depends(get_db), _: User = Depends(current_user)):
    _, ds = state.active_dataset(db)
    return state.get_settings(db, ds)


@router.put("/settings", response_model=SettingsOut)
def put_settings(body: SettingsOut, db: Session = Depends(get_db), user: User = Depends(require_roles("admin"))):
    _, ds = state.active_dataset(db)
    if sorted(body.priority_order) != sorted(ds.raw["priority_order"]):
        raise bad_request(f"priority_order must list exactly: {', '.join(ds.raw['priority_order'])}")
    bad = [r for r in body.lab_owners if r not in ds.rooms]
    if bad:
        raise bad_request(f"Unknown room(s) in lab_owners: {', '.join(bad)}")
    out = state.put_settings(db, ds, body.model_dump(), user)
    db.commit()
    return out


@router.post("/admin/reset")
def reset(db: Session = Depends(get_db), _: User = Depends(require_roles("admin"))):
    ds = state.reset_demo(db)
    return {"ok": True, "dataset_id": ds.dataset_id, "counts": counts(ds)}
