import { describe, expect, it } from "vitest";
import { byRole } from "./accounts";

const acc = (email: string, role: string, name: string, department: string | null = null) => ({ email, role, name, description: "", department }) as const;

describe("byRole", () => {
  it("splits accounts into the four login tiles with dropdown options", () => {
    const g = byRole([
      acc("admin@cit.demo", "admin", "Dean's Office"),
      acc("ece.coord@cit.demo", "coordinator", "ECE Coordinator", "ECE"),
      acc("cse.coord@cit.demo", "coordinator", "CSE Coordinator", "CSE"),
      acc("f02@cit.demo", "faculty", "Dr. B", "ME"),
      acc("f01@cit.demo", "faculty", "Dr. A", "CSE"),
      acc("quiz-club@cit.demo", "club", "Quiz Club"),
      acc("coding-club@cit.demo", "club", "Coding Club"),
    ] as never);
    expect(g.admin?.email).toBe("admin@cit.demo");
    expect(g.coordinator.map((o) => o.label)).toEqual(["CSE", "ECE"]);
    expect(g.faculty.map((o) => [o.label, o.group])).toEqual([["Dr. A", "CSE"], ["Dr. B", "ME"]]);
    expect(g.club.map((o) => o.value)).toEqual(["coding-club@cit.demo", "quiz-club@cit.demo"]);
  });

  it("lists teaching staff before the ADMIN department", () => {
    const g = byRole([acc("f40@cit.demo", "faculty", "Prof. Dean", "ADMIN"), acc("f09@cit.demo", "faculty", "Dr. Z", "PH")] as never);
    expect(g.faculty.map((o) => o.group)).toEqual(["PH", "ADMIN"]);
  });

  it("copes with a dataset that has no coordinators or clubs", () => {
    const g = byRole([acc("admin@cit.demo", "admin", "Dean's Office")] as never);
    expect(g.coordinator).toEqual([]);
    expect(g.club).toEqual([]);
  });
});
