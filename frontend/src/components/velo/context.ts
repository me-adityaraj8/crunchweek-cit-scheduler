import type { Role, VeloFocus } from "@/api/types";

export const PAGE_LABEL: Record<string, string> = {
  "/": "Overview",
  "/timetable": "Timetable",
  "/exams": "Exams",
  "/spectra": "Spectra week",
  "/changes": "Changes",
  "/approvals": "Approvals",
  "/rooms": "Find a room",
  "/book": "Book a venue",
  "/data": "Data and export",
  "/settings": "Settings",
};

export const pageOf = (path: string) => "/" + (path.split("/")[1] ?? "");

/** What the header pill says Velo is looking at. */
export function contextLabel(path: string, focus: VeloFocus | null): string {
  if (focus?.kind === "session") return `On ${focus.id}`;
  if (focus?.kind === "request") return `On ${focus.id}`;
  if (focus?.kind === "proposal") return `On proposal #${focus.id}`;
  return `On ${PAGE_LABEL[pageOf(path)] ?? "this page"}`;
}

const APPROVER: Role[] = ["admin", "coordinator"];

/** The chips above the composer: what you're most likely to ask on this page, for your role. */
export function contextChips(role: Role, path: string, focus: VeloFocus | null): string[] {
  if (focus?.kind === "session") return ["Why is it here?", "Find another slot", "Take me to the timetable"];
  if (focus?.kind === "request") return [`What happened to ${focus.id}?`, `Cancel ${focus.id}`, "Show all my requests"];
  if (focus?.kind === "proposal") return [`Explain proposal #${focus.id}`, "Show all proposals"];
  const page = pageOf(path);
  const chips: Record<string, string[]> = {
    "/timetable": ["Why is CS101 on Monday?", "Other slots for PH101", "Free rooms Tuesday 2 to 4"],
    "/book": ["Book the seminar hall Friday 4 to 6 pm for 80 people", "Free halls tomorrow evening for 100", "What happened to my requests?"],
    "/rooms": ["Free rooms Tuesday 10 to 12 for 40", "Free labs Thursday 2 to 4", "Free halls Friday evening for 150"],
    "/spectra": ["What happened to my requests?", "Free halls Friday evening for 150", "Book the auditorium Thursday 6 to 9 pm for 300"],
    "/changes": ["Explain the latest proposal", "Show all proposals"],
    "/approvals": ["What's waiting for my approval?", "Explain the latest proposal"],
    "/exams": ["Free rooms Saturday 10 to 12 for 60", "Take me to the timetable"],
  };
  const home: Record<Role, string[]> = {
    admin: ["What's waiting for my approval?", "Explain the latest proposal", "Free rooms tomorrow 2 to 4"],
    coordinator: ["What's waiting for my approval?", "Free halls Friday evening for 100", "What happened to my requests?"],
    faculty: ["What happened to my requests?", "Free rooms tomorrow 10 to 12", "Show my change proposals"],
    club: ["Book the seminar hall Friday 4 to 6 pm for 80 people", "What happened to my requests?", "Free halls tomorrow evening"],
  };
  const list = chips[page] ?? home[role];
  return list.filter((c) => (APPROVER.includes(role) || !/approval/i.test(c)) && (role !== "club" || !/proposal|other slots/i.test(c)));
}

/** The four starting points on an empty thread. */
export function starters(role: Role): { title: string; prompt: string }[] {
  const all = [
    { title: "Find a free room", prompt: "Free rooms tomorrow 2 to 4 for 40 people" },
    { title: "Book a venue", prompt: "Book the seminar hall Friday 4 to 6 pm for 80 people" },
    { title: "Check my requests", prompt: "What happened to my requests?" },
    { title: "Explain a class", prompt: "Why is CS101 on Monday?" },
    { title: "What's waiting for me", prompt: "What's waiting for my approval?" },
    { title: "Disruption proposals", prompt: "Explain the latest proposal" },
  ];
  const keep: Record<Role, string[]> = {
    admin: ["What's waiting for me", "Disruption proposals", "Find a free room", "Explain a class"],
    coordinator: ["What's waiting for me", "Book a venue", "Find a free room", "Check my requests"],
    faculty: ["Explain a class", "Find a free room", "Book a venue", "Check my requests"],
    club: ["Book a venue", "Find a free room", "Check my requests", "Explain a class"],
  };
  return keep[role].map((t) => all.find((s) => s.title === t)!);
}

/** "Book this" on a room card becomes a plain sentence, so it shows in the thread like anything you type. */
export function bookText(room: string, day: string, from: string, to: string, people?: number | null, week?: string): string {
  return `Book ${room} on ${day} from ${from} to ${to}` + (people ? ` for ${people} people` : "") + (week === "spectra" ? " for Spectra week" : "");
}
