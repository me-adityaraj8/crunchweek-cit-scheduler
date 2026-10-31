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
