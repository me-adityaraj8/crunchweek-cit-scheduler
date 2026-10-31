import { Loader2, Plus, RotateCcw, Send, Trash2 } from "lucide-react";
import { useAnimate } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/api/client";
import { checkBooking, useSubmitBooking } from "@/api/hooks";
import type { BookingCheck, Decision, Summary, Window } from "@/api/types";
import { ChipToggle } from "@/components/ui/controls";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { useUser } from "@/lib/auth";
import { CATEGORY, featureLabel, roomTypeLabel } from "@/lib/format";
import { useDebounced } from "@/lib/hooks";
import { dayShort, periodLabel } from "@/lib/time";
import { cn } from "@/lib/utils";
import { missing, toDraft, type Category, type FormState } from "./draft";
import { Ticket } from "./Ticket";

const ROLE_CAP: Record<string, Category> = {
  admin: "institute_event",
  faculty: "guest_lecture",
  coordinator: "department_event",
  club: "club_event",
};

function WindowsEditor({ value, onChange, days, summary, guessed }: { value: Window[]; onChange: (w: Window[]) => void; days: string[]; summary: Summary; guessed: boolean }) {
  const periods = summary.periods.map((p) => ({ value: String(p.id), label: `P${p.id}  ${p.start}`, group: p.teaching ? "Teaching hours" : "Evening (events only)" }));
  const set = (i: number, patch: Partial<Window>) => onChange(value.map((w, k) => (k === i ? { ...w, ...patch } : w)));
  return (
    <Field label="When" guessed={guessed} hint="Any time inside a window works. Add more windows to give the code options.">
      <div className="flex flex-col gap-2">
        {value.map((w, i) => (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_36px] items-center gap-2">
            <Select aria-label="Day" value={w.day} onValueChange={(v) => set(i, { day: v })} options={days.map((d) => ({ value: d, label: dayShort(d) }))} />
            <Select aria-label="From" value={String(w.from_period)} onValueChange={(v) => set(i, { from_period: Number(v), to_period: Math.max(Number(v), w.to_period) })} options={periods} />
            <Select aria-label="To" value={String(w.to_period)} onValueChange={(v) => set(i, { to_period: Number(v) })} options={periods.filter((p) => Number(p.value) >= w.from_period)} />
            <Button type="button" size="icon-sm" variant="ghost" aria-label="Remove window" onClick={() => onChange(value.filter((_, k) => k !== i))}>
              <Trash2 />
            </Button>
          </div>
        ))}
        <Button type="button" size="sm" variant="ghost" className="self-start" onClick={() => onChange([...value, { day: days[0], from_period: 10, to_period: 11 }])}>
          <Plus /> Add a window
        </Button>
      </div>
    </Field>
  );
}

function useLiveCheck(form: FormState) {
  const draft = useMemo(() => toDraft(form), [form]);
  const debounced = useDebounced(draft, 350);
  const [state, setState] = useState<{ loading: boolean; result: BookingCheck | null; error: string | null }>({ loading: false, result: null, error: null });
  useEffect(() => {
    if (!debounced) {
      setState({ loading: false, result: null, error: null });
      return;
    }
    const ctl = new AbortController();
    setState((s) => ({ ...s, loading: true }));
    checkBooking(debounced, ctl.signal)
      .then((result) => setState({ loading: false, result, error: null }))
      .catch((e) => {
        if ((e as Error).name !== "AbortError") setState({ loading: false, result: null, error: errorMessage(e) });
      });
    return () => ctl.abort();
  }, [debounced]);
  return { ...state, pending: !!draft && (state.loading || debounced !== draft) };
}

/**
 * The booking request as an editable form. Every edit is checked by code (POST /bookings/check)
 * and the ticket shows what would happen if it were submitted now. Works with the assistant down.
 */
