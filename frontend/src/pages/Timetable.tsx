import { CalendarRange, DoorOpen, LayoutList, Sparkles, UserRound, Users } from "lucide-react";
import { LayoutGroup } from "motion/react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { ApiError } from "@/api/client";
import { useSummary, useTimetable } from "@/api/hooks";
import type { Summary, User, View, Week } from "@/api/types";
import { KindBullet } from "@/components/board/signals";
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
import { dayName, dayShort, spanLabel, todayCode } from "@/lib/time";
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

/** Phone layout: pick a day, read it as a list. */
function DayList({ items, days, onSelect, summary }: { items: GridItem[]; days: string[]; onSelect: (i: GridItem) => void; summary?: Summary }) {
  const [day, setDay] = useState(() => (days.includes(todayCode()) ? todayCode() : days[0]));
  const list = items.filter((i) => i.day === day).sort((a, b) => a.start - b.start || a.key.localeCompare(b.key));
  return (
    <div className="flex flex-col gap-3">
      <Segmented aria-label="Day" value={day} onChange={setDay} items={days.map((d) => ({ value: d, label: dayShort(d) }))} className="w-full justify-between" size="sm" />
      {list.length === 0 ? (
        <p className="sheet p-4 text-[13.5px] text-ink-2">Nothing on {dayName(day)}.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((it) => (
            <li key={it.key}>
              <button
                type="button"
                onClick={() => onSelect(it)}
                className={cn(
                  "press flex w-full items-stretch gap-3 overflow-hidden rounded-[4px] border-2 border-rule-strong text-left shadow-mount",
                  { lecture: "bg-k-lecture-tint", tutorial: "bg-k-tutorial-tint", lab: "bg-k-lab-tint", exam: "bg-k-exam-tint", event: "bg-k-event-tint" }[it.kind],
                )}
              >
                <span className="flex w-[70px] shrink-0 flex-col justify-center border-r-2 border-rule-strong bg-sheet px-3 py-3 text-[12.5px] font-bold tabular-nums leading-4 [font-stretch:85%]">
                  {spanLabel(it.start, it.end - it.start + 1, summary?.periods).split("–").map((t, i) => (
                    <span key={i} className={i ? "text-ink-2" : ""}>{t}</span>
                  ))}
                </span>
                <span className="min-w-0 flex-1 py-3 pr-3">
                  <span className="flex items-center gap-2">
                    <KindBullet kind={it.kind} size="sm" />
                    <b className="truncate text-[14px] font-black [font-stretch:85%]">{it.entry?.course_id ?? it.booking?.request_id}</b>
                    <span className="ml-auto rounded-[3px] border-2 border-rule-strong bg-sheet px-1.5 text-[12px] font-bold [font-stretch:80%]">{it.room}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-[13px] text-ink">{it.entry?.course_title ?? it.booking?.title}</span>
                  {it.entry && <span className="block truncate text-[12px] text-ink-2">{it.entry.groups.join(", ")}, {it.entry.faculty_name}</span>}
                </span>
              </button>
            </li>
          ))}
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
            <span key={k} className="flex items-center gap-1.5">
              <KindBullet kind={k} size="sm" /> {KIND[k].label}
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
