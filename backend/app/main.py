"""FastAPI app. Every route lives under /api so the SPA and the API can share one origin."""
import time
from contextlib import asynccontextmanager

import ortools
from fastapi import APIRouter, FastAPI, Query
from ortools.sat.python import cp_model
from sqlalchemy import text

from . import errors
from .db import Base, SessionLocal, engine
from .llm import client as llm_client
from .routers import assistant, auth, bookings, changes, data, exams, export, timetable, views
from .schemas import Health
from .services import state

@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        state.ensure_seeded(db)
    yield


app = FastAPI(title="CIT Campus Scheduler", version="1.0", docs_url="/api/docs", openapi_url="/api/openapi.json",
              redoc_url=None, lifespan=lifespan)
errors.install(app)

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
    except Exception as e:      # report, don't crash: this endpoint exists to show what is broken
        db = f"error: {type(e).__name__}"
    llm = llm_client.status() if deep else ("configured" if llm_client.settings.gemini_api_key else
                                            "not configured (assistant falls back to rule-based parsing)")
    return Health(ok=ok_solver and db == "ok", ortools=ortools.__version__, solve_ms=solve_ms, db=db, llm=llm)


for r in (auth, data, timetable, views, exams, bookings, changes, assistant, export):
    api.include_router(r.router)
app.include_router(api)
