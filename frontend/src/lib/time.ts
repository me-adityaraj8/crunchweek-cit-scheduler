// Period and day helpers. The API sends the calendar (GET /data/summary -> periods, lunch_after);
// the defaults below are the starter pack's time model, used until the summary has loaded.
import type { Period } from "@/api/types";

export const DAYS = ["MON", "TUE", "WED", "THU", "FRI"] as const;
export const EXAM_DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;
export const TEACHING = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
export const EVENT_PERIODS = [10, 11, 12, 13] as const;
export const LUNCH_AFTER = 5;

const DAY_NAME: Record<string, string> = {
  MON: "Monday",
  TUE: "Tuesday",
  WED: "Wednesday",
  THU: "Thursday",
  FRI: "Friday",
  SAT: "Saturday",
  SUN: "Sunday",
};

export const dayName = (d: string) => DAY_NAME[d] ?? d;
export const dayShort = (d: string) => (DAY_NAME[d] ?? d).slice(0, 3);

const pad = (n: number) => String(n).padStart(2, "0");

/** Start hour of period p in the default model: P1-P5 08:00-12:00, lunch, P6-P13 14:00-21:00. */
function defaultStartHour(p: number) {
  return p <= LUNCH_AFTER ? 7 + p : 8 + p;
}

export function periodLabel(p: number, periods?: Period[]): string {
  const hit = periods?.find((x) => x.id === p);
  return hit ? hit.start : `${pad(defaultStartHour(p))}:00`;
}

export function periodEnd(p: number, periods?: Period[]): string {
  const hit = periods?.find((x) => x.id === p);
  return hit ? hit.end : `${pad(defaultStartHour(p) + 1)}:00`;
}

/** "09:00–12:00" for a session that starts at P2 and lasts 3 periods. */
export function spanLabel(start: number, duration: number, periods?: Period[]): string {
  return `${periodLabel(start, periods)}–${periodEnd(start + duration - 1, periods)}`;
}

/** "P2–P4" or "P6" */
export function periodRange(start: number, end: number) {
  return start === end ? `P${start}` : `P${start}–P${end}`;
}

/** True when lunch comes straight after period p. */
export function isLunchBoundary(p: number, lunchAfter = LUNCH_AFTER) {
  return p === lunchAfter;
}

/** Week-day code for "today" on the timetable's Mon-Fri week (weekends map to Monday). */
export function todayCode(now = new Date()): string {
  const d = now.getDay();
  return d >= 1 && d <= 5 ? DAYS[d - 1] : "MON";
}

/** Where "now" falls on the grid: the period and how far through it, or null outside teaching hours. */
export function nowOnGrid(periods: Period[] | undefined, now = new Date()) {
  const d = now.getDay();
  if (d < 1 || d > 5) return null;
  const minutes = now.getHours() * 60 + now.getMinutes();
  const list = periods?.length ? periods : TEACHING.map((p) => ({ id: p, start: periodLabel(p), end: periodEnd(p), teaching: true }));
  for (const p of list) {
    const [sh, sm] = p.start.split(":").map(Number);
    const [eh, em] = p.end.split(":").map(Number);
    const s = sh * 60 + sm;
    const e = eh * 60 + em;
    if (minutes >= s && minutes < e) return { day: DAYS[d - 1], period: p.id, fraction: (minutes - s) / (e - s) };
  }
  return null;
}

export function clock(now = new Date()) {
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}
