# Third-Party Libraries

| Library | Version | Licence | Used for |
| --- | --- | --- | --- |
| Google OR-Tools (CP-SAT) | 9.15.6755 | Apache-2.0 | Timetable, exam, Week-7 and repair solving |
| FastAPI | 0.162.0 | MIT | HTTP API |
| Starlette (via FastAPI) | 1.10.0 | BSD-3-Clause | ASGI framework under FastAPI |
| Uvicorn | 0.54.0 | BSD-3-Clause | ASGI server (local runs and PaaS hosting) |
| Pydantic | 2.14.2 | MIT | Request/response and LLM output schemas |
| SQLAlchemy | 2.1.6 | MIT | Database access |
| psycopg (binary) | 3.3.6 | LGPL-3.0 | Postgres driver |
| PyJWT | 2.15.1 | MIT | Login tokens |
| bcrypt | 5.0.0 | Apache-2.0 | Password hashing |
| httpx | 0.28.1 | BSD-3-Clause | Gemini and Groq API calls, test client, exports script |
| python-multipart | 0.0.32 | Apache-2.0 | JSON file uploads as form data |
| pytest | 9.2.0 | MIT | Tests (dev only) |

## Frontend (`frontend/package.json`, exact versions pinned)

| Library | Version | Licence | Used for |
| --- | --- | --- | --- |
| React, React DOM | 19.2.9 | MIT | UI |
| React Router | 7.18.5 | MIT | Pages and deep links |
| TanStack Query | 5.105.0 | MIT | API data fetching and cache |
| Motion (formerly Framer Motion) | 12.43.0 | MIT | Animations: session glides, diff playback, stamps, reorder list |
| Radix UI primitives (dialog, dropdown menu, label, popover, select, slot, switch, toggle group, tooltip) | 1.3.1 / 2.2.1 / 2.1.17 / 1.3.1 / 2.4.1 / 1.5.0 / 1.4.1 / 1.2.1 / 1.4.1 | MIT | Accessible building blocks under the shadcn/ui-style components |
| cmdk | 1.1.1 | MIT | "Where to?" command palette |
| sonner | 2.0.8 | MIT | Toasts |
| lucide-react | 1.66.0 | ISC | Icons |
| class-variance-authority | 0.7.1 | Apache-2.0 | Component variants |
| clsx | 2.1.1 | MIT | Class names |
| tailwind-merge | 3.7.0 | MIT | Class names |
| Tailwind CSS, @tailwindcss/vite | 4.1.18 | MIT | Styling |
| Inter variable font (@fontsource-variable/inter) | 5.3.0 | OFL-1.1 | Text and headings |
| Geist Mono variable font (@fontsource-variable/geist-mono) | 5.3.0 | OFL-1.1 | Codes, caps labels, the split-flap boards |
| GSAP + ScrollTrigger (gsap) | 3.13.0 | GSAP Standard License (free, incl. commercial) | Landing page motion (entrances, reveals, product preview, scroll rail) |
| three.js (three) | 0.186.1 | MIT | 3D rendering for Velo's animated orb |
| React Three Fiber (@react-three/fiber) | 9.8.1 | MIT | React renderer for three.js (the Velo orb) |
| Vite, @vitejs/plugin-react | 7.3.7, 5.2.0 | MIT | Dev server and build |
| TypeScript | 5.9.3 | Apache-2.0 | Types (dev only) |
| openapi-typescript | 7.13.0 | MIT | API types generated from `/api/openapi.json` (dev only) |
| Vitest, Testing Library (react, dom), jsdom | 3.2.7, 16.3.3, 10.4.2, 26.1.0 | MIT | Frontend tests (dev only) |
| @types/three | 0.186.0 | MIT | Types for three.js (dev only) |
