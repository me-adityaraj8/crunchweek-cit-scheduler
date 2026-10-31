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
  admin: [S.overview, S.data, S.timetable, S.exams, S.spectra, S.changes, S.approvals, S.rooms, S.book, S.settings],
  coordinator: [S.overview, S.timetable, S.book, S.approvals, S.spectra, S.changes, S.rooms, S.exams],
  faculty: [S.overview, S.myTimetable, S.changes, S.rooms, S.book, S.exams, S.spectra],
  club: [S.overview, S.book, S.spectra, S.rooms, S.timetable, S.exams],
};

/** The four stops a phone's bottom bar shows; the rest sit under "More". */
export const PHONE: Record<Role, string[]> = {
  admin: ["/", "/timetable", "/spectra", "/approvals"],
  coordinator: ["/", "/timetable", "/book", "/approvals"],
  faculty: ["/", "/timetable", "/changes", "/rooms"],
  club: ["/", "/book", "/spectra", "/rooms"],
};

export function canSee(role: Role, path: string) {
  const root = "/" + (path.split("/")[1] ?? "");
  return LINES[role].some((s) => s.to === root);
}
