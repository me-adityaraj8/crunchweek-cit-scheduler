import { CalendarRange, Clock, DoorOpen, LayoutList, Sparkles, UserRound, Users } from "lucide-react";
import { LayoutGroup } from "motion/react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { ApiError } from "@/api/client";
import { useSummary, useTimetable } from "@/api/hooks";
import type { Summary, User, View, Week } from "@/api/types";
import { GenerateCard } from "@/components/dashboard/GenerateCard";
import { ErrorState, GridSkeleton, PageHeader } from "@/components/states";
import { ExplainDrawer } from "@/components/timetable/ExplainDrawer";
import { fromEntries, type GridItem } from "@/components/timetable/layout";
import { RoomDayGrid } from "@/components/timetable/RoomDayGrid";
import { TimetableGrid } from "@/components/timetable/TimetableGrid";
import { Segmented } from "@/components/ui/controls";
import { Select, type Option } from "@/components/ui/select";
import { useUser } from "@/lib/auth";
import { KIND, roomTypeLabel } from "@/lib/format";
import { useMediaQuery } from "@/lib/hooks";
import { dayName, dayShort, nowOnGrid, periodEnd, periodLabel, todayCode } from "@/lib/time";
import { cn, plural } from "@/lib/utils";

function defaults(user: User, summary?: Summary): { view: View; id: string } {
  if (user.role === "faculty" && user.faculty_id) return { view: "faculty", id: user.faculty_id };
  if (!summary) return { view: "group", id: "" };
  if (user.role === "club") {
    const r = summary.rooms.find((x) => x.allowed_uses.includes("event")) ?? summary.rooms[0];
    return { view: "room", id: r?.id ?? "" };
  }
  if (user.role === "coordinator") {
    const g = summary.groups.find((x) => x.department === user.department) ?? summary.groups[0];
    return { view: "group", id: g?.id ?? "" };
  }
  return { view: "group", id: summary.groups[0]?.id ?? "" };
}

function options(view: View, summary: Summary, user: User): Option[] {
  if (view === "group")
    return summary.groups.map((g) => ({ value: g.id, label: `${g.id}  ${g.name}`, hint: `${g.size}`, group: g.year ? `Year ${g.year}` : "Groups" }));
  if (view === "faculty")
    return summary.faculty
      .filter((f) => user.role !== "faculty" || f.id === user.faculty_id)
      .map((f) => ({ value: f.id, label: `${f.id}  ${f.name}`, group: f.department }));
  return summary.rooms.map((r) => ({ value: r.id, label: `${r.id}  ${r.name}`, hint: `${r.capacity}`, group: roomTypeLabel(r.type) }));
}

function heading(view: View, id: string, summary?: Summary) {
  if (!summary) return { title: "Timetable", lede: "" };
  if (view === "group") {
    const g = summary.groups.find((x) => x.id === id);
    return { title: `${id} timetable`, lede: g ? `${g.name}, ${g.size} students.` : "" };
  }
  if (view === "faculty") {
    const f = summary.faculty.find((x) => x.id === id);
    return { title: f ? f.name : id, lede: f ? `${f.id}, ${f.department}. Teaches at most ${f.max_hours_per_day} hours a day.` : "" };
  }
  if (view === "room") {
    const r = summary.rooms.find((x) => x.id === id);
    return { title: r ? `${r.id} ${r.name}` : id, lede: r ? `${roomTypeLabel(r.type)} with ${r.capacity} seats${r.building ? ` in ${r.building}` : ""}.` : "" };
  }
  return { title: "All rooms", lede: "Every room on one day. Blank cells are free." };
}

const TINT: Record<string, string> = { lecture: "bg-k-lecture-tint", tutorial: "bg-k-tutorial-tint", lab: "bg-k-lab-tint", exam: "bg-k-exam-tint", event: "bg-k-event-tint" };
const TAG: Record<string, string> = { lecture: "LEC", tutorial: "TUT", lab: "LAB", exam: "EXAM", event: "EVENT" };

/** Phone layout, as on the phone board: day tiles with class counts, the next class, then the day as
 * a time list with the current class raised and the lunch break in its place. */
