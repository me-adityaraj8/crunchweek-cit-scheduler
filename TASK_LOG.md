# Task Log

| Date | Who | What |
| --- | --- | --- |
| 2026-10-31 | Aditya (Laptop 1) | Created repo, added starter pack, project docs skeleton |
| 2026-10-31 | Aditya (Laptop 1) | Wrote docs/DESIGN.md: product scope, architecture, API, data model, lanes, 24h plan |
| 2026-10-31 | Aditya (Laptop 1) | Wrote docs/PLAN.md: task-by-task build plan for lanes A/B/C |
| 2026-10-31 | Aditya (Laptop 1) | Engine: dataset loader, checker (matches validator), timetable solver — 0 hard, soft 3 on public data |
| 2026-10-31 | Aditya (Laptop 1) | Engine done: exams, Spectra decisions (67/70), export (validator 0 hard), repair (13 moved on sample), explanations |
| 2026-10-31 | Aditya (Laptop 1) | Engine QA: rule/fuzz parity, brute-force optimality, adversarial + repair tests; fixed 12 bugs (see HANDOFF); faster provably-minimal repair; booking-aware base timetable |
| 2026-10-31 | Varun (Laptop 2) | Checked engine on Laptop 2: validator 0 hard on both exports; quick suite 353 passed, 2 timing-dependent repair tests failed (see HANDOFF) |
| 2026-10-31 | Varun (Laptop 2) | Lane B: API (auth, data, timetable, views, exams, bookings, changes, export), services, Gemini assistant with keyword fallback, 44 API tests, make_exports script; end-to-end via HTTP: validator 0 hard on both exports, soft 3, 17 moved |
| 2026-10-31 | Varun (Laptop 2) | Deploy prep: backend is 310 MB unzipped on Linux (181 MB without caches/tests) vs Vercel's 250 MB function limit; Procfile for PaaS. Assistant eval script + 53 cases; keyword fallback 17/20 dataset, 24/24 tricky, 4/4 change, guards ok |
| 2026-10-31 | Aditya (Laptop 1) | Reviewed Lane B (API 44/44, engine 355/355 green here); app now refuses to start deployed without a real JWT_SECRET |
| 2026-10-31 | Varun (Laptop 2) | Vercel prep: startup without lifespan events, throwaway SQLite on Vercel when no DATABASE_URL (health warns), pooler-safe Postgres, bearer auth in /api/docs, bundle excludes, README deploy steps; merged with Aditya's JWT_SECRET guard |
| 2026-10-31 | Varun (Laptop 2) | Lane C: frontend in `frontend/` (React 19, Vite, Tailwind 4, shadcn/ui-style Radix components, TanStack Query, Motion). Design research + "Signal" transit design system (frontend/DESIGN.md); all pages per role incl. timetable with "why here" slot map, booking assistant with live check, Spectra decision board, change diff with before/after playback; 18 unit tests. Not yet in vercel.json (see HANDOFF) |
| 2026-10-31 | Aditya (Laptop 1) | Deployed API to Vercel (project velora); 2 CPUs there, SOLVER_WORKERS=2 gives optimal soft 3 in 49 s |
| 2026-10-31 | Aditya (Laptop 1) | Neon connected; SOLVER_TIME_LIMIT_S=120; live end-to-end check at velora-campus.vercel.app: soft 3, exams 0, bookings 67/70, disruption 12 moved, validator 0 hard |
| 2026-10-31 | Aditya (Laptop 1) | Renamed the product to Velora (app, API title, export team name, docs); frontend served on Vercel at / |
| 2026-10-31 | Aditya (Laptop 1) | Book a venue: mic button (browser WAV -> Gemini transcription -> message box), "guessed" badge reworded to "auto-filled, please check" |
| 2026-10-31 | Aditya (Laptop 1) | Login page: bento layout; Admin tile plus Coordinator / Faculty / Club dropdowns; accounts for every department, faculty member and club in the dataset |
