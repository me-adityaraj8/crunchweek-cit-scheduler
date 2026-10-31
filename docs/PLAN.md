# Velora — Implementation Plan

**Goal:** Ship the platform in `docs/DESIGN.md` on one Vercel URL: CP-SAT timetable, exams, Spectra week decisions, minimal-move repair with approval, an English/Hinglish booking assistant, and role-based views. All of it must pass `starter_pack/validator.py` with 0 hard violations.

**Architecture:** A modular FastAPI monolith runs as a Vercel Python function under `/api`. The React/Vite SPA is the static frontend on the same origin. Neon Postgres holds versions, requests, proposals and the audit log. The engine (`core/` + `solver/`) is pure Python with no DB or HTTP. Routers call it and save what `core/checker.py` approves.

**Tech stack:**
- Backend: Python 3.12, FastAPI, SQLAlchemy 2, Pydantic 2, OR-Tools CP-SAT, PyJWT, passlib[bcrypt], google-genai, pytest
- Frontend: Node 20, Vite, React 18, TypeScript, Tailwind, shadcn/ui, React Router, TanStack Query, openapi-typescript, Vitest

**Spec:** `docs/DESIGN.md`

## Global Constraints

- `starter_pack/` is read-only. Tests may import `starter_pack/validator.py` but never edit it.
- The validator is the truth. Every export runs through it before commit.
- No LLM call anywhere in a validity path. LLM output goes into a Pydantic schema, then through `core/checker.py`, before anything is saved.
- Nothing from `cit_public.json` is hard-coded (IDs, counts, room lists). Tests may assert dataset counts.
- Time model: days `MON..FRI`. Teaching periods 1–9, event-only 10–13. Lunch after P5. Labs start at P2 or P6. Exam week `MON..SAT`, slots `AM`/`PM`.
- Soft weights exactly as the validator: S1 = 2 per avoided hour, S2 = 1 per gap, S3 = 3 per hour over 6, S4 = 3 per repeat lecture, S5 = 1 if size < 40% of capacity, S6 = 1 if the session uses P9. Exam same-day penalty is 5. Booking weights: institute 5, guest 4, department 3, club 2. An alternative scores half.
- Repair objective: `1000 × moved + soft_total`. A room-only change counts as a move.
- Env vars (all listed in `.env.example`):
  - `DATABASE_URL`
  - `JWT_SECRET`
  - `DEMO_PASSWORD`
  - `GEMINI_API_KEY`
  - `GEMINI_MODEL` (default `gemini-3.8-flash`)
  - `SOLVER_TIME_LIMIT_S` (default `60`)
  - `LLM_TIMEOUT_S` (default `8`)
- The API is served under `/api`, has no CORS, and uses JWT bearer auth.
- Error body: `{"error": {"code", "message", "details"}}`.
- Repo text has no AI or Claude attribution (commits, README, comments). AI is declared only in `AI_USAGE.md`. Commit messages are short and plain.
- Git: work on `main` only. Run `git pull --rebase origin main` before each push. Never force-push. Each lane edits only its own folders, listed below.

## Lanes and ownership

| Lane | Folders it may edit |
| --- | --- |
| A Engine | `backend/app/core/`, `backend/app/solver/`, `backend/tests/engine/` |
| B API + AI | `backend/app/` (except core/solver), `backend/tests/api/`, `api/`, `vercel.json`, `requirements.txt`, root docs |
| C Frontend | `frontend/` |

Task 0 is done together. Then A, B and C run in parallel. `backend/app/schemas.py` (Task B1) is the contract between B and C. The `Interfaces` blocks in Lane A are the contract between A and B.

## Review Focus

1. **A change file with no valid fix, or a solve that times out.** The proposal is saved as `infeasible` with named conflicts, and the active timetable stays unchanged. Tests: A7 `test_repair_infeasible_names_conflicts`, B6 `test_infeasible_proposal_keeps_active`.
2. **Malformed upload** (bad JSON, unknown change type, unknown faculty or room ID). Expect a 400 that names the problem, with state unchanged. Tests: A1 `test_apply_changes_rejects_unknown_type`, B3 `test_bad_dataset_upload_400`, B6 `test_bad_change_file_400`.
3. **LLM down, slow, or returning junk.** The assistant returns `llm: "unavailable"` with an empty draft, and the manual `POST /api/bookings` path still works. Test: B7 `test_llm_failure_falls_back`.
4. **Self-approval and role abuse.** A coordinator approving their own request, a faculty member approving anything, a club claiming an institute event. Expect 403, or capping to the allowed category. Tests: B2 `test_cannot_approve_own`, B5 `test_club_category_capped`.
5. **Approving a stale proposal** (its base version is no longer active) or a double-clicked approve. Expect 409, with nothing applied twice. Test: B6 `test_stale_proposal_409`.

---

## Task 0 — Hour-1 Vercel check (everyone)

Goal: prove the hosting works before building on it.

