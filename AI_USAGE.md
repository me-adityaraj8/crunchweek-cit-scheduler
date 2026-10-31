# AI Usage

## Models / APIs called by the product

| Model | Called from | Used for |
| --- | --- | --- |
| Google Gemini 2.5 Flash (`GEMINI_MODEL`), JSON-schema output | `backend/app/llm/client.py` | Turning plain English/Hinglish venue requests into booking form fields (`parse_booking.py`); turning faculty/coordinator chat into a change request (`parse_change.py`); rewording reasons the code already computed into plain sentences (`reword.py`, only when the user asks) |

If the key is missing, the call fails, times out (`LLM_TIMEOUT_S`) or returns anything but valid JSON, the app uses keyword rules in the same files instead and tells the user. The manual booking form never needs the LLM.

## AI tools used to build the project

- Claude Code (Anthropic): repo setup and docs; the engine (`backend/app/core`, `backend/app/solver`) and its tests; the API, services, LLM layer and API tests (`backend/app/*.py`, `routers/`, `services/`, `llm/`, `backend/tests/api`), deployment config and `scripts/make_exports.py`; design and build plan in `docs/`.

## Where prompts are kept

`backend/app/llm/prompts/`: `booking.md`, `change.md`, `reword.md`. Room, group and course lists are passed in as data on each call, never written into the prompts.

## What the LLM is not allowed to decide

Whether any timetable, exam slot, booking or change is valid, approved or rejected. The LLM only extracts fields. After it, code (not the prompt):

- caps the event category by the user's role;
- resolves "kal"/"tomorrow" against a visible reference day;
- turns times into periods using the calendar;
- drops a named room that lacks a requested need and says so;
- asks a follow-up when the head count or day is missing.

Every booking and change then goes through `backend/app/core/checker.py` and the solvers. The LLM output schema has no status or approval field.
