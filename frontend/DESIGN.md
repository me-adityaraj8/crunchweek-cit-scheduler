# Frontend design: "Signal & Concrete"

The visual identity and design system for the Velora web app. Product scope and API live in `docs/DESIGN.md`; this file covers how the app looks, moves and reads.

The app started as "Signal" (sections 1 to 3). A second pass, "Signal & Concrete", kept the signage idea and gave it a neo-brutalist build: ink outlines, hard offset shadows, pastel session fills and one yellow. Section 4 describes the current look.

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

**Second pass: Signal & Concrete.** Taken from a neo-brutalist task dashboard (D-Tasks on Dribbble): every component outlined in ink, shadows that are solid offsets rather than blur, flat pastel cards, chunky expanded type. Three directions were drawn on a canvas (concrete day, sticker pastel, "Night Shift" dark); concrete day became the light theme and Night Shift the dark one.

**Third pass: dashboards and Night Shift.** Three references from Skills UI, each used for one idea and no more. From *Fitness Dashboard*: the app as one framed canvas on a deeper page, one hero card per view, a different small chart on every metric, and tiles layered inside cards. From *Neobrutalism*: heavy outlines on what you act on while text sections breathe, small caps labels above titles, and the press effect (shadow collapses as the button sinks). From *Dark Luxury*, for the dark theme: no pure black, quiet outlines, and the accent kept for the main action, where you are and the headline number.

**Dark theme: Graphite.** A gold-on-black Night Shift was tried and dropped: it read as yellow and black. Graphite replaces it with blue-grey surfaces, slate outlines, concrete-white plates wherever daylight has yellow, and the same pastel session fills as daylight with dark type inside them, so the timetable stays colourful at night.

## 3. Principles

1. **Signage, not dashboard.** One type family at several widths. Anthracite, white, platform grey and yellow. Colour carries information or nothing.
2. **The board is the hero.** The split-flap board appears where the system makes a decision: generating the timetable, deciding Spectra week, the dashboard status. Everything around it stays quiet.
3. **Read like a printed timetable.** Tabular figures, codes never truncated, a visible lunch band, rows you can follow with a finger.
4. **Motion is mechanical and causal.** Characters flip when a value changes. Sessions glide when they move. Nothing loops forever, and reduced motion turns every flip and glide into an instant swap.
5. **Yellow means "here" or "changed".** Your page in the nav, the current period, the focused field, a moved session, a guessed field in the booking form. Never decoration.

## 4. Design system

### Colour

Tokens live in `src/styles/tokens.css`, with light and dark values:

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `platform-2` | `#D0D3CD` | `#0B0D10` | The page around the framed canvas |
| `platform` | `#E3E5E1` | `#15181D` | The canvas (concrete by day, graphite at night, dotted) |
| `sheet` | `#FFFFFF` | `#1C2027` | Cards, timetables, forms, lists |
| `sheet-2` | `#F4F5F2` | `#252A32` | Tiles inside cards, chart tracks |
| `ink` | `#111111` | `#E9EDF2` | Text |
| `rule-strong` | `#111111` | `#566170` | The outline on every component (slate at night) |
| `anthracite` | `#111111` | `#0F1216` | Boards, the V block |
| `signal` | `#FFD23F` yellow | `#E4E7E2` concrete white | The action colour: primary buttons, your page, today, the hero card |
| `caution` | `#FFD23F` | `#F0C850` | Status only: another slot offered, waiting, partial |
| `mark` | `#FFD23F` | `#8FC3EE` | The one highlighted mark in a chart |
| `shade` | `#111111` | `#07090B` | Hard offset shadows |
| `clear` | green | brighter green | Approved, valid, 0 violations |
| `stop` | red | brighter red | Rejected, hard conflict |
| `wait` | grey | grey | Pending approval, submitted |

Session kinds are flat pastel fills with an ink outline, always paired with a letter: lecture **L** (`#9ED2FF`), tutorial **T** (`#FFB98A`), lab **P** for practical (`#CDB8FF`), exam **E** (`#FF9EB5`), event **★** (`#C6F06B`, hatched in the grid). At night the pastels stay (a touch softer) and anything inside a pastel fill, or inside a light plate such as the hero card, keeps daylight's dark type, white chips and ink outline (the `.dark [class*="-tint"]` and `.on-light` rule in `index.css`). Text on the pastels is ink, never grey-on-colour. Kinds never use the signal colours, and statuses always come with a lamp shape and a word.