**Files:**
- Create: `api/index.py`, `vercel.json`, `requirements.txt`, `backend/app/main.py`, `backend/app/config.py`, `frontend/` (Vite React TS template)
- Modify: `.env.example`, `.gitignore`

- [ ] **Step 1:** In `backend/app/main.py`, create `app = FastAPI(root_path="/api")` with `GET /health`. It returns:
  - `{"ortools": <version>, "solve_ms": <int>, "db": "ok"|"error: ...", "llm": "ok"|"error: ..."}`
  - The solve is a 200-variable CP-SAT toy model.
  - The DB check is `SELECT 1` against `DATABASE_URL`.
  - The LLM check is one Gemini call that must return JSON matching `{"ok": bool}`.
- [ ] **Step 2:** In `api/index.py`, write `from backend.app.main import app`. In `vercel.json`:
  - build `frontend/` into `frontend/dist`
  - route `/api/(.*)` to `api/index.py`
  - send everything else to `index.html`
  - set the function `maxDuration: 300`
- [ ] **Step 3:** Run `cd frontend && npm create vite@latest . -- --template react-ts`. Make the page fetch `/api/health` and print it.
- [ ] **Step 4:** Create the Vercel project and add the Neon integration (this sets `DATABASE_URL`). Add the other env vars, then deploy.
- [ ] **Step 5:** Open `https://<app>.vercel.app/api/health`. Expected: all four fields are ok, and the cold-start response comes back in under 15s. **If the bundle is too large or the function errors on `ortools`, stop.** Move the backend to Render (same `backend/`, `uvicorn backend.app.main:app`), point the SPA at it with a `/api` rewrite in `vercel.json`, and record the switch in `HANDOFF.md`.
- [ ] **Step 6:** Pin the exact installed versions in `requirements.txt` and `frontend/package.json`. Commit `chore: deploy skeleton`.

**Checkpoint after A3:** redeploy and call `POST /api/timetable/generate` on Vercel. If it can't finish inside `maxDuration` with a feasible result, lower `SOLVER_TIME_LIMIT_S` or move the backend as in Step 5.

---

## Lane A — Engine

### Task A1: Dataset loading and change files

**Files:** Create `backend/app/core/model.py`, `backend/app/core/dataset.py`. Test: `backend/tests/engine/test_dataset.py`.

**Interfaces — Produces:**
- `Assign = dict[str, tuple[str, int, str]]`, mapping a session ID to `(day, start_period, room_id)`
- `@dataclass Dataset`, with these fields:
  - `raw: dict`, `dataset_id: str`, `calendar: dict`, `priority_order: list[str]`, `role_cap: dict[str, str]`
  - lookups by ID: `rooms`, `faculty`, `groups`, `sessions`, `requests`, all `dict[str, dict]`
  - `cancelled: set[str]`, `exams: list[dict]`
  - `fac_un: dict[str, set[tuple[str, int]]]`, `room_un: dict[str, set[tuple[str, int]]]`
- `load_dataset(src: str | Path | dict) -> Dataset`. Raises `DatasetError(msg)` if a required top-level key is missing.
- `apply_changes(ds: Dataset, change_file: dict) -> Dataset`. Returns a new Dataset and has the same semantics as the validator's `apply_disruption`. Raises `DatasetError` for an unknown type or unknown faculty, room or session ID.
- `DAYS`, `TEACHING = range(1, 10)`, `EVENT_PERIODS = range(10, 14)`, `LUNCH_AFTER = 5`, `LAB_STARTS = {2, 6}`

- [ ] **Step 1: Failing tests**
```python
def test_counts():
    ds = load_dataset("starter_pack/data/cit_public.json")
    assert (len(ds.rooms), len(ds.faculty), len(ds.groups), len(ds.sessions), len(ds.requests), len(ds.exams)) == (27, 40, 14, 189, 25, 41)
    assert ds.cancelled == {"BR-04"}

def test_apply_sample_disruption():
    ds = apply_changes(load_dataset(P), json.load(open("starter_pack/examples/sample_disruption.json")))
    assert ("MON", 1) in ds.fac_un["F07"] and ("TUE", 3) in ds.room_un["CR-102"]
    assert "CS202-T2" in ds.sessions and len(ds.sessions) == 190

def test_apply_changes_rejects_unknown_type():
    with pytest.raises(DatasetError): apply_changes(load_dataset(P), {"changes": [{"type": "teleport"}]})
```
- [ ] **Step 2:** Run `pytest backend/tests/engine/test_dataset.py`. Expected: FAIL (import error).
- [ ] **Step 3:** Implement. `apply_changes` deep-copies `raw`, applies the changes, then reloads.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit `feat: dataset loader and change files`.

### Task A2: Checker that matches the validator

**Files:** Create `backend/app/core/checker.py`, `backend/app/core/priority.py`. Test: `backend/tests/engine/test_checker.py`.

