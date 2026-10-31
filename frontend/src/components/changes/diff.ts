import type { Entry, Move, Proposal, Slot } from "@/api/types";
import { kindOf } from "@/lib/format";
import type { GridItem } from "@/components/timetable/layout";
import type { Mark } from "@/components/timetable/TimetableGrid";

export type ChangeKind = "time" | "room" | "added" | "removed";

export function changeKind(m: Move): ChangeKind {
  if (!m.before) return "added";
  if (!m.after) return "removed";
  return m.before.day === m.after.day && m.before.start === m.after.start ? "room" : "time";
}

const same = (a: Slot | null | undefined, b: { day: string; start: number; room: string }) => !!a && a.day === b.day && a.start === b.start && a.room === b.room;

/** Duration of a session the proposal adds (it is only described in the change file). */
function addedDuration(p: Proposal, sid: string) {
  const changes = (p.payload?.changes as { type: string; session?: { id: string; duration?: number } }[] | undefined) ?? [];
  return changes.find((c) => c.type === "add_session" && c.session?.id === sid)?.session?.duration ?? 1;
}

/**
 * Before and after grids for one group or room. `current` is that entity's live timetable, which is
 * either the proposal's base (still pending) or its result (already applied); the moves give the
 * other state. Sessions that move in or out of the entity are rebuilt from the move itself.
 */
export function diffItems(p: Proposal, current: Entry[], view: "group" | "room", id: string) {
  const moves = new Map(p.diff.map((m) => [m.session_id, m]));
  const applied = p.diff.some((m) => {
    const e = current.find((x) => x.session_id === m.session_id);
    return e && m.after && same(m.after, { day: e.day, start: e.start_period, room: e.room_id }) && !same(m.before, { day: e.day, start: e.start_period, room: e.room_id });
  });
  const known = new Map(current.map((e) => [e.session_id, e]));
  for (const m of p.diff) {
    if (known.has(m.session_id)) continue;
    const at = m.after ?? m.before!;
    known.set(m.session_id, {
      session_id: m.session_id,
      course_id: m.course_id ?? m.session_id,
      course_title: m.course_id ?? "",
      kind: m.kind ?? "lecture",
      day: at.day,
      start_period: at.start,
      // not in this entity's live timetable: labs run three periods in the starter-pack time model
      duration: m.before ? (m.kind === "lab" ? 3 : 1) : addedDuration(p, m.session_id),
      room_id: at.room,
      faculty_id: "",
      faculty_name: "",
      groups: m.groups ?? [],
      size: 0,
      basket_slot: null,
      week7_moved: false,
    });
  }
  const belongs = (e: Entry, room: string) => (view === "group" ? e.groups.includes(id) : room === id);
  const item = (e: Entry, s: { day: string; start: number; room: string }, key = e.session_id): GridItem => ({
    key,
    day: s.day,
    start: s.start,
    end: s.start + e.duration - 1,
    kind: kindOf(e.kind),
    room: s.room,
    entry: { ...e, day: s.day, start_period: s.start, room_id: s.room },
  });

  const before: GridItem[] = [];
  const after: GridItem[] = [];
  const ghosts: GridItem[] = [];
  const marksBefore = new Map<string, Mark>();
  const marksAfter = new Map<string, Mark>();
  for (const e of known.values()) {
    const m = moves.get(e.session_id);
    const live = { day: e.day, start: e.start_period, room: e.room_id };
    const b = m ? m.before : live;
    const a = m ? m.after : live;
    if (b && belongs(e, b.room)) before.push(item(e, b));
    if (a && belongs(e, a.room)) after.push(item(e, a));
    if (!m) continue;
    const k = changeKind(m);
    if (k === "added" && a && belongs(e, a.room)) marksAfter.set(e.session_id, "added");
    if (k === "removed" && b && belongs(e, b.room)) {
      marksBefore.set(e.session_id, "removed");
      ghosts.push(item(e, b, `${e.session_id}-was`));
    }
    if ((k === "time" || k === "room") && a && belongs(e, a.room)) {
      marksAfter.set(e.session_id, k === "time" ? "moved" : "room");
      marksBefore.set(e.session_id, k === "time" ? "moved" : "room");
    }
    if (k === "time" && b && belongs(e, b.room)) ghosts.push(item(e, b, `${e.session_id}-was`));
    if (k === "room" && b && belongs(e, b.room) && !(a && belongs(e, a.room))) ghosts.push(item(e, b, `${e.session_id}-was`));
  }
  return { before, after, ghosts, marksBefore, marksAfter, applied };
}

/** Groups and rooms the proposal touches, most-affected first. */
export function affected(p: Proposal) {
  const groups = new Map<string, number>();
  const rooms = new Map<string, number>();
  for (const m of p.diff) {
    for (const g of m.groups ?? []) groups.set(g, (groups.get(g) ?? 0) + 1);
    for (const s of [m.before, m.after]) if (s) rooms.set(s.room, (rooms.get(s.room) ?? 0) + 1);
  }
  const sort = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return { groups: sort(groups), rooms: sort(rooms) };
}
