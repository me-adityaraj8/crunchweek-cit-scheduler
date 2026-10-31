import { describe, expect, it } from "vitest";
import type { Entry, Proposal } from "@/api/types";
import { affected, changeKind, diffItems } from "./diff";

const entry = (session_id: string, day: string, start: number, room: string, groups = ["CSE-2"]): Entry => ({
  session_id,
  course_id: session_id.split("-")[0],
  course_title: "Course",
  kind: "lecture",
  day,
  start_period: start,
  duration: 1,
  room_id: room,
  faculty_id: "F01",
  faculty_name: "Dr. A",
  groups,
  size: 60,
  basket_slot: null,
  week7_moved: false,
});

const proposal = (diff: Proposal["diff"]): Proposal =>
  ({ id: 1, diff, payload: { changes: [{ type: "add_session", session: { id: "NEW-T1", duration: 1 } }] } }) as unknown as Proposal;

describe("proposal diff", () => {
  const p = proposal([
    { session_id: "A-L1", course_id: "A", kind: "lecture", groups: ["CSE-2"], before: { day: "MON", start: 1, room: "R1" }, after: { day: "TUE", start: 2, room: "R2" } },
    { session_id: "B-L1", course_id: "B", kind: "lecture", groups: ["CSE-2"], before: { day: "WED", start: 3, room: "R1" }, after: { day: "WED", start: 3, room: "R3" } },
    { session_id: "NEW-T1", course_id: "NEW", kind: "tutorial", groups: ["CSE-2"], before: null, after: { day: "THU", start: 4, room: "R2" } },
  ]);
  const current = [entry("A-L1", "MON", 1, "R1"), entry("B-L1", "WED", 3, "R1"), entry("C-L1", "FRI", 5, "R4")];

  it("classifies moves", () => {
    expect(p.diff.map(changeKind)).toEqual(["time", "room", "added"]);
  });

  it("builds both grids for a group, with ghosts for time moves", () => {
    const d = diffItems(p, current, "group", "CSE-2");
    expect(d.applied).toBe(false);
    expect(d.before.map((i) => `${i.key}@${i.day}${i.start}`).sort()).toEqual(["A-L1@MON1", "B-L1@WED3", "C-L1@FRI5"]);
    expect(d.after.map((i) => `${i.key}@${i.day}${i.start}`).sort()).toEqual(["A-L1@TUE2", "B-L1@WED3", "C-L1@FRI5", "NEW-T1@THU4"]);
    expect(d.marksAfter.get("A-L1")).toBe("moved");
    expect(d.marksAfter.get("B-L1")).toBe("room");
    expect(d.marksAfter.get("NEW-T1")).toBe("added");
    expect(d.ghosts.map((g) => g.key)).toEqual(["A-L1-was"]);
  });

  it("follows sessions in and out of a room", () => {
    const d = diffItems(p, current, "room", "R1");
    expect(d.before.map((i) => i.key).sort()).toEqual(["A-L1", "B-L1"]);
    expect(d.after).toEqual([]);
    expect(d.ghosts.map((g) => g.key).sort()).toEqual(["A-L1-was", "B-L1-was"]);
  });

  it("detects a proposal that is already applied", () => {
    const now = [entry("A-L1", "TUE", 2, "R2"), entry("B-L1", "WED", 3, "R3"), entry("NEW-T1", "THU", 4, "R2")];
    expect(diffItems(p, now, "group", "CSE-2").applied).toBe(true);
  });

  it("ranks the groups and rooms it touches", () => {
    const a = affected(p);
    expect(a.groups[0]).toEqual(["CSE-2", 3]);
    expect(a.rooms.map(([r]) => r)).toContain("R1");
  });
});