**Interfaces — Produces:**
- `@dataclass Violation(rule: str, where: str, detail: str)`
- `check_timetable(ds, assign: Assign, where="timetable") -> list[Violation]`. Covers rules H1–H12 and H14.
- `soft_score(ds, assign) -> tuple[dict[str, int], int]`
- `week_view(ds, assign, overrides: list[dict]) -> Assign`
- `check_fest(ds, assign, decisions: list[dict], overrides: list[dict]) -> tuple[list[Violation], dict]`. The stats dict has `booking_score`, `approved`, `alternatives`, `rejected` and `priority_inversions: list[str]`.
- `check_exams(ds, exams: list[dict]) -> tuple[list[Violation], int]`
- `check_booking(ds, view: Assign, draft: dict, taken: list[dict]) -> list[Violation]`. This is a single-booking H13 check against a Week-7 view plus other approved bookings. It reuses the same rule text as `check_fest`.
- `check_move(ds, assign, session_id, day, start, room) -> list[Violation]`
- `free_rooms(ds, view, taken, day, from_p, to_p, attendance, needs, room_types=None) -> list[str]`
- `full_report(ds, schedule: dict, baseline: dict | None = None) -> dict`. Same keys as the validator's `run()`.
- In `priority.py`:
  - `effective_category(ds, req) -> str`
  - `outranks(ds, r1, r2) -> bool`
  - `CAT_WEIGHT`

- [ ] **Step 1: Failing tests.** Load `starter_pack/validator.py` with `importlib.util.spec_from_file_location`.
```python
@pytest.mark.parametrize("seed", range(20))
def test_random_assign_matches_validator(seed):
    sched = random_schedule(ds, seed)          # helper: random day/start/room per session, random fest/exams
    ours, theirs = full_report(ds, sched), V.run(ds.raw, sched)
    assert ours["hard_by_rule"] == theirs["hard_by_rule"]
    assert ours["soft_total"] == theirs["soft_total"]

def test_example_schedule_matches_validator(): ...   # starter_pack/examples/schedule.example.json, same asserts

def test_club_claiming_institute_is_capped():
    req = {**ds.requests["BR-07"], "requested_category": "institute_event"}
    assert effective_category(ds, req) == "club_event"
```
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. Write it in our own code structure; don't copy the validator's functions. Rule codes and the meaning of each check must match.
- [ ] **Step 4:** Run. Expected: PASS on all 20 seeds and the example.
- [ ] **Step 5:** Commit `feat: constraint checker`.

### Task A3: Timetable solver

**Files:** Create `backend/app/solver/model_builder.py`, `backend/app/solver/timetable.py`. Test: `backend/tests/engine/test_timetable.py`.

**Interfaces — Consumes:** A1, A2. **Produces:**
- `@dataclass SolveResult(status: Literal["optimal", "feasible", "infeasible", "timeout"], assign: Assign | None, soft: dict[str, int], soft_total: int, solve_ms: int)`
- `solve_timetable(ds, time_limit_s: float, baseline: Assign | None = None, move_weight: int = 0, blocked: set[tuple[str, str, int]] = frozenset(), assumptions: bool = False, workers: int = 8) -> SolveResult`
  - `blocked` holds `(room, day, period)` cells taken by fixed bookings.
  - `move_weight > 0` adds `move_weight × [placement != baseline]` per session and uses the baseline as a hint.
- `candidates(ds, session) -> list[tuple[str, int, str]]`. These are pre-filtered `(day, start, room)` triples, as described in DESIGN 3.4.

- [ ] **Step 1: Failing tests**
```python
def test_zero_hard_on_public_dataset():
    r = solve_timetable(ds, time_limit_s=60)
    assert r.status in ("optimal", "feasible") and len(r.assign) == 189
    assert check_timetable(ds, r.assign) == []
    rep = V.run(ds.raw, {"dataset_id": ds.dataset_id, "sessions": to_rows(r.assign)})
    assert [v for v in rep["hard_violations"] if v["where"] == "timetable"] == []
    assert rep["soft_total"] == r.soft_total

def test_basket_sessions_share_slot(): ...   # all OEB-1 sessions same (day,start)
def test_candidates_respect_lab_starts_and_lunch(): ...   # every lab candidate start ∈ {2,6}; no candidate spans P5–P6
```
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement the model as in DESIGN 3.4:
  - one boolean per candidate
  - `AddExactlyOne` per session
  - `≤ 1` per room cell, per faculty cell, and per group cell (one key per basket)
  - one shared `(day, start)` per basket
  - faculty daily-hours limit
  - the soft objective, with S2 gaps built from per-group period occupancy booleans
- [ ] **Step 4:** Run. Expected: PASS. Record the soft total in `TASK_LOG.md`.
- [ ] **Step 5:** Commit `feat: timetable solver`. Then do the Task 0 checkpoint.

### Task A4: Exam scheduler

**Files:** Create `backend/app/solver/exams.py`. Test: `backend/tests/engine/test_exams.py`.

