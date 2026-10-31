# Velo: the assistant across Velora

Velo is the one assistant in Velora. It sits on every page, knows who you are and where you are, and answers with things you can act on: rooms you can book, a booking preview you can confirm, the reason a class is where it is. It never decides anything itself. Python decides; Velo finds, explains and drafts.

## 1. What we borrowed, and from where

| Product | Pattern | In Velo |
| --- | --- | --- |
| Perplexity | An answer is a short sentence plus structured results, then "related" follow-ups | Every reply is one or two sentences, then cards, then follow-up chips |
| Google Search and Maps | Refinement chips under the box; place cards with the two facts that matter and one action | Quick-action chips above the composer; room cards show seats, type, features and **Book this** |
| Airbnb and Booking.com | A review step before paying: what, when, where, what happens next | The booking preview: what the rule checker would decide right now, and **Send request** |
| Uber | A request moves through named states you can watch | Action progress: *Checking the rules → Sending → Deciding by priority → Done* |
| Intercom Fin, Shopify Sidekick | "Here's what I'll do" before doing it | A confirm card for every write: submit, cancel, request a move |
| Raycast, Spotlight, Linear | A launcher one shortcut away that knows the current screen | Floating launcher, Ctrl/Cmd J, and suggestions that change with the page |
| ChatGPT | The thread survives; empty state offers starting points | The conversation persists across pages and reloads; the empty state offers four prompts for your role and page |
| Google Assistant | "Here's what I heard" | The *Understood* strip: the intent and every detail Velo picked out, before the answer |

What we did **not** take: chat bubbles for everything, avatars that pretend to be a person, typewriter effects that slow the answer down, and any "AI magic" sparkle on top of plain facts.

## 2. Anatomy

**Launcher.** Bottom right on every signed-in page. On a computer it is a plate with the V block and "Ask Velo"; on a phone a square button above the bottom bar. A dot appears when Velo answered while the panel was closed. Ctrl/Cmd J opens and closes it from anywhere.

**Panel.** On a computer it docks bottom right (400 wide, up to 660 tall) with the same outline and hard shadow as every card, and can expand to a wide focus mode. On a phone it is a full-height sheet. Header: the Velo mark, a context pill (*On Timetable*, *On BR-03*), New chat, Expand, Close. Escape closes it and focus returns to the launcher.

**Empty state.** "Hi Anjali. Ask about rooms, bookings or your timetable." Four prompt cards chosen for the role and the page, and one line on what Velo can and can't do.

**A turn.**
1. Your message, right-aligned, plain.
2. *Understood* strip: the intent and the details, as chips (`Find a room` `Tue` `4–6 pm` `60 people` `projector`). If something was guessed, the chip says so.
3. The reply: one or two sentences, no lists of facts.
4. Cards (below).
5. Follow-up chips, written by the server for what you're likely to ask next.

**Composer.** Auto-growing text box, Enter sends, Shift+Enter for a new line, the mic (same transcription as Book a venue), Send. Context chips sit above it and change with the page.

## 3. Cards