function DayList({ items, days, onSelect, summary }: { items: GridItem[]; days: string[]; onSelect: (i: GridItem) => void; summary?: Summary }) {
  const [day, setDay] = useState(() => (days.includes(todayCode()) ? todayCode() : days[0]));
  const now = nowOnGrid(summary?.periods);
  const lunch = summary?.lunch_after ?? 5;
  const list = items.filter((i) => i.day === day).sort((a, b) => a.start - b.start || a.key.localeCompare(b.key));
  const isNow = (it: GridItem) => !!now && now.day === day && now.period >= it.start && now.period <= it.end;
  const next = now && now.day === day ? list.find((it) => it.start > now.period) : undefined;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-5 gap-2" role="group" aria-label="Day">
        {days.slice(0, 5).map((d) => {
          const on = d === day;
          return (
            <button
              key={d}
              type="button"
              aria-pressed={on}
              aria-current={d === todayCode() ? "date" : undefined}
              onClick={() => setDay(d)}
              className={cn("press flex h-[52px] flex-col items-center justify-center rounded-[4px] border-2 border-rule-strong", on ? "bg-signal text-signal-ink shadow-float" : "bg-sheet shadow-mount")}
            >
              <span className={cn("text-[12px]", on ? "font-black" : "font-extrabold")}>{dayShort(d)}</span>
              <span className="text-[11px] font-semibold">{items.filter((i) => i.day === d).length}</span>
            </button>
          );
        })}
      </div>
      {next && (
        <p className="flex items-center gap-2 rounded-[4px] border-2 border-dashed border-rule-strong px-3 py-2.5 text-[13px] font-bold">
          <Clock className="size-4" /> Next: {next.entry?.course_id ?? next.booking?.request_id} at {periodLabel(next.start, summary?.periods)} in {next.room}
        </p>
      )}
      {list.length === 0 ? (
        <p className="sheet p-4 text-[13.5px] text-ink-2">Nothing on {dayName(day)}.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {list.map((it, i) => {
            const nowOn = isNow(it);
            const len = it.end - it.start + 1;
            const lunchBefore = it.start > lunch && (i === 0 || list[i - 1].end <= lunch);
            return (
              <li key={it.key} className="flex flex-col gap-3">
                {lunchBefore && (
                  <div className="hatch-lunch flex h-[30px] items-center rounded-[4px] border-2 border-rule-strong px-2">
                    <span className="rounded-[3px] border-2 border-rule-strong bg-sheet px-1.5 text-[10px] font-extrabold tracking-[0.08em]">
                      LUNCH · {periodEnd(lunch, summary?.periods)}–{periodLabel(lunch + 1, summary?.periods)}
                    </span>
                  </div>
                )}
                <div className="grid grid-cols-[52px_minmax(0,1fr)] gap-2.5">
                  <span className="pt-1.5 leading-tight">
                    <span className="block text-[15px] font-extrabold tabular-nums">{periodLabel(it.start, summary?.periods)}</span>
                    <span className="block text-[12px] text-ink-3">{len > 1 ? `P${it.start}–P${it.end}` : `P${it.start}`}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => onSelect(it)}
                    className={cn(
                      "press flex flex-col gap-1 rounded-[4px] border-rule-strong p-3 text-left",
                      nowOn ? "border-[3px] shadow-[5px_5px_0_var(--shade)]" : "border-2 shadow-lift",
                      len > 1 && "min-h-[132px]",
                      TINT[it.kind],
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <b className="truncate text-[17px] font-extrabold">{it.entry?.course_id ?? it.booking?.request_id}</b>
                      <span className="ml-auto flex shrink-0 gap-1">
                        {nowOn && <span className="rounded-[3px] bg-[#111] px-1.5 py-0.5 text-[10px] font-extrabold text-signal">NOW</span>}
                        <span className="rounded-[3px] border-2 border-[#111] bg-white px-1.5 text-[10px] font-extrabold leading-4 text-[#111]">
                          {TAG[it.kind]}
                          {len > 1 ? ` · ${len} H` : ""}
                        </span>
                      </span>
                    </span>
                    <span className="truncate text-[14px] font-semibold">{it.entry?.course_title ?? it.booking?.title}</span>
                    <span className="truncate text-[13px]">
                      {it.room}
                      {it.entry ? ` · ${it.entry.faculty_name}` : ""}
                      {it.entry && it.entry.groups.length > 1 ? ` · with ${it.entry.groups.slice(1).join(", ")}` : ""}
                    </span>
                    {len > 1 && <span className="mt-auto text-[12px] font-bold">Until {periodEnd(it.end, summary?.periods)}</span>}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function Timetable() {
  const user = useUser();
  const { data: summary } = useSummary();
  const [params, setParams] = useSearchParams();
  const phone = useMediaQuery("(max-width: 767px)");
  const d = defaults(user, summary);
  const view = (params.get("view") as View | null) ?? d.view;
  const id = params.get("id") ?? (view === d.view ? d.id : "");
  const week = (params.get("week") as Week | null) ?? "regular";
  const days = summary?.days ?? ["MON", "TUE", "WED", "THU", "FRI"];
  const allDay = params.get("day") ?? (days.includes(todayCode()) ? todayCode() : days[0]);
  const [selected, setSelected] = useState<GridItem | null>(null);

  const effectiveId = view === "all" ? "" : id || (summary ? options(view, summary, user)[0]?.value ?? "" : "");
  const tt = useTimetable(view, effectiveId, week, !!summary);
  const items = useMemo(() => (tt.data ? fromEntries(tt.data.entries, tt.data.bookings) : []), [tt.data]);
  const moved = tt.data?.entries.filter((e) => e.week7_moved).length ?? 0;
  const hours = tt.data?.entries.reduce((s, e) => s + e.duration, 0) ?? 0;

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) v === null ? next.delete(k) : next.set(k, v);
    setParams(next, { replace: true });
  };
  const changeView = (v: View) => {
    const nd = summary && v !== "all" ? (v === d.view ? d.id : options(v, summary, user)[0]?.value ?? "") : null;
    set({ view: v, id: nd });
    setSelected(null);
  };

  const h = heading(view, effectiveId, summary);
  const noTimetable = tt.error instanceof ApiError && tt.error.code === "no_timetable";
  const evening = week === "spectra";

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={h.title}
        lede={h.lede}
        actions={
          <Segmented
            aria-label="Week"
            value={week}
            onChange={(w) => set({ week: w === "regular" ? null : w })}
            items={[
              { value: "regular", label: "Regular week", icon: <CalendarRange /> },
              { value: "spectra", label: "Spectra week", icon: <Sparkles /> },
            ]}
          />
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          aria-label="Show timetable by"
          value={view}
          onChange={changeView}
          items={[
            { value: "group", label: "Group", icon: <Users /> },
            { value: "faculty", label: "Faculty", icon: <UserRound /> },
            { value: "room", label: "Room", icon: <DoorOpen /> },
            { value: "all", label: "All rooms", icon: <LayoutList /> },
          ]}
        />
        {summary && view !== "all" && (
          <Select
            aria-label={`Choose ${view}`}
            value={effectiveId}
            onValueChange={(v) => {
              set({ id: v });
              setSelected(null);
            }}
            options={options(view, summary, user)}
            className="w-[min(340px,100%)]"
          />
        )}
        {view === "all" && (
          <Segmented aria-label="Day" value={allDay} onChange={(v) => set({ day: v })} items={days.map((x) => ({ value: x, label: dayShort(x) }))} />
        )}
        <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-ink-2">
          {(["lecture", "tutorial", "lab"] as const).map((k) => (
            <span key={k} className={cn("rounded-[4px] border-2 border-[#111] px-2.5 py-1.5 text-[12px] font-extrabold uppercase tracking-[0.06em] text-[#111]", TINT[k])}>
              {TAG[k]} · {k === "lab" ? "3 hours" : KIND[k].label}
            </span>
          ))}
          {evening && (
            <span className="flex items-center gap-1.5">
              <span className="hatch-event size-4 rounded-[3px] border border-k-event-edge" /> Event booking
            </span>
          )}
          {evening && moved > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="rounded-[3px] bg-signal px-1 text-[10px] font-bold text-signal-ink">W7</span> Moved for Week 7
            </span>
          )}
        </div>
      </div>

      {tt.data && view !== "all" && (
        <p className="-mt-1 text-[13px] text-ink-2" aria-live="polite">
          {plural(tt.data.entries.length, "session")}, {plural(hours, "teaching hour")}
          {evening && ` in Week 7. ${moved ? `${plural(moved, "session")} moved for institute events.` : "No sessions moved."}`}
          {evening && tt.data.bookings.length > 0 && ` ${plural(tt.data.bookings.length, "event booking")} shown hatched.`}
        </p>
      )}

      {noTimetable ? (
        <GenerateCard />
      ) : tt.isError ? (
        <ErrorState error={tt.error} onRetry={() => tt.refetch()} />
      ) : !tt.data || !summary ? (
        <GridSkeleton />
      ) : view === "all" ? (
        <RoomDayGrid
          rooms={summary.rooms}
          items={items}
          day={allDay}
          periods={summary.periods}
          showEvening={evening}
          lunchAfter={summary.lunch_after}
          onSelect={setSelected}
          selected={selected?.key}
        />
      ) : phone ? (
        <DayList items={items} days={days} onSelect={setSelected} summary={summary} />
      ) : (
        <LayoutGroup id={`tt-${view}-${effectiveId}`}>
          <TimetableGrid
            key={`${view}-${effectiveId}`}
            items={items}
            days={days}
            periods={summary.periods}
            view={view}
            showEvening={evening}
            lunchAfter={summary.lunch_after}
            selected={selected?.key ?? null}
            onSelect={setSelected}
            showNow={!evening}
          />
        </LayoutGroup>
      )}

      <ExplainDrawer item={selected} days={days} periods={summary?.periods} onClose={() => setSelected(null)} />
    </div>
  );
}