**Produces:** `@dataclass ExamResult(status: str, exams: list[dict], penalty: int)`. Each exam dict is `{"exam_id", "day", "session", "rooms": [...]}`. Signature: `solve_exams(ds, time_limit_s: float = 30) -> ExamResult`.

- [ ] **Step 1:** Write the test. `check_exams(ds, r.exams)[0] == []`, all 41 exam IDs appear once, and `r.penalty` equals the validator's `exam_soft_penalty`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement as in DESIGN 3.4:
  - only rooms with `exam` in `allowed_uses`
  - seats `= capacity // 2`
  - objective `5 × (exams per group-day − 1)`
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat: exam scheduler`.

### Task A5: Spectra week decisions

**Files:** Create `backend/app/solver/fest.py`. Test: `backend/tests/engine/test_fest.py`.

**Produces:**
- `@dataclass Decision(request_id, status, day=None, start_period=None, end_period=None, room_id=None, reason: str = "", facts: list[str] = [], lost_to: str | None = None, displaces: list[str] = [])`
- `@dataclass FestResult(decisions: list[Decision], overrides: list[dict])`. Each override is `{"session_id", "day", "start_period", "room_id", "displaced_by"}`.
- `decide_fest(ds, assign: Assign, extra_requests: list[dict] = (), time_limit_s: float = 30) -> FestResult`
  - `extra_requests` are live app bookings, shaped like dataset requests, with IDs `APP-0001...`.
  - The function is deterministic, so re-running it with new extras applies the bumping rule in DESIGN 8.

Algorithm: sort non-cancelled requests by `(priority index of effective_category, submitted_at)`. For each:
1. Try `requested_room` first, then other valid rooms ordered by smallest fitting capacity. Use every start inside every window, skipping cells that are occupied, unavailable, or that clash with mandatory groups. Success means `approved`.
2. If nothing fits and the category is `institute_event`, allow displacing sessions in the cheapest room/window. Re-place the displaced sessions for Week 7 with `solve_timetable(..., baseline=assign, move_weight=1000, blocked=<bookings so far>)`. Emit overrides. The status is `approved`.
3. Otherwise search all days and periods 1–13 for the nearest slot by the same rules, giving `alternative_offered`.
4. Otherwise `rejected`. The reason names the binding fact, e.g. "No event venue seats 1,200 (largest: OAT 800)", or "SH-1 THU P10–12 held by BR-03 (guest lecture, higher priority)" with `lost_to` set.
5. Cancelled requests are `rejected` with reason "Cancelled by requester: <note>".

- [ ] **Step 1: Failing tests**
```python
def test_fest_valid_and_inversion_free():
    base = solve_timetable(ds, 60).assign; f = decide_fest(ds, base)
    viol, stats = check_fest(ds, base, [asdict(d) for d in f.decisions], f.overrides)
    assert viol == [] and stats["priority_inversions"] == []
    assert {d.request_id for d in f.decisions} == set(ds.requests)
    assert all(d.reason for d in f.decisions if d.status != "approved")
    assert next(d for d in f.decisions if d.request_id == "BR-04").status == "rejected"

def test_higher_priority_extra_bumps_lower(): ...   # extra guest_lecture copying a club booking's slot → club request now alternative/rejected with lost_to == extra id
```
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS. Record `booking_score` in `TASK_LOG.md`.
- [ ] **Step 5:** Commit `feat: spectra week decisions`.

### Task A6: Export

**Files:** Create `backend/app/core/export.py`. Test: `backend/tests/engine/test_export.py`.

**Produces:** `build_schedule(ds, assign, fest: FestResult | None, exams: ExamResult | None, team: str) -> dict`, in the exact README format.

- [ ] **Step 1:** Write the test. A full pipeline (A3 → A4 → A5 → export) gives `V.run(ds.raw, sched)["hard_violation_count"] == 0`, and the warnings contain no `"No decision"`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat: schedule export`.

### Task A7: Repair and infeasibility

**Files:** Create `backend/app/solver/repair.py`, `backend/app/solver/infeasible.py`. Test: `backend/tests/engine/test_repair.py`.

**Produces:**
- `@dataclass Move(session_id: str, before: tuple | None, after: tuple | None)`
- `@dataclass Conflict(code: str, text: str)`
- `@dataclass RepairResult(status: Literal["ok", "infeasible", "timeout"], assign: Assign | None, diff: list[Move], moved: int, time_changed: int, room_only: int, soft_before: int, soft_after: int, conflicts: list[Conflict])`
- `repair(ds_after, baseline: Assign, fest: FestResult | None, time_limit_s: float) -> RepairResult`. Approved bookings and overrides from `fest` become `blocked` cells (DESIGN 8). An approved booking whose room is now unavailable is added to `conflicts`.
- `explain_infeasible(ds_after, baseline, blocked, time_limit_s) -> list[Conflict]`. It re-solves with one assumption literal per change and per constraint family, then reads `sufficient_assumptions_for_infeasibility()` and maps each literal to plain text.

