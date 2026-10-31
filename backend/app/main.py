"""FastAPI app. Every route lives under /api so the SPA and the API can share one origin."""
import logging
import threading
import os
import time
from contextlib import asynccontextmanager

import ortools
from fastapi import APIRouter, FastAPI, Query, Request
from fastapi.responses import JSONResponse
from ortools.sat.python import cp_model
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError, OperationalError, ProgrammingError
from starlette.concurrency import run_in_threadpool

from . import errors
from .config import settings
from .db import Base, SessionLocal, engine
from .llm import client as llm_client
from .routers import assistant, auth, bookings, changes, data, exams, export, timetable, velo, views
from .schemas import Health
from .services import state

log = logging.getLogger("cit")
_ready = False
_lock = threading.Lock()


def ensure_ready() -> None:
    """Create the tables and seed the demo data, once per process. Called from the lifespan hook and again
    before the first request, because serverless hosts may never send lifespan events."""
    global _ready
    if _ready:
        return
    with _lock:
        if _ready:
            return
        try:
            Base.metadata.create_all(engine)
        except (IntegrityError, ProgrammingError):      # another instance created them at the same moment
            time.sleep(1)
            Base.metadata.create_all(engine)
        with SessionLocal() as db:
            state.ensure_seeded(db)
        _ready = True


@asynccontextmanager
async def lifespan(_: FastAPI):
    try:
        await run_in_threadpool(ensure_ready)
    except OperationalError as e:      # start anyway: /api/health then shows what is wrong
        log.error("database not ready at startup: %s", e)
    yield


app = FastAPI(title="Velora", version="1.0", docs_url="/api/docs", openapi_url="/api/openapi.json",
              redoc_url=None, lifespan=lifespan)
errors.install(app)


@app.middleware("http")
async def _ready_first(request: Request, call_next):
    if not _ready:
        try:
            await run_in_threadpool(ensure_ready)
        except Exception as e:      # database unreachable: say so; /api/health still reports the details
            log.error("database not ready: %s", e)
            if not request.url.path.endswith("/health"):
                return JSONResponse({"error": {"code": "not_ready", "details": {}, "message":
                                               f"The database is not reachable ({type(e).__name__}). Check DATABASE_URL."}},
                                    status_code=503)
    return await call_next(request)


api = APIRouter(prefix="/api")


@api.get("/health", response_model=Health, tags=["health"])
def health(deep: bool = Query(False)):
    """Solver, database and LLM status. deep=1 also makes one real LLM call."""
    t0 = time.monotonic()
    m = cp_model.CpModel()
    xs = [m.NewBoolVar(f"x{i}") for i in range(200)]
    for i in range(0, 200, 2):
        m.AddBoolOr([xs[i], xs[i + 1]])
    m.Minimize(sum(xs))
    s = cp_model.CpSolver()
    s.parameters.max_time_in_seconds = 5
    ok_solver = s.Solve(m) == cp_model.OPTIMAL
    solve_ms = int((time.monotonic() - t0) * 1000)
    try:
        with engine.connect() as c:
            c.execute(text("SELECT 1"))
        db = "ok"
        if settings.temporary_db:
            db = "ok, but temporary: SQLite in /tmp is lost on restart and not shared between instances. Set DATABASE_URL."
    except Exception as e:      # report, don't crash: this endpoint exists to show what is broken
        db = f"error: {type(e).__name__}"
    llm = llm_client.status() if deep else ("configured" if llm_client.settings.gemini_api_key else
                                            "not configured (assistant falls back to rule-based parsing)")
    cpus = len(os.sched_getaffinity(0)) if hasattr(os, "sched_getaffinity") else (os.cpu_count() or 1)
    return Health(ok=ok_solver and db.startswith("ok"), ortools=ortools.__version__, cpus=cpus,
                  solver_workers=settings.solver_workers, solve_ms=solve_ms, db=db, llm=llm)


for r in (auth, data, timetable, views, exams, bookings, changes, assistant, velo, export):
    api.include_router(r.router)
app.include_router(api)
