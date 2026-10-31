# Frontend

The web app for the CIT Campus Scheduler. Design system and research: [DESIGN.md](DESIGN.md).

```bash
npm ci
npm run dev        # http://localhost:5173, proxies /api to http://localhost:8000
npm test           # unit tests (Vitest)
npm run build      # type check, then production build into dist/
npm run types      # regenerate src/api/schema.d.ts from the running API's OpenAPI
```

`frontend/.env.local` (not committed) can set `API_PROXY` to use another API address in dev. `VITE_DEMO_PASSWORD` sets the password the login page's demo buttons send (default `demo1234`).

## Layout

```
src/api/            client.ts (fetch, bearer token, error shape), hooks.ts (TanStack Query), types.ts, schema.d.ts (generated)
src/lib/            auth, theme, roles (navigation per role), time model, labels for the starter-pack codes
src/styles/         tokens.css: every colour, light and dark
src/components/
  ui/               shadcn/ui-style primitives on Radix: button, field, select, dialog + drawer, overlays, controls
  board/            the signature pieces: SplitFlap, Board, signal lamps, kind bullets, stamp, track progress
  timetable/        TimetableGrid (week), RoomDayGrid (rooms x periods), ExplainDrawer, lane layout
  booking/          ChatPane, BookingForm (live check), Ticket
  changes/          diff model and DiffView (before/after playback, moves board)
  dashboard/        DotMatrix (room use), GenerateCard
  shell/            AppShell (route-line nav, top bar, phone bar), CommandPalette
src/pages/          one file per page; lazy-loaded
```

Every API call goes through `src/api`. Validity is never decided here: the UI shows what the API's checker says.
