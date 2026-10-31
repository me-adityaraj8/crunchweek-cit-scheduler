# Velo agent: audit and plan

## 1. What exists today (audit, 1 Nov)

| Area | State | Keep / change |
|---|---|---|
| LLM provider | Gemini only (`llm/client.py`): JSON-schema calls for parsing, audio transcription, TTS. **No Groq code and no Groq key anywhere.** | Keep Gemini for voice. Add an OpenAI-compatible chat client with tool calling; Groq is the default provider. |
| Velo (`/api/velo`) | Keyword rules, then a model classifier, choose one of 10 fixed intents; one handler per intent builds cards from existing services. Read-only; writes go from the browser to the normal endpoints after a confirm. | Kept as the fallback when no model is configured or the model fails. |
| Conversation memory | Browser only (`sessionStorage`), plus `draft_text`/`last_intent` echoed back for booking follow-ups. No conversation id, no entity memory. | Add server-side conversations, messages, entity memory, expiry. |
| Permissions | Real and server-side: `current_user`, `require_roles`, ownership checks inside services (`bookings.cancel`, `_intent_to_changes`, faculty timetable guard). | Every tool re-checks role and ownership before calling the same services. |
| Audit log | `AuditLog` table and `state.audit()`; written by services on every change. | Velo logs previews, confirmations, discards and permission denials too. |
| Reusable services | room search (`rooms_free`), booking parser and checker (`parse_booking`, `bookings.check/submit/cancel/decide`), Spectra board (`bookings.summary`, explain booking), session explanations (`explain_session`), proposals and repair (`proposals.from_changes/from_move/approve/reject`), exams (`get_exams`), dashboard utilisation and conflicts. | All tools map onto these. Nothing is reimplemented. |
| Gaps found | No room occupancy view by period; no faculty workload; no dry-run for a disruption (`from_changes` always saves); no comparison of timetable versions; no physical occupancy data. | Occupancy and workload are computed from the active timetable (scheduled, never "live"). Disruption dry-run reuses the same repair code without saving. Physical occupancy is reported as not available. |
| Spectra priority | Authoritative order comes from the dataset: `exam > regular_session > institute_event > guest_lecture > department_event > club_event`, with each role capped (`role_category_cap`). `core/priority.py` applies it. | Velo explains decisions with that code and that order. It never ranks anything itself. |

## 2. Architecture

```
browser ──POST /api/velo {text, page, focus, conversation_id}──▶ routers/velo.py
                                                                    │
                                     agent configured? ── no ──▶ services/velo.py (rules, unchanged)
                                                                    │ yes
                                    services/velo_agent.py  ◀───────┘
   Conversation manager   load/expire conversation, last 8 messages + entity memory + summary
   Context resolver       role, department, faculty id from the token; page and open item from the request
   Intent + tool choice   the model, through function calling, sees only the tools this role may use
   Tool orchestrator      ≤ AGENT_MAX_STEPS rounds; args validated by pydantic; duplicate calls served from cache
   Permission layer       every tool re-checks role and ownership on the server before running
   Response generator     the model's final text, grounded in tool results; cards come from tools, not the model
                                                                    │
                       services/velo_tools.py ─▶ existing services, checker, OR-Tools repair
```

Writes never happen inside the loop. An action tool (`submit_booking`, `cancel_booking`, `create_change_proposal`,
`decide_request`) validates with the real checker and stores a **pending action**: the arguments, a preview, and the
timetable version it was checked against. The person presses Confirm; `POST /api/velo/actions/{id}/confirm`
re-checks permission and staleness, then runs the same service the page uses, exactly once. A second confirm returns
the first result (idempotent). A confirm against a changed timetable is refused as stale. Actions expire after
`VELO_ACTION_TTL_MIN`.

Prompt injection: the role comes from the token, never the text; tool results are passed to the model as data;
tools a role can't use are not offered, and are refused if called anyway (and logged).

Failure handling: bounded retries on 429/5xx (honours `retry-after`, capped), a per-call timeout, and a step
limit. If the model is down before any tool ran, the rule-based Velo answers instead. If it fails mid-way, the
cards already produced are returned with an honest note. Manual pages never depend on Velo.

## 3. Tools

Read: `get_my_timetable`, `get_faculty_schedule`, `get_group_schedule`, `find_available_rooms`, `get_room_details`,
`get_room_occupancy`, `get_booking_status`, `get_pending_approvals`, `get_schedule_conflicts`, `get_exam_schedule`,
`get_spectra_decisions`, `get_room_utilisation`, `get_faculty_workload`, `explain_scheduling_decision`,
`list_change_proposals`.

Simulation: `create_booking_draft` (checker preview, saves nothing), `simulate_disruption` (repair dry run),
`compare_schedule_versions` (a proposal against the active timetable), `generate_analytics_report`.

Action (pending until confirmed): `submit_booking`, `cancel_booking`, `create_change_proposal`, `decide_request`.

Navigation: `navigate_to_page` (role-filtered routes).

## 4. Configuration

`LLM_PROVIDER` (`groq` or `gemini`; default `groq` when `GROQ_API_KEY` is set, otherwise `gemini`), `GROQ_API_KEY`,
`GROQ_MODEL=openai/gpt-oss-120b`, `AGENT_MAX_STEPS=5`, `AGENT_RETRIES=2`, `VELO_CONTEXT_TTL_MIN=120`,
`VELO_ACTION_TTL_MIN=15`. Gemini runs through its OpenAI-compatible endpoint with the existing `GEMINI_API_KEY`.

## 5. Phases

1. Audit (this document).
2. Chat client with tool calling, retries and a fake transport for tests.
3. Tool registry, permission layer, read tools against real data.
4. Pending actions, confirm/discard endpoints, audit entries.
5. Agent loop, conversation memory, frontend cards (table, bars, stats, occupancy, action).
6. Tests with a scripted model against the real seeded database; a live evaluation of 40+ scenarios
   (`python -m backend.eval.velo_eval`) that reports intent, tool selection, completion, clarification rate,
   latency and refusals.

## 6. Not done (and why)

- Token streaming: the reply is produced after tool calls finish; Vercel's Python functions buffer responses.
  The panel shows a thinking state instead.
- Real-time occupancy: there is no sensor or check-in data, so occupancy is always "scheduled".

## 7. Status (1 Nov)

- Tests: `backend/tests/api/test_velo_agent.py`, 21 tests with a scripted model on the real seeded database: tool
  results equal the pages' endpoints (room finder, room timetable, exams), follow-ups keep the room and day,
  role-filtered tools, refused and logged permission attempts, faculty timetable privacy, confirm-once, someone
  else's confirm, expiry, staleness, cancel through confirm, change proposal only on confirm, simulation saves
  nothing, model down before and after a tool, malformed and unknown tool calls, repeated calls and the step cap,
  conversation ownership. The 27 earlier Velo tests still pass.
- Eval, keyword router only (no model key), local: 49 scenarios, 44.9% complete, 41.5% right tool, 0 forbidden
  tool uses, 0% follow-ups, average 79 ms. This is the baseline the agent replaces.
- Not yet measured: the agent with a live model. No Groq key exists in this repo's environments yet. Set
  `GROQ_API_KEY` (or rely on `GEMINI_API_KEY` with `LLM_PROVIDER=gemini`) and run
  `python -m backend.eval.velo_eval --base <url>`.
