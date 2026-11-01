import { describe, expect, it } from "vitest";
import { bookText, contextChips, contextLabel, starters } from "./context";

describe("contextChips", () => {
  it("follows what the page has open", () => {
    expect(contextChips("faculty", "/timetable", { kind: "session", id: "S012" })).toContain("Find another slot");
    expect(contextChips("club", "/book", { kind: "request", id: "APP-0003" })).toContain("Cancel APP-0003");
  });

  it("changes with the page", () => {
    expect(contextChips("admin", "/rooms", null)[0]).toMatch(/^Free rooms/);
    expect(contextChips("admin", "/changes/4", null)).toContain("Explain the latest proposal");
  });

  it("never offers approvals to people who don't approve, or proposals to clubs", () => {
    for (const path of ["/", "/approvals", "/changes"]) {
      expect(contextChips("club", path, null).some((c) => /approval|proposal/i.test(c))).toBe(false);
      expect(contextChips("faculty", path, null).some((c) => /approval/i.test(c))).toBe(false);
    }
  });
});

describe("starters and labels", () => {
  it("gives every role four different starting points", () => {
    for (const role of ["admin", "coordinator", "faculty", "club"] as const) {
      const s = starters(role);
      expect(s).toHaveLength(4);
      expect(new Set(s.map((x) => x.prompt)).size).toBe(4);
    }
  });

  it("names the page or the open item", () => {
    expect(contextLabel("/spectra", null)).toBe("On Spectra week");
    expect(contextLabel("/changes/7", { kind: "proposal", id: "7" })).toBe("On proposal #7");
  });

  it("turns a room card into a sentence the parser reads", () => {
    expect(bookText("SH-1", "Friday", "16:00", "18:00", 80)).toBe("Book SH-1 on Friday from 16:00 to 18:00 for 80 people");
    expect(bookText("LH-2", "Tuesday", "10:00", "12:00")).toBe("Book LH-2 on Tuesday from 10:00 to 12:00");
    expect(bookText("SH-1", "Friday", "16:00", "18:00", 80, "spectra")).toBe("Book SH-1 on Friday from 16:00 to 18:00 for 80 people for Spectra week");
  });
});
