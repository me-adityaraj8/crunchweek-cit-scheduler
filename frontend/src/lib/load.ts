/** Weekly load worked out from timetable entries, for the dot views on Overview. */

interface Slot {
  day: string;
  start_period: number;
  duration: number;
  faculty_id: string;
  groups: string[];
}

export interface FacultyWeek {
  byDay: Record<string, number>;
  total: number;
}

/** Hours each faculty member teaches on each day. */
export function facultyLoad(entries: Slot[], days: string[]): Map<string, FacultyWeek> {
  const out = new Map<string, FacultyWeek>();
  for (const x of entries) {
    let w = out.get(x.faculty_id);
    if (!w) out.set(x.faculty_id, (w = { byDay: Object.fromEntries(days.map((d) => [d, 0])), total: 0 }));
    w.byDay[x.day] = (w.byDay[x.day] ?? 0) + x.duration;
    w.total += x.duration;
  }
  return out;
}

export interface GroupDay {
  busy: Set<number>;
  gaps: Set<number>;
}

export interface GroupWeek {
  days: Record<string, GroupDay>;
  gaps: number;
}

/**
 * Each group's week: the periods it is in class, and the free periods between its first and last
 * class of a day. Those are the gaps the checker's soft rule counts.
 */
export function groupWeeks(entries: Slot[], days: string[]): Map<string, GroupWeek> {
  const out = new Map<string, GroupWeek>();
  for (const x of entries) {
    for (const g of x.groups) {
      let w = out.get(g);
      if (!w) out.set(g, (w = { days: Object.fromEntries(days.map((d) => [d, { busy: new Set<number>(), gaps: new Set<number>() }])), gaps: 0 }));
      const day = (w.days[x.day] ??= { busy: new Set(), gaps: new Set() });
      for (let p = x.start_period; p < x.start_period + x.duration; p++) day.busy.add(p);
    }
  }
  for (const w of out.values()) {
    for (const day of Object.values(w.days)) {
      if (!day.busy.size) continue;
      const ps = [...day.busy];
      for (let p = Math.min(...ps); p <= Math.max(...ps); p++) if (!day.busy.has(p)) day.gaps.add(p);
      w.gaps += day.gaps.size;
    }
  }
  return out;
}

/** Look up the session a room, person or group is in at a given day and period. `owners` names who a session belongs to. */
export function slotIndex<T extends Pick<Slot, "day" | "start_period" | "duration">>(entries: T[], owners: (x: T) => string[]) {
  const at = new Map<string, T>();
  for (const x of entries)
    for (const o of owners(x))
      for (let p = x.start_period; p < x.start_period + x.duration; p++) at.set(`${o}|${x.day}|${p}`, x);
  return (owner: string, day: string, period: number) => at.get(`${owner}|${day}|${period}`);
}