| Card | Shows | Actions |
| --- | --- | --- |
| Rooms | Up to 6 free rooms: name, type, seats, features, step-free | **Book this** (starts a booking draft for that room), Find a room page |
| Booking draft | The fields Velo has, the ones still needed | Velo asks for the missing one in the thread; **Open in the form** |
| Booking preview | What the rule checker would decide right now: the slot and room, or why not, plus up to 3 alternatives and the category it counts as | **Send request** (confirm), Open in the form |
| Requests | Your requests with status lamps, slot and reason | Open, **Cancel** where allowed (confirm) |
| Explanation | Where a session is, why (the checker's facts), and the best free alternatives | Open in timetable, **Ask to move here** (confirm, if your role may) |
| Approvals | What is waiting for you, by kind | Open approvals, open each item |
| Proposals | Disruption repairs: sessions moved, soft penalty before and after, proven minimal, status | Open the proposal |
| Go to | The page Velo is opening | — |
| Confirm | What will happen, what gets checked, who approves next | Confirm, Not now |

Status uses the app's lamps and chips; numbers use the same type as the dashboards.

## 4. Flows

**Find a room.** "free rooms Tuesday 4 to 6 for 60 with projector" → Rooms card. **Book this** carries the room into a booking draft.

**Book through conversation.** "seminar hall kal 6 baje, 100 log" → Velo fills what it can and asks for the one missing thing ("For how long?"). Your next message ("2 hours") fills it; Velo doesn't ask again for anything it has. When the draft is complete, it runs the rule checker and shows the preview. **Send request** shows a confirm card, then progress, then the decision.

**Check status.** "what happened to my request?" or "status of BR-03" → Requests card with the reason the code gave.

**Explain.** On the timetable with a session open, "why is it here?"; anywhere, "why is CS101 on Monday?" → Explanation card. "Find another slot" → the free alternatives, cheapest in soft penalty first.

**Approvals.** "what's waiting for me?" → Approvals card (Admin and coordinators); others are told who approves their requests.

**Disruptions.** "explain the latest proposal" or "#4" → Proposal card with what moved and what it cost.

**Go.** "take me to exams" → Velo opens it and says so. It only offers pages your role can open.

## 5. Rules Velo keeps

- **The model only reads.** Gemini turns text into an intent and its details. Every answer comes from the same Python code the pages use: the room search, the booking checker, the explanations, the proposal summaries.
- **Writes go through the existing endpoints, after a confirm.** Velo's endpoint never writes. Submit, cancel and move requests are sent by the browser to `/bookings`, `/bookings/{id}/cancel` and `/changes` only after you press Confirm, so role checks and constraint validation are exactly the ones the forms use.
- **Works without the model.** If Gemini is down or slow, a keyword router and the booking parser's rules take over; the reply says "keyword mode".
- **Says what it understood and what it guessed.** Guessed details are marked; nothing is sent until you confirm.
- **Stays in its lane.** Velo doesn't chat about anything else; it says what it can do and offers chips.

## 6. Motion

Panel opens from the launcher's corner (scale 0.96 → 1, fade, 200 ms, ease-out); messages arrive with a 160 ms fade-up; the typing indicator is three blocks that rise in turn; action progress fills step by step. Reduced motion: fades only. Nothing loops except the typing indicator while Velo is working.

## 7. Context sent with each message

`page` (the path), `focus` (an open session, request or proposal, when there is one), the current booking `draft` (so a reply can fill it), the last `intent` and `today`. The thread itself stays in the browser (session storage, per user) and is never sent to the model.

## 8. Velo, alive: the orb and voice mode

The app around Velo stays Signal & Concrete. Velo itself gets one thing the app doesn't have: colour that moves. It is a small living orb, pink through violet and purple with a little amber, with two eyes.

### The orb

- **Form.** A sphere whose surface is pushed in and out by flowing noise, so it is never quite round and never still. Colour is a field that flows across it (pink, violet, deep purple, amber on the lower edge), lit from the upper left with a soft highlight and a bright rim, and a coloured glow behind it.
- **Eyes.** Two rounded shapes on the front. They blink every few seconds (sometimes twice), glance around when idle, and change shape with the mood: wider when listening, curved like a smile when happy, one squinted and tilted when confused, flat lines on an error.
- **Moods.** Every value (surface movement, speed, glow, colour, eye shape, gaze, float) eases toward the mood's target, so moods blend into each other instead of switching.

| Mood | When | Body | Eyes |
| --- | --- | --- | --- |
| Idle | Nothing happening | Slow float and breathing | Blinks, small glances |
| Listening | Mic on | Pulses with your voice level | Wide, looking at you |
| Thinking | Velo is working | Faster swirl, more energy | Look up and scan |
| Speaking | Velo's voice is playing | Moves with the actual audio | Open, small bounce |
| Happy | An answer that found something | Brief brighter glow | Smile arcs |
| Confused | Velo needs one more detail | Slower, slight tilt | One squints, head tilts |
| Error | Something failed | Colour drains a little, one small shake | Flat lines |

- **Where it lives.** The launcher, the panel header, and large on the empty thread with a "Hello!" bubble. Message avatars stay a still gradient dot, so a long thread costs nothing.
- **Cost.** One small canvas at a time outside voice mode, pixel ratio capped, mesh detail by size, rendering paused when the tab is hidden. The 3D code loads only when Velo is first shown. Without WebGL, a still gradient orb with the same eyes is used. With reduced motion the orb is still and the moods change colour and eyes only.

### Voice mode

The mic button in Velo opens voice mode: the chat steps back and the orb takes the stage.

- **Stage.** A dark room lit by the orb, with three thin energy rings turning on different axes, a slow field of particles that drift outward when sound arrives, and a waveform of the live audio below. On a computer it floats over the dimmed app; on a phone it fills the screen.
- **Transcript.** What you say appears as you say it (grey while it is still being heard, white once final), then Velo's reply.
- **States**, always named on screen: *Listening*, *Thinking*, *Speaking*, *Paused*, *Error*.
- **Controls.** Mute Velo's voice, the main mic button (pause or resume listening; while Velo speaks it interrupts), and End. Space toggles the mic, Escape ends.
- **Conversation.** After Velo speaks, it listens again, until you end. Every turn also goes into the chat thread with its cards. Anything that would change data is only shown as a preview: voice mode says so and the confirm stays in the chat.

### What is real

- **Hearing.** The browser's speech recognition where it exists (live words as you speak). Elsewhere, Velo records, waits for you to stop talking, and sends the recording to the server's transcription. If neither works, it says so and offers typing.
- **Speaking.** The server's Gemini voice when it is configured; its audio is played through the Web Audio API and the orb moves with that audio. Otherwise the browser's own voice, where the orb follows the real word timings it reports. If there is no voice at all, replies are shown as text and the screen says so.
- **Never faked.** No transcript appears unless a recogniser produced it, no speaking animation runs unless audio is actually playing, and denied permission, unsupported browsers and network failures are named plainly.
