import { describe, expect, it } from "vitest";
import { isLunchBoundary, nowOnGrid, periodLabel, periodRange, spanLabel, todayCode } from "./time";

describe("time model", () => {
  it("labels periods with their start time, skipping lunch", () => {
    expect(periodLabel(1)).toBe("08:00");
    expect(periodLabel(5)).toBe("12:00");
    expect(periodLabel(6)).toBe("14:00");
    expect(periodLabel(13)).toBe("21:00");
  });

  it("labels a multi-period span from first start to last end", () => {
    expect(spanLabel(2, 3)).toBe("09:00–12:00");
    expect(spanLabel(6, 1)).toBe("14:00–15:00");
  });

  it("prefers the calendar the API sends", () => {
    const periods = [{ id: 1, start: "07:30", end: "08:30", teaching: true }];
    expect(periodLabel(1, periods)).toBe("07:30");
  });

  it("knows where lunch is", () => {
    expect(isLunchBoundary(5)).toBe(true);
    expect(isLunchBoundary(4)).toBe(false);
  });

  it("formats period ranges", () => {
    expect(periodRange(3, 3)).toBe("P3");
    expect(periodRange(10, 12)).toBe("P10–P12");
  });

  it("maps weekends to Monday and finds now on the grid", () => {
    expect(todayCode(new Date(2026, 9, 31))).toBe("MON"); // a Saturday
    expect(todayCode(new Date(2026, 10, 3))).toBe("TUE");
    const tue1030 = new Date(2026, 10, 3, 10, 30);
    expect(nowOnGrid(undefined, tue1030)).toEqual({ day: "TUE", period: 3, fraction: 0.5 });
    expect(nowOnGrid(undefined, new Date(2026, 10, 3, 13, 20))).toBeNull(); // lunch
  });
});
