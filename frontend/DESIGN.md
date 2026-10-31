# Frontend design: "Signal"

The visual identity and design system for the CIT Campus Scheduler web app. Product scope and API live in `docs/DESIGN.md`; this file covers how the app looks, moves and reads.

## 1. Research

What we looked at, and the one pattern we took from each.

| Reference | What it is | Pattern we took |
| --- | --- | --- |
| [SBB passenger information system](https://segd.org/resources/design-manual-swiss-federal-railways/) (Josef Müller-Brockmann, 1980 manual) | The Swiss railways' signs, departure panels and printed timetables, all on one simple grid | One grid and one typeface family for everything. Consistency is the feature. |
| [Schiphol wayfinding](https://www.mijksenaar.com/project/amsterdam-schiphol-airport/) (Mijksenaar), [analysis](https://uxdesign.cc/wayfinding-at-schiphol-some-design-considerations-behind-the-world-famous-vi-system-and-what-29842b368252) | Airport signs colour-coded by function: yellow for departures and arrivals, anthracite for waiting areas | Black on yellow means "this is where you are going". Keep the palette small, because people confuse yellow with orange and orange with red. |
| [DB station timetables](https://fotoeins.com/2015/02/16/how-to-read-signage-at-german-rail-stations) | German stations print departures on yellow paper and arrivals on white | A timetable can be a sheet you read top to bottom. Yellow marks what is about to leave. |
| [Vignelli / Noorda NYC Transit standards](https://www.moma.org/explore/inside_out/2014/06/23/the-subway-and-the-city-massimo-vignelli-1931-2014/) | Route bullets: a letter in a coloured circle | Session kinds as bullets (L, T, P), so kind never depends on colour alone. |
| Solari split-flap boards; open-source React ports such as [react-split-flap-display](https://github.com/ashtom/react-split-flap-display) | Mechanical boards where every character flips into place | The flip as the visible moment a decision is made. |
| [25Live availability grid](https://kb.wisc.edu/registrar/129935) (CollegeNET), [Cornell's guide](https://scheduling.cornell.edu/getting-help/how-instructions-using-schedulingcornell/using-locations-availability-grid) | The room-booking standard in US universities: rooms down the side, time across, coloured bars for bookings | Rooms × periods grid where blank means free and a click on a free cell starts a booking. |
| [Skedda floor plans](https://support.skedda.com/en/articles/4225747-floor-plans-and-maps) | Desk and room booking with a time-of-day slider over the map | A time scrubber that lights up the rooms free at that moment. |
| [Linear UI redesign](https://linear.app/now/how-we-redesigned-the-linear-ui) | Themes generated in LCH from base, accent and contrast | Define colour in OKLCH so light and dark keep the same perceived contrast. Command palette for jumping anywhere. |
| [NASA Open MCT](https://github.com/nasa/openmct/issues/933) | Mission-control framework with a shared time conductor and plan swimlanes | Swimlanes (one lane per venue) for Spectra week. |
| [Departure Mono](https://departuremono.com) (Helena Zhang, Tobias Fried) | A pixel font named after departure boards | Confirmed that "departure board" reads as an identity on screen. We use a condensed grotesk on flaps instead: real boards and signs use grotesks, and pixel type hurts dense tables. |
| FIDS guidance ([TRB](https://trid.trb.org/View/78937)) | Flight information displays | Colour only where it uniquely carries meaning; short labels; fixed column positions. |

## 2. Directions explored

| Direction | Idea | Memorable | Dense timetable readable | Light + dark | Risk |
| --- | --- | --- | --- | --- | --- |
| A. **Signal** (transit information design) | The campus as a station: timetables are printed sheets, decisions appear on a split-flap board, yellow marks where you are | High: the board and the yellow signs | High: built for tables | Both natural: "sheet" by day, "board" by night | Must not become a costume; the metaphor stays in the visuals, the words stay plain |
| B. Editorial almanac | Serif display, footnotes for "why here?", magazine pacing | Medium | Low: whitespace fights 189 sessions | Light only really works | Looks like every AI-generated editorial page |
| C. Mission control | Dark glass panels, telemetry, glowing cyan | Medium, but generic | Medium | Dark only | Sci-fi cliché; lowers trust for a dean's office |
| D. Pure Swiss grid | Helvetica-like type, red accent, asymmetric grid | Low: close to any SaaS dashboard | High | Both | Cold and forgettable |
| E. Paper planner | Index cards, rubber stamps, graph paper | High | Low | Light only | Skeuomorphic kitsch |

**Chosen: A, Signal.** It is the only direction where the metaphor and the problem are the same thing: a timetable is a timetable. We borrow one idea from E (the approval stamp, which is also how a ticket gets validated) and the grid discipline of D.

## 3. Principles

1. **Signage, not dashboard.** One type family at several widths. Anthracite, white, platform grey and yellow. Colour carries information or nothing.
2. **The board is the hero.** The split-flap board appears where the system makes a decision: generating the timetable, deciding Spectra week, the dashboard status. Everything around it stays quiet.
3. **Read like a printed timetable.** Tabular figures, codes never truncated, a visible lunch band, rows you can follow with a finger.
4. **Motion is mechanical and causal.** Characters flip when a value changes. Sessions glide when they move. Nothing loops forever, and reduced motion turns every flip and glide into an instant swap.
5. **Yellow means "here" or "changed".** Your page in the nav, the current period, the focused field, a moved session, a guessed field in the booking form. Never decoration.

## 4. Design system

### Colour

Tokens live in `src/styles/tokens.css` as OKLCH, with light and dark values. Approximate hex for reference:

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `platform` | `#E6E9EC` | `#15181C` | App background |
| `sheet` | `#FFFFFF` | `#1D2126` | Timetables, forms, lists |
| `ink` | `#15191E` | `#ECEFF2` | Text, primary buttons |
| `anthracite` | `#24292F` | `#0D0F11` | Boards, nav rail |
| `signal` (yellow) | `#FFD02B` | `#FFD02B` | You are here, changed, focus, primary sign |
| `clear` | green | brighter green | Approved, valid, 0 violations |
| `stop` | red | brighter red | Rejected, hard conflict |
| `wait` | grey | grey | Pending approval, submitted |

Session kinds are "line colours" used as cell tints and bullet fills, always paired with a letter: lecture **L** (blue), tutorial **T** (teal), lab **P** for practical (violet), exam **E** (ink), event **★** (magenta, hatched). Kinds never use the signal colours, and statuses always come with a lamp shape and a word. The four hues were run through a palette validator in both themes: lightness band, chroma floor, colour-blind separation (worst pair ΔE 11.9) and normal-vision separation (worst pair ΔE 15.2, floor 15). The first attempt failed that last check (blue and teal too close) and was re-stepped.

### Type

Archivo (variable, OFL) for everything, through its width axis:

| Role | Size / line | Width | Weight |
| --- | --- | --- | --- |
| Board flaps | 13–44px, caps | 75 | 700 |
| Page title | 26 / 30 | 100 | 700 |
| Section heading | 16 / 22 | 100 | 650 |
| Body, controls | 14 / 20 | 100 | 450 |
| Codes in cells (CR-101, MA101) | 12.5 / 16 | 80 | 650 |
| Meta, captions | 12 / 16 | 90 | 450 |

All numbers use tabular figures. Sentence case everywhere except the board, where caps are the medium's own.

### Shape and layout

- 4px base unit. Page gutter 24px desktop, 16px phone.
- Radius by hierarchy: sign panels 12px, sheets 10px, cells and inputs 6px, lamps and bullets round. No drop shadows: elevation is a 1px border plus a 1px darker bottom rule, like a mounted sign.
- Navigation is a route map: a vertical line with one stop per page; your stop gets the yellow ring. Each role sees only its own stops. On phones it becomes a bottom bar.

### Components

`SplitFlap` (flip text), `Board` and `BoardRow`, `Lamp` (status signal), `KindBullet`, `Stamp` (approval), `RouteNav`, `TimetableGrid` with `SessionCell`, `ExplainDrawer`, `DotMatrix` (room use), `Ticket` (what the code would book), `TrackProgress` (solver progress with elapsed seconds), `NoticeCard` (a change proposal), `DiffGrid` and `MoveBoard`. UI primitives are shadcn/ui-style components over Radix in `src/components/ui`.

### Motion

| Token | Duration | Easing | Used for |
| --- | --- | --- | --- |
| `flap` | 66ms per step, at most 7 steps per tile, 22ms between tiles | linear | Split-flap characters |
| `quick` | 150ms | `cubic-bezier(.2,.8,.2,1)` | Hover, press, lamp change |
| `move` | about 320ms | spring (stiffness 380, damping 34) | Sessions gliding to a new slot |
| `enter` | 220ms, 28ms stagger, capped at 14 rows | `cubic-bezier(.2,.8,.2,1)` | Board rows and cells arriving |

One orchestrated moment per screen. Decisions flip in the order the solver made them (Spectra requests in priority order). `prefers-reduced-motion` swaps every flip and glide for an instant change and keeps only 120ms fades.

### Responsive

Desktop ≥1024px: route rail plus content. Tablet: the rail collapses to icons. Phone (375px): bottom bar, the timetable becomes a day picker plus a list, boards become stacked rows, no horizontal page scroll.