export function BookingForm({
  form,
  setForm,
  guessed,
  summary,
  onReset,
  filled,
}: {
  form: FormState;
  setForm: (f: FormState) => void;
  guessed: Set<string>;
  summary: Summary;
  onReset: () => void;
  /** bumps each time the assistant fills the form, so the sheet can show it changed */
  filled: number;
}) {
  const user = useUser();
  const check = useLiveCheck(form);
  const submit = useSubmitBooking();
  const [stamped, setStamped] = useState<string | null>(null);
  const [sheet, animate] = useAnimate<HTMLDivElement>();
  useEffect(() => {
    if (!filled || !sheet.current) return;
    setStamped(null);
    animate(sheet.current, { boxShadow: ["0 0 0 4px var(--signal)", "0 0 0 0px var(--signal)"] }, { duration: 1.1, ease: "easeOut" });
  }, [filled, animate, sheet]);
  const eventRooms = summary.rooms.filter((r) => r.allowed_uses.includes("event"));
  const types = [...new Set(eventRooms.map((r) => r.type))];
  const days = summary.days;
  const todo = missing(form);
  const r = check.result;
  const placement = r?.placement;
  const up = (patch: Partial<FormState>) => {
    setStamped(null);
    setForm({ ...form, ...patch });
  };

  const applyAlternative = (a: Decision) => {
    if (!a.day || a.start_period == null || a.end_period == null) return;
    up({ windows: [{ day: a.day, from_period: a.start_period, to_period: a.end_period }], requested_room: a.room_id ?? null });
    toast("Alternative applied", { description: `${dayShort(a.day)} P${a.start_period}–P${a.end_period}${a.room_id ? ` in ${a.room_id}` : ""}. Checking again.` });
  };

  const send = () => {
    const d = toDraft(form);
    if (!d) return;
    submit.mutate(d, {
      onSuccess: (res) => {
        const b = res.bookings[0];
        setStamped(b?.status ?? "submitted");
        toast.success(res.request_ids.length > 1 ? `${res.request_ids.length} requests submitted` : `Request ${res.request_ids[0]} submitted`, {
          description: b ? `${b.status.replace(/_/g, " ")}: ${b.reason}` : undefined,
        });
      },
      onError: (e) => toast.error("Couldn't submit the request", { description: errorMessage(e) }),
    });
  };

  return (
    <section className="flex flex-col gap-4" aria-label="Booking request">
      <div ref={sheet} className="sheet flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[16px] font-bold">Request</h2>
          <Button type="button" size="sm" variant="ghost" onClick={() => { setStamped(null); onReset(); }}>
            <RotateCcw /> Start over
          </Button>
        </div>
        <Field label="Event title" htmlFor="b-title" guessed={guessed.has("title")}>
          <Input id="b-title" value={form.title} maxLength={200} onChange={(e) => up({ title: e.target.value })} placeholder="e.g. Robotics workshop" />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="People" htmlFor="b-att" guessed={guessed.has("attendance")}>
            <Input id="b-att" inputMode="numeric" value={form.attendance} onChange={(e) => up({ attendance: e.target.value.replace(/\D/g, "") })} placeholder="How many" />
          </Field>
          <Field label="Length" htmlFor="b-dur" guessed={guessed.has("duration")} hint={`${form.duration} hour${form.duration === 1 ? "" : "s"} (one period is an hour)`}>
            <Select
              id="b-dur"
              aria-label="Length in periods"
              value={String(form.duration)}
              onValueChange={(v) => up({ duration: Number(v) })}
              options={Array.from({ length: 6 }, (_, i) => ({ value: String(i + 1), label: `${i + 1} period${i ? "s" : ""}` }))}
            />
          </Field>
        </div>
        <WindowsEditor value={form.windows} onChange={(w) => up({ windows: w })} days={days} summary={summary} guessed={guessed.has("windows")} />
        <Field label="Kind of room" guessed={guessed.has("room_types")}>
          <ChipToggle aria-label="Kind of room" values={form.room_types} onChange={(v) => up({ room_types: v })} items={types.map((t) => ({ value: t, label: roomTypeLabel(t) }))} />
        </Field>
        <Field label="Needs" guessed={guessed.has("needs")}>
          <ChipToggle aria-label="Needs" values={form.needs} onChange={(v) => up({ needs: v })} items={summary.features.map((f) => ({ value: f, label: featureLabel(f) }))} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Preferred venue" guessed={guessed.has("requested_room")} hint="Optional. The code tries it first.">
            <Select
              aria-label="Preferred venue"
              value={form.requested_room ?? "any"}
              onValueChange={(v) => up({ requested_room: v === "any" ? null : v })}
              options={[{ value: "any", label: "Any suitable venue" }, ...eventRooms.map((r) => ({ value: r.id, label: `${r.id}  ${r.name}`, hint: `${r.capacity}`, group: roomTypeLabel(r.type) }))]}
            />
          </Field>
          <Field label="Category" guessed={guessed.has("requested_category")} hint={r?.category_note ?? `Your account can ask for up to ${CATEGORY[ROLE_CAP[user.role]].toLowerCase()}.`}>
            <Select
              aria-label="Category"
              value={form.requested_category}
              onValueChange={(v) => up({ requested_category: v as Category })}
              options={Object.entries(CATEGORY).map(([value, label]) => ({ value, label }))}
            />
          </Field>
        </div>
        <details className="group">
          <summary className="cursor-pointer list-none text-[13px] font-semibold text-ink-2 hover:text-ink">More options: repeats and compulsory groups</summary>
          <div className="mt-3 flex flex-col gap-4">
            <Field label="Repeat on" hint="The same window on each of these days, as linked requests." guessed={guessed.has("repeat_days")}>
              <ChipToggle aria-label="Repeat on" values={form.repeat_days} onChange={(v) => up({ repeat_days: v })} items={days.map((d) => ({ value: d, label: dayShort(d) }))} />
            </Field>
            <Field label="Compulsory for" hint="These groups must be free, so their classes are checked too." guessed={guessed.has("mandatory_for_groups")}>
              <ChipToggle aria-label="Compulsory for groups" values={form.mandatory_for_groups} onChange={(v) => up({ mandatory_for_groups: v })} items={summary.groups.map((g) => ({ value: g.id, label: g.id }))} />
            </Field>
          </div>
        </details>
      </div>

      <Ticket
        periods={summary.periods}
        checking={check.pending}
        stamped={stamped}
        data={{
          title: form.title,
          attendance: Number(form.attendance) || null,
          status: placement?.status ?? (r && !r.valid ? "rejected" : null),
          day: placement?.day,
          start: placement?.start_period,
          end: placement?.end_period,
          room: placement?.room_id,
          reason: todo.length ? `Add ${todo.join(", ")} and the code will check it.` : (placement?.reason ?? (r?.violations.length ? "The code can't place this request as it is." : check.error ?? "")),
          category: r?.category,
          categoryNote: r?.category_note,
        }}
      />

      {r && r.violations.length > 0 && (
        <div className="sheet animate-alarm border-stop/40 p-4" role="alert">
          <h3 className="mb-2 text-[14px] font-bold text-stop">What blocks it</h3>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-[13px] leading-[19px]">
            {r.violations.map((v, i) => (
              <li key={i}>{v}</li>
            ))}
          </ul>
        </div>
      )}

      {r && r.alternatives.length > 0 && (
        <div className="sheet p-4">
          <h3 className="mb-1 text-[14px] font-bold">{placement?.status === "approved" ? "Also free" : "Valid alternatives"}</h3>
          <p className="mb-3 text-[12.5px] text-ink-2">Select one to use it.</p>
          <div className="flex flex-wrap gap-2">
            {r.alternatives.slice(0, 6).map((a, i) => (
              <button
                key={i}
                type="button"
                onClick={() => applyAlternative(a)}
                className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-rule-strong bg-sheet px-3 text-[13px] font-semibold shadow-mount transition-colors hover:border-ink hover:bg-signal-soft"
              >
                <span className="rounded-[3px] bg-ink/[0.07] px-1 font-bold [font-stretch:80%]">{a.room_id}</span>
                {a.day && dayShort(a.day)} {a.start_period != null && periodLabel(a.start_period, summary.periods)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" size="lg" onClick={send} disabled={!!todo.length || submit.isPending || check.pending}>
          {submit.isPending ? <Loader2 className="animate-spin" /> : <Send />} Submit request
        </Button>
        <p className={cn("text-[12.5px] text-ink-2", todo.length && "text-ink")}>
          {todo.length ? `Still needed: ${todo.join(", ")}.` : "The code decides by priority. You'll see the decision and the reason."}
        </p>
      </div>
    </section>
  );
}