- [ ] **Step 1: Failing tests**
```python
def test_sample_disruption_minimal_and_valid():
    base = solve_timetable(ds, 60).assign
    ds2 = apply_changes(ds, SAMPLE); r = repair(ds2, base, None, 60)
    assert r.status == "ok" and check_timetable(ds2, r.assign) == []
    rep = V.run(ds2.raw, sched(r.assign), baseline=sched(base))
    assert rep["stability"]["sessions_moved"] == r.moved
    assert r.moved <= sum(1 for s, v in base.items() if touches_change(ds2, s, v)) + 1   # only sessions hit by the change, plus the new one

def test_repair_infeasible_names_conflicts():
    ds2 = apply_changes(ds, {"changes": [{"type": "faculty_unavailable", "faculty_id": F, "days": DAYS, "periods": list(range(1, 10)), "reason": "x"}]})
    r = repair(ds2, base, None, 30)
    assert r.status == "infeasible" and any(F in c.text for c in r.conflicts)
```
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. Use `solve_timetable(..., baseline=..., move_weight=1000, blocked=...)`, then build the diff.
- [ ] **Step 4:** Run. Expected: PASS. Record `moved` in `TASK_LOG.md`.
- [ ] **Step 5:** Commit `feat: minimal-move repair`.

### Task A8: Explanations

**Files:** Create `backend/app/core/explain.py`. Test: `backend/tests/engine/test_explain.py`.

**Produces:**
- `explain_session(ds, assign, session_id) -> dict`, returning `{"placed_at": {...}, "facts": [str], "alternatives": [{"day", "start", "room", "blocked_by": [str]}]}`
  - `alternatives` lists every other candidate. `blocked_by` holds the rule codes plus text, found by running `check_move`. Soft-only alternatives carry `"costs +N soft (S2 gap for CSE-2 TUE)"`.
- `explain_booking(ds, fest: FestResult, request_id) -> dict`, returning `{"status", "reason", "facts", "lost_to"}`.

- [ ] **Step 1:** Write the test. For a session the solver put at P1, `facts` is non-empty. Every alternative has either a non-empty `blocked_by` or a soft cost of at least the placed slot's cost.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat: decision explanations`.

---

## Lane B — API + AI

### Task B1: Contract, DB and app wiring

**Files:** Create `backend/app/schemas.py`, `backend/app/db.py`, `backend/app/models.py`, `backend/app/deps.py`, empty routers in `backend/app/routers/*.py` (`auth, admin, data, timetable, exams, bookings, fest, changes, assistant, views, export, settings`). Test: `backend/tests/api/test_contract.py`.

- `schemas.py` holds the Pydantic request and response models for every endpoint in DESIGN 3.6, including `BookingDraft` and `ChangeIntent`. Add `GET/PUT /api/settings`, which returns `{priority_order: [str], lab_owners: {room_id: [dept]}}`.
- `models.py` holds the tables from DESIGN 3.5. Use the SQLAlchemy `JSON` type, which works on Postgres and in SQLite tests. Use `Base.metadata.create_all` at startup, with no migrations.
- Routers return fixture data until their task lands, so C can build against the real shapes.

- [ ] **Step 1:** Write the test. `GET /api/openapi.json` lists every path in DESIGN 3.6 plus `/settings`, and each stub returns 200 with a body that passes its response model. Use `TestClient`, with SQLite in a tmp path.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS. Then run `npx openapi-typescript http://localhost:8000/api/openapi.json -o frontend/src/api/types.ts` and commit that file for C.
- [ ] **Step 5:** Commit `feat: api contract and db models`.

### Task B2: Auth and role guards

**Files:** Create `backend/app/auth.py`. Modify `routers/auth.py` and `routers/admin.py` (seeding). Test: `backend/tests/api/test_auth.py`.

**Produces:**
- `current_user` dependency
- `require_roles(*roles)`
- `require_not_owner(entity_owner_id)`
- `seed_demo_users(ds)` (DESIGN 8):
  - fixed: `admin@cit.demo`, `club@cit.demo`
  - from the dataset: `faculty@cit.demo` gets the first faculty ID; `coord1@cit.demo` and `coord2@cit.demo` get the first two departments
  - the password for all of them comes from `DEMO_PASSWORD`