### Type

Archivo (variable, OFL) for everything, through its width axis:

| Role | Size / line | Width | Weight |
| --- | --- | --- | --- |
| Board flaps | 13–44px, caps | 75 | 700 |
| Login headline | 42–68 / 0.92, caps | 112 | 900 |
| Page title | 26–30 / 30–34, caps | 112 | 900 |
| Section heading | 16 / 22 | 104 | 900 |
| Body, controls | 14 / 20 | 100 | 450 |
| Codes in cells (CR-101, MA101) | 12.5 / 16 | 80 | 650 |
| Meta, captions | 12 / 16 | 90 | 450 |

All numbers use tabular figures. Sentence case everywhere except the board, page titles and the login headline.

### Shape and layout

- 4px base unit. Page gutter 24px desktop, 16px phone.
- Every component has a 2px ink outline. Radius: cards 6px, controls 4px, chips 3px; lamps, dots and bullets stay round.
- Elevation is a solid offset shadow with no blur: 2px for controls and cells, 4px for cards and menus, 6 to 8px for dialogs, the drawer and the login sheet. No gradients, no glass; overlays are a flat 45% black.
- Navigation is a list of plates; your page is a yellow plate with an outline and shadow. Each role sees only its own pages. On phones it becomes a bottom bar.
- From tablet width up the whole app is one framed canvas (2px outline, hard shadow) on the deeper `platform-2` page, and the canvas scrolls inside. Phones stay full-bleed.

### Metrics

Every page with numbers leads with a row of `MetricCard`s (`src/components/dashboard/Metrics.tsx`): a small caps label, one big figure in the same sans (proportional digits), a one-line note, and a chart of its own. Exactly one card per page is the yellow hero. No two cards in a row share a chart:

| Chart | Used for |
| --- | --- |
| `RuleTicks` | Timetable health: one tick per hard rule, a short red stub when one breaks |
| `MiniColumns` | Soft penalty by rule, exams by day, teaching hours by day; the tallest columns (all, on a tie) take the accent |
| `RingMeter` | A ratio against its limit: booking score, exam seats used |
| `DotRow` | Counts up to about 60: exams placed |
| `StackBar` | Part-to-whole by status, 2px gaps, legend with values: Spectra decisions, change requests |
| `CompareBars` | Before and after on one scale: a repair's soft penalty |
| `RoomLoad` | Rooms in use in every teaching period of the week, busiest period marked, with three inset tiles beside it |

Every chart reads out what the pointer is on in a line beneath it and carries a screen-reader summary or table. Status colours appear only where they mean a status.

### Components

`SplitFlap` (flip text), `Board` and `BoardRow`, `Lamp` (status signal), `KindBullet`, `Stamp` (approval), `RouteNav`, `TimetableGrid` with `SessionCell`, `ExplainDrawer`, `DotMatrix` (room use), `Ticket` (what the code would book), `TrackProgress` (solver progress with elapsed seconds), `NoticeCard` (a change proposal), `DiffGrid` and `MoveBoard`. UI primitives are shadcn/ui-style components over Radix in `src/components/ui`.

### Motion

| Token | Duration | Easing | Used for |
| --- | --- | --- | --- |
| `flap` | 66ms per step, at most 7 steps per tile, 22ms between tiles | linear | Split-flap characters |
| `press` | hover 140ms, press 80ms | `cubic-bezier(.23,1,.32,1)` | Buttons and cells lift 1px on hover and sink onto their shadow when pressed (unlayered CSS, so it beats the shadow utilities) |
| `meter` | 700ms | `cubic-bezier(.23,1,.32,1)` | A ring meter filling once on arrival |
| `move` | about 320ms | spring (stiffness 380, damping 34) | Sessions gliding to a new slot |
| `enter` | 220ms, 28ms stagger, capped at 14 rows | `cubic-bezier(.23,1,.32,1)` | Board rows and cells arriving |

One orchestrated moment per screen. Decisions flip in the order the solver made them (Spectra requests in priority order). `prefers-reduced-motion` swaps every flip and glide for an instant change and keeps only 120ms fades.

### Responsive

Desktop ≥1024px: route rail plus content. Tablet: the rail collapses to icons. Phone (375px): bottom bar, the timetable becomes a day picker plus a list, boards become stacked rows, no horizontal page scroll.
