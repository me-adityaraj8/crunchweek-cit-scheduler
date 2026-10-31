// Navigation per role. Each role gets its own "line" of stops in the order it works.
import {
  CalendarRange,
  ClipboardCheck,
  Database,
  DoorOpen,
  GitCompareArrows,
  LayoutGrid,
  NotebookPen,
  SlidersHorizontal,
  Sparkles,
  Ticket,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/api/types";

export interface Stop {
  to: string;
  label: string;
  icon: LucideIcon;
  /** shown as a count next to the stop */
  badge?: "approvals";
  /** draw a rule above this stop: the admin's data and settings sit apart from the daily pages */
  divider?: boolean;
}

const S = {
  overview: { to: "/", label: "Overview", icon: LayoutGrid },
  data: { to: "/data", label: "Data and export", icon: Database },
  timetable: { to: "/timetable", label: "Timetable", icon: CalendarRange },
  myTimetable: { to: "/timetable", label: "My timetable", icon: CalendarRange },
  exams: { to: "/exams", label: "Exams", icon: NotebookPen },
  spectra: { to: "/spectra", label: "Spectra week", icon: Sparkles },
  changes: { to: "/changes", label: "Changes", icon: GitCompareArrows },
  approvals: { to: "/approvals", label: "Approvals", icon: ClipboardCheck, badge: "approvals" },
  rooms: { to: "/rooms", label: "Find a room", icon: DoorOpen },
  book: { to: "/book", label: "Book a venue", icon: Ticket },
  settings: { to: "/settings", label: "Settings", icon: SlidersHorizontal },
} satisfies Record<string, Stop>;

export const LINES: Record<Role, Stop[]> = {
  admin: [S.overview, S.timetable, S.exams, S.spectra, S.changes, S.approvals, S.rooms, S.book, { ...S.data, divider: true }, S.settings],
  coordinator: [S.overview, S.timetable, S.book, S.approvals, S.spectra, S.changes, S.rooms, S.exams],
  faculty: [S.overview, S.myTimetable, S.changes, S.rooms, S.book, S.exams, S.spectra],
  club: [S.overview, S.book, S.spectra, S.rooms, S.timetable, S.exams],
};

/** The three pages a phone's bottom bar shows; the fourth item, "Me", opens the full menu. */
export const PHONE: Record<Role, string[]> = {
  admin: ["/", "/timetable", "/approvals"],
  coordinator: ["/", "/timetable", "/approvals"],
  faculty: ["/", "/timetable", "/book"],
  club: ["/", "/book", "/spectra"],
};

/** Short names for the phone bar, where a stop has about 90px. */
export function phoneLabel(role: Role, stop: Stop) {
  if (stop.to === "/") return role === "faculty" ? "Today" : "Home";
  if (stop.to === "/timetable") return "Week";
  if (stop.to === "/book") return "Book";
  if (stop.to === "/spectra") return "Spectra";
  return stop.label;
}

export function canSee(role: Role, path: string) {
  const root = "/" + (path.split("/")[1] ?? "");
  return LINES[role].some((s) => s.to === root);
}
