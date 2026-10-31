import { describe, expect, it } from "vitest";
import { assignLanes, rowTop, type GridItem } from "./layout";

const item = (key: string, start: number, end: number): GridItem => ({ key, day: "MON", start, end, kind: "lecture", room: "R" });

describe("grid layout", () => {
  it("gives non-overlapping blocks the full column", () => {
    const lanes = assignLanes([item("a", 1, 1), item("b", 2, 4), item("c", 5, 5)]);
    expect([...lanes.values()].every((l) => l.lanes === 1 && l.lane === 0)).toBe(true);
  });

  it("puts an elective basket side by side", () => {
    const lanes = assignLanes([item("a", 3, 3), item("b", 3, 3), item("c", 3, 3), item("d", 6, 8)]);
    expect(lanes.get("a")).toEqual({ lane: 0, lanes: 3 });
    expect(lanes.get("c")).toEqual({ lane: 2, lanes: 3 });
    expect(lanes.get("d")).toEqual({ lane: 0, lanes: 1 });
  });

  it("reuses a lane once a block has ended", () => {
    const lanes = assignLanes([item("lab", 2, 4), item("x", 2, 2), item("y", 3, 3)]);
    expect(lanes.get("lab")!.lanes).toBe(2);
    expect(lanes.get("y")!.lane).toBe(lanes.get("x")!.lane);
  });

  it("adds the lunch band below period 5", () => {
    expect(rowTop(1, 60, 20, 5)).toBe(0);
    expect(rowTop(5, 60, 20, 5)).toBe(240);
    expect(rowTop(6, 60, 20, 5)).toBe(320);
  });
});
