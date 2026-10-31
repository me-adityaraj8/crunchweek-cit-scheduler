import type { BookingDraft, PartialDraft, Window } from "@/api/types";

export type Category = BookingDraft["requested_category"];

/** The booking form's own state. Numbers stay strings while being typed. */
export interface FormState {
  title: string;
  attendance: string;
  duration: number;
  windows: Window[];
  room_types: string[];
  needs: string[];
  requested_room: string | null;
  mandatory_for_groups: string[];
  requested_category: Category;
  repeat_days: string[];
  raw_text: string | null;
}

export const emptyForm = (): FormState => ({
  title: "",
  attendance: "",
  duration: 2,
  windows: [],
  room_types: [],
  needs: [],
  requested_room: null,
  mandatory_for_groups: [],
  requested_category: "club_event",
  repeat_days: [],
  raw_text: null,
});

/** Apply what the assistant understood. Fields it left empty keep what the person typed. */
export function mergeDraft(form: FormState, d: PartialDraft): FormState {
  return {
    title: d.title ?? form.title,
    attendance: d.attendance != null ? String(d.attendance) : form.attendance,
    duration: d.duration_periods ?? form.duration,
    windows: d.windows.length ? d.windows : form.windows,
    room_types: d.room_types.length ? d.room_types : form.room_types,
    needs: d.needs.length ? d.needs : form.needs,
    requested_room: d.requested_room ?? (d.room_types.length ? null : form.requested_room),
    mandatory_for_groups: d.mandatory_for_groups.length ? d.mandatory_for_groups : form.mandatory_for_groups,
    requested_category: d.requested_category ?? form.requested_category,
    repeat_days: d.repeat_days.length ? d.repeat_days : form.repeat_days,
    raw_text: d.raw_text ?? form.raw_text,
  };
}

/** What still has to be filled before the code can check the request. */
export function missing(f: FormState): string[] {
  const out: string[] = [];
  if (!f.title.trim()) out.push("a title");
  if (!(Number(f.attendance) >= 1)) out.push("how many people");
  if (!f.windows.length) out.push("a day and time");
  if (!f.room_types.length) out.push("a kind of room");
  return out;
}

export function toDraft(f: FormState): BookingDraft | null {
  if (missing(f).length) return null;
  return {
    title: f.title.trim().slice(0, 200),
    attendance: Number(f.attendance),
    duration_periods: f.duration,
    windows: f.windows,
    room_types: f.room_types,
    needs: f.needs,
    requested_room: f.requested_room || null,
    mandatory_for_groups: f.mandatory_for_groups,
    requested_category: f.requested_category,
    repeat_days: f.repeat_days,
    raw_text: f.raw_text,
  };
}

/** Map the assistant's guessed field names onto form fields. */
export function guessedSet(fields: string[]) {
  const s = new Set<string>();
  for (const f of fields) {
    if (f === "duration_periods") s.add("duration");
    else if (f === "day" || f === "time" || f === "windows") s.add("windows");
    else s.add(f);
  }
  return s;
}