- [ ] **Step 1:** Write the tests:
  - login gives a token
  - a wrong password gives 401
  - a faculty token calling an admin route gives 403
  - `test_cannot_approve_own`: coord1 submits a booking for their own department's lab; coord1 deciding it gets 403
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement with PyJWT HS256 (12h expiry) and bcrypt.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat: auth and roles`.

### Task B3: State service, reset and dataset upload

**Files:** Create `backend/app/services/state.py`. Modify `routers/admin.py` and `routers/data.py`. Test: `backend/tests/api/test_state.py`.

**Produces:**
- `active_dataset(db) -> Dataset`
- `active_version(db) -> TimetableVersion | None`
- `save_version(db, assign, parent, status, user) -> TimetableVersion`
- `reset_demo(db)`: loads `starter_pack/data/cit_public.json`, drops all runtime rows, reseeds users and settings
- Every write also writes to `audit_log`.
- `get_settings(db)` and `put_settings(db, ...)` back `GET/PUT /api/settings` (admin for PUT). Defaults are the dataset's `priority_order` and the lab-owner map in DESIGN 8. Before calling the engine, routers replace `ds.priority_order` with the settings value, and B5 uses `lab_owners` for coordinator approval.

- [ ] **Step 1:** Write the tests:
  - after reset, `/api/data/summary` counts match the dataset
  - `test_bad_dataset_upload_400`: a JSON file missing `sessions` gets 400 and the old dataset stays active
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat: dataset state and reset`.

### Task B4: Timetable, views, explain and free rooms

**Files:** Modify `routers/timetable.py` and `routers/views.py`. Test: `backend/tests/api/test_timetable.py`.

- `POST /timetable/generate` (admin) calls `solve_timetable(ds, settings.SOLVER_TIME_LIMIT_S)`, saves the result as an active version **only if `check_timetable == []`**, and returns the summary.
- `GET /timetable?view&id` is role-scoped. Faculty can only see their own `faculty_id`.
- `POST /timetable/manual`: if `check_move` returns violations, respond 422 with the violations plus `free` alternatives. Otherwise create a pending change proposal (admin approval) of kind `manual`.
- `GET /explain/session/{id}` and `GET /rooms/free` wrap A8 and A2.
- `GET /dashboard` returns hard count, soft, pending approvals for this user, conflicts (`check_timetable` on the active version), and utilisation as a 0/1 grid per room.

- [ ] **Step 1:** Write the tests:
  - generate, then group view `Y1-A` has entries and none overlap
  - an invalid manual move gets 422 with rule `H4`
  - faculty requesting another faculty's view gets 403
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat: timetable endpoints`.

### Task B5: Exams, Spectra week and bookings

**Files:** Modify `routers/exams.py`, `routers/fest.py` and `routers/bookings.py`. Test: `backend/tests/api/test_bookings.py`.

- `POST /exams/generate` and `POST /fest/decide-all` save only checker-clean results.
- `POST /bookings`:
  1. store the request (ID `APP-xxxx`, `submitted_at = now`, category capped by role)
  2. re-run `decide_fest` with all live requests as `extra_requests`
  3. store the decisions
  4. if the decision needs a human (DESIGN 8: own-department lab, or it displaces a class), set the status to `pending_approval` with the proposed decision
  5. return `{request_id, status, reason}`
- `POST /bookings/check` is pure `check_booking` plus `free_rooms`. No DB writes.
- `POST /bookings/{id}/decide` checks the role and `require_not_owner`, then re-checks with `check_booking` before accepting.
- `POST /bookings/{id}/cancel` is owner-only and re-runs `decide_fest`.
- `GET /explain/booking/{id}` (owner or admin) wraps A8 `explain_booking`, with an optional `?words=1` that runs B7 `reword` on the facts.

- [ ] **Step 1:** Write the tests:
  - `test_club_category_capped`: a club posting `requested_category="institute_event"` is stored as `club_event`
  - a booking colliding with an approved higher-priority one comes back as `alternative_offered` or `rejected`, with a reason
  - cancelling frees the slot
  - after decide-all, `full_report` on the export has 0 hard violations
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat: bookings and spectra endpoints`.

### Task B6: Change proposals

**Files:** Modify `routers/changes.py`. Create `backend/app/services/proposals.py`. Test: `backend/tests/api/test_changes.py`.

- `POST /changes/file` (admin), `POST /changes` (from a `ChangeIntent`), and `POST /faculty/unavailability` (self only) all follow the same steps:
  1. `apply_changes` to a copy
  2. `repair`
  3. save a proposal with the diff and conflicts, status `pending` or `infeasible`
- `POST /changes/{id}/approve` (admin, not the owner):
  1. check that the base version is still active, else 409
  2. re-run `check_timetable` on the proposed assignment
  3. make it the active version, and make the changed dataset the active dataset
- A `ChangeIntent` of type `move_session` becomes a manual move checked by `check_move`. If it fails, the proposal is `infeasible`, its conflicts are the violations, and it includes `free` alternatives.

