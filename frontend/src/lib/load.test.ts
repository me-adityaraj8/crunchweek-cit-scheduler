import { describe, expect, it } from "vitest";
import { facultyLoad, groupWeeks, slotIndex } from "./load";

const e = (over: Partial<{ day: string; start_period: number; duration: number; faculty_id: string; groups: string[] }>) => ({
  day: "MON",
  start_period: 1,
  duration: 1,
  faculty_id: "F1",
  groups: ["G1"],
  ...over,
});

describe("facultyLoad", () => {
  it("adds up the hours each person teaches on each day", () => {
    const load = facultyLoad([e({}), e({ start_period: 3, duration: 2 }), e({ day: "TUE" }), e({ faculty_id: "F2" })], ["MON", "TUE"]);
    expect(load.get("F1")).toEqual({ byDay: { MON: 3, TUE: 1 }, total: 4 });
    expect(load.get("F2")).toEqual({ byDay: { MON: 1, TUE: 0 }, total: 1 });
  });
});

describe("groupWeeks", () => {
  it("marks the periods a group is in class", () => {
    const w = groupWeeks([e({ start_period: 2, duration: 2 })], ["MON"]).get("G1")!;
    expect([...w.days.MON.busy]).toEqual([2, 3]);
  });

  it("counts free periods between a group's first and last class, the way the checker does", () => {
    const w = groupWeeks([e({ start_period: 1 }), e({ start_period: 4 }), e({ day: "TUE", start_period: 6, duration: 3 })], ["MON", "TUE"]).get("G1")!;
    expect([...w.days.MON.gaps]).toEqual([2, 3]);
    expect([...w.days.TUE.gaps]).toEqual([]);
    expect(w.gaps).toBe(2);
  });

  it("gives every group in a shared session the same periods", () => {
    const weeks = groupWeeks([e({ groups: ["G1", "G2"] })], ["MON"]);
    expect([...weeks.get("G2")!.days.MON.busy]).toEqual([1]);
  });
});

describe("slotIndex", () => {
  it("finds the session covering any period it spans", () => {
    const at = slotIndex([e({ start_period: 2, duration: 2, faculty_id: "F9" })], (x) => [x.faculty_id]);
    expect(at("F9", "MON", 3)?.faculty_id).toBe("F9");
    expect(at("F9", "MON", 4)).toBeUndefined();
  });
});