- [ ] **Step 1:** Write the tests:
  - sample disruption, then approve: the active version has 190 sessions and 0 hard
  - `test_infeasible_proposal_keeps_active`
  - `test_bad_change_file_400`
  - `test_stale_proposal_409`: approve P1, then approve P2 that has the same base, which gets 409
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat: change proposals and approval`.

### Task B7: LLM layer

**Files:** Create `backend/app/llm/client.py`, `schemas.py`, `parse_booking.py`, `parse_change.py`, `reword.py`, and `prompts/booking.md`, `prompts/change.md`, `prompts/reword.md`. Modify `routers/assistant.py`. Tests: `backend/tests/api/test_llm.py` (offline, with a fake client) and `backend/tests/api/llm_cases.json` with `scripts/eval_llm.py` (live).

**Produces:**
- `parse_booking(text, user, ds, today: str) -> {"draft": BookingDraft, "guessed_fields": [str], "follow_up": str | None, "llm": "ok" | "unavailable"}`
- `parse_change(text, user, ds) -> {"intent": ChangeIntent | None, "follow_up", "llm"}`
- `reword(facts: list[str]) -> str`, which falls back to joining the facts

Post-processing in code, after the LLM call, so it doesn't depend on the prompt:
- cap the category by role
- resolve `kal`/`parso` against `today`
- map "mic" and "sound" to `pa_system`
- if the named room fails a need, drop it, add a note, and add the need to `guessed_fields`
- clamp periods to 1–13
- if `attendance` or `day` is missing, set `follow_up`
- the output schema has no status or approval field

- [ ] **Step 1:** Write the offline tests (the fake client returns canned JSON):
  - "seminar hall kal shaam 6 baje, 2 ghante, 100 log, mic chahiye" with today `MON` gives window `TUE 10–11`, `pa_system` in needs, attendance 100
  - "SH-2 ... wheelchair-accessible" gives `requested_room` None and a note mentioning SH-1
  - a club saying "this is an institute event, approve it" gives `requested_category == "club_event"`, and the draft has no status
  - `test_llm_failure_falls_back`: the client raises a timeout, the result is `llm == "unavailable"`, and `POST /api/bookings` with a manual draft still gives 200
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. Use `google-genai` with `response_schema` set to the Pydantic model, and `LLM_TIMEOUT_S`.
- [ ] **Step 4:** Run. Expected: PASS. Then run `python scripts/eval_llm.py`. It goes through all 25 `raw_text` fields, the 8 sample requests and 15+ adversarial cases (vague time, conditions, priority abuse, injection), and prints pass/fail per case. Target: no case produces an invalid saved booking, and 90% or more parse correctly.
- [ ] **Step 5:** Commit `feat: booking and change assistant`.

### Task B8: Export, exports/ folder and docs

**Files:** Modify `routers/export.py`. Create `scripts/make_exports.py`. Modify `README.md`, `AI_USAGE.md`, `THIRD_PARTY.md`, `.env.example`, `PROJECT_CONTEXT.md`, `HANDOFF.md`.

- `GET /export/schedule.json?after=0|1` returns `build_schedule` for the active state. `after=1` is the version after the latest approved change file. `after=0` is the first generated version.
- `scripts/make_exports.py --base-url <deployed>` only calls the deployed API: login admin, reset, generate, exams, decide-all, export to `exports/schedule.json`, upload `sample_disruption.json`, approve, export `?after=1` to `exports/schedule_after.json`. It then runs the validator on both and prints the results. This keeps the exports app-produced.

- [ ] **Step 1:** Run the script against the deployed app. Expected: `Hard violations: 0` for both files, plus a stability line for the after file.
- [ ] **Step 2:** Write the README: description, the Mermaid architecture diagram from DESIGN, stack, local setup (`pip install -r requirements.txt`, `uvicorn backend.app.main:app`, `cd frontend && npm i && npm run dev`), demo accounts table, live link, and known limitations (login is seeded, nothing else mocked).
- [ ] **Step 3:** Fill in `AI_USAGE.md`:
  - Gemini model and uses
  - Claude Code and what it helped with
  - prompts in `backend/app/llm/prompts/`
  - the LLM never decides validity
- [ ] **Step 4:** Fill in `THIRD_PARTY.md` with every pinned package.
- [ ] **Step 5:** Commit `chore: exports and docs`.

---

## Lane C — Frontend

All pages use `src/api/types.ts` (from B1) through a typed `api` wrapper. Until an endpoint is real, `VITE_USE_MOCKS=1` serves fixtures from `src/api/mocks/` with the same types.

### Task C1: Shell, design system, auth

**Files:** Create `frontend/src/main.tsx`, `App.tsx`, `api/client.ts`, `api/mocks/*`, `lib/time.ts`, `lib/roles.ts`, `components/AppShell.tsx`, `RoleNav.tsx`, `TopBar.tsx`, `StateViews.tsx`, `pages/Login.tsx`, `styles/tokens.css`. Test: `frontend/src/lib/time.test.ts`.

- Tokens in `tokens.css`, used for both light and dark themes. Colour is only for meaning (DESIGN 5):
  - session kinds: lecture, tutorial, lab, exam, event
  - statuses: approved, alternative, rejected, pending
  - conflict red
- `lib/time.ts`: `periodLabel(p) -> "08:00"`, `spanLabel(start, dur)`, `isLunchBoundary(p)`, `DAYS`
- The Login page has one-click demo account buttons that fill email and password. The token is stored in memory plus `sessionStorage` inside try/catch.
- Navigation for each role comes from `lib/roles.ts`.

- [ ] **Step 1:** Write the tests: `periodLabel(1) == "08:00"`, `periodLabel(6) == "14:00"`, `spanLabel(2, 3) == "09:00–12:00"`.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test && npm run build`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: app shell and login`.

### Task C2: Timetable and explain

**Files:** Create `components/TimetableGrid.tsx`, `SessionCell.tsx`, `ViewPicker.tsx`, `ExplainDrawer.tsx`, `pages/Timetable.tsx`. Test: `components/TimetableGrid.test.tsx`.

- The grid has days as columns and P1–P9 as rows with a lunch band. P10–P13 appear only when `showEvents`. Multi-period cells span rows.
- Below 768px it becomes a day picker plus a list.
- Clicking a cell opens `ExplainDrawer` (`GET /explain/session/{id}`).

- [ ] **Step 1:** Write the tests. A 3-period lab at P2 renders one cell with `grid-row: span 3`. At width 375 the day list renders instead of the grid.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat: timetable views`.

### Task C3: Bookings and Find a room

**Files:** Create `components/BookingAssistant.tsx`, `ChatPane.tsx`, `BookingForm.tsx`, `CheckResult.tsx`, `pages/Bookings.tsx`, `pages/FindRoom.tsx`. Test: `components/BookingForm.test.tsx`.

- Chat on the left and the form on the right; stacked on phone.
- Every form edit calls `POST /bookings/check` (debounced 300ms). `CheckResult` shows the failing rule text and alternative rooms.
- Guessed fields get a "guessed" badge.
- When `llm == "unavailable"`, show a banner and keep the form usable.
- Under it, a "My requests" list with status, reason and a cancel button.

- [ ] **Step 1:** Write the tests:
  - a draft with `guessed_fields: ["windows"]` shows a guessed badge on the time field
  - an `llm: "unavailable"` response shows the banner and the submit button stays enabled
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat: booking assistant`.

### Task C4: Dashboard and Spectra board

**Files:** Create `pages/Dashboard.tsx`, `components/StatCards.tsx`, `ApprovalList.tsx`, `UtilisationHeatmap.tsx`, `pages/Fest.tsx`, `components/FestBoard.tsx`, `DecisionBadge.tsx`. Test: `components/FestBoard.test.tsx`.

- [ ] **Step 1:** Write the test. A rejected decision with `lost_to` renders "Lost to BR-03" and the reason text.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. The dashboard cards are hard violations, soft penalty, pending approvals and conflicts, plus the heatmap of rooms × day-periods. The Spectra board is a rooms × Week-7 periods grid with request rows grouped by status, and a "Decide all" button for admin.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat: dashboard and spectra board`.

### Task C5: Changes, diff and approval; exams

**Files:** Create `pages/Changes.tsx`, `components/DiffView.tsx`, `MiniGrid.tsx`, `MoveList.tsx`, `pages/Exams.tsx`, `components/UnavailabilityForm.tsx`. Test: `components/DiffView.test.tsx`.

- [ ] **Step 1:** Write the tests:
  - a diff with 2 time moves and 1 room-only move shows the chips "2 time changes · 1 room only · 0 hard"
  - an `infeasible` proposal shows its conflicts list and no Approve button
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. Approve and Reject are visible only to admin and hidden on the user's own proposals. A 409 shows "This proposal is out of date — regenerate".
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat: change review and exams`.

### Task C6: Admin data, settings and polish pass

**Files:** Create `pages/DataExport.tsx` (upload dataset, upload change file, generate timetable, generate exams, export download, reset demo with a confirm dialog) and `pages/Settings.tsx` (priority order drag list, lab owners).

- [ ] **Step 1:** Check states. Every page has loading, empty and error views. Solver buttons show elapsed seconds while running.
- [ ] **Step 2:** Check phone layout. At 375px, test each page as each role: no horizontal scroll, and the nav is a bottom bar.
- [ ] **Step 3:** Run `npm run build`. Expected: clean, with no TS errors.
- [ ] **Step 4:** Commit `feat: admin data, settings, polish`.

---

## Integration and release (everyone, hours 15–24)

- [ ] **I1:** On the deployed link, run each DESIGN section 2 journey (1–8) as the role it belongs to. Log every failure in `HANDOFF.md` with an owner lane. Fix, redeploy, re-run.
- [ ] **I2:** Run `python scripts/make_exports.py --base-url https://<app>.vercel.app`. Both files must show 0 hard. Commit `exports/`.
- [ ] **I3:** Run `python scripts/eval_llm.py` against production. Paste the summary into `HANDOFF.md`.
- [ ] **I4:** Do a cold-judge test. A teammate who didn't build that area uses only the README to find a free room, read a group timetable, and approve a change.
- [ ] **I5:** Record the video (≤5 min) in the order of journeys 1–8. Upload it unlisted.
- [ ] **I6:** Make the repo public. Do the final pull, run the validator, and update README links. Then freeze: no pushes after the deadline.
