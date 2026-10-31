import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import type { Period, View } from "@/api/types";
import { bookingStatus, KIND } from "@/lib/format";
import { dayShort, LUNCH_AFTER, nowOnGrid, periodEnd, periodLabel, spanLabel } from "@/lib/time";
import { cn, shortName } from "@/lib/utils";
import { assignLanes, rowTop, type GridItem } from "./layout";

const ROW_H = 78;
const KIND_TAG: Record<string, string> = { lecture: "LEC", tutorial: "TUT", lab: "LAB", exam: "EXAM", event: "EVT" };
const LUNCH_H = 34;

const TINT: Record<string, string> = {
  lecture: "bg-k-lecture-tint border-k-lecture-edge before:bg-k-lecture",
  tutorial: "bg-k-tutorial-tint border-k-tutorial-edge before:bg-k-tutorial",
  lab: "bg-k-lab-tint border-k-lab-edge before:bg-k-lab",
  exam: "bg-k-exam-tint border-k-exam-edge before:bg-k-exam",
  event: "hatch-event border-k-event-edge before:bg-k-event",
};

/** What a cell says depends on whose timetable it is: a group sees rooms and faculty, a room sees groups. */
function secondLine(item: GridItem, view: View) {
  const e = item.entry;
  if (!e) return item.booking ? `${item.booking.attendance} people` : "";
  if (view === "faculty") return e.groups.join(", ");
  return shortName(e.faculty_name);
}

export type Mark = "moved" | "room" | "added" | "removed";

const MARK_LABEL: Record<Mark, string> = { moved: "Moved", room: "New room", added: "New", removed: "Removed" };

export function SessionCell({
  item,
  view,
  narrow,
  selected,
  onSelect,
  periods,
  index,
  mark,
}: {
  item: GridItem;
  view: View;
  narrow: boolean;
  selected: boolean;
  onSelect: (item: GridItem) => void;
  periods?: Period[];
  index: number;
  mark?: Mark;
}) {
  const e = item.entry;
  const b = item.booking;
  const moved = !!e?.week7_moved;
  const tall = item.end > item.start;
  const status = b ? bookingStatus(b.status) : null;
  const label = e
    ? `${e.course_id} ${e.course_title}, ${KIND[item.kind].label}, ${spanLabel(item.start, item.end - item.start + 1, periods)}, room ${e.room_id}, ${e.faculty_name}, groups ${e.groups.join(", ")}${moved ? ", moved for Week 7" : ""}`
    : `${b!.title}, event booking ${b!.request_id}, ${status?.label}, room ${b!.room_id}`;
  return (
    <motion.button
      type="button"
      layoutId={`cell-${item.key}`}
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{
        layout: { type: "spring", stiffness: 380, damping: 34 },
        opacity: { duration: 0.2, delay: Math.min(index, 40) * 0.012 },
        scale: { duration: 0.2, delay: Math.min(index, 40) * 0.012 },
      }}
      onClick={() => onSelect(item)}
      aria-label={label}
      aria-pressed={selected}
      className={cn(
        "group relative flex h-full w-full flex-col gap-[3px] overflow-hidden rounded-[4px] border-2 border-[#111] px-[9px] py-2 text-left shadow-mount transition-[box-shadow,transform] duration-150 ease-arrive",
        "hover:z-10 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[5px_5px_0_var(--shade)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none",
        TINT[item.kind],
        moved && "border-dashed",
        mark && mark !== "removed" && "z-[5] shadow-[0_0_0_2px_var(--signal-ink),0_0_0_5px_var(--signal)]",
        mark === "removed" && "opacity-60 shadow-[0_0_0_2px_var(--stop)] [&_*]:line-through",
        selected && "z-10 border-[3px] shadow-[5px_5px_0_var(--shade)]",
      )}
    >
      {mark && (
        <span
          className={cn(
            "absolute bottom-1 right-1 rounded-[3px] px-1 text-[10px] font-bold leading-[14px] no-underline [font-stretch:80%]",
            mark === "removed" ? "bg-stop text-sheet" : "bg-signal text-signal-ink",
          )}
        >
          {MARK_LABEL[mark]}
        </span>
      )}
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="min-w-0 truncate text-[15px] font-extrabold leading-[18px] tracking-[0.01em] text-ink">
          {e ? e.course_id : b!.request_id}
        </span>
        {!narrow && (
          <span className="ml-auto shrink-0 rounded-[3px] border-2 border-[#111] bg-white px-[5px] text-[10px] font-extrabold leading-[14px] tracking-[0.06em] text-[#111]">
            {KIND_TAG[item.kind] ?? "EVT"}
          </span>
        )}
      </span>
      {!narrow && (
        <span className="line-clamp-1 text-[12px] font-semibold leading-[1.25] text-ink">{e ? e.course_title : b!.title}</span>
      )}
      {(!narrow || tall) && (
        <span className="truncate text-[12px] leading-[1.25] text-ink-2">
          {narrow ? item.room : view === "room" ? (e ? `${e.groups.join(" ")} · ${e.faculty_name.replace(/^(Dr\.|Prof\.)\s+/, "")}` : "") : `${item.room} · ${secondLine(item, view)}`}
        </span>
      )}
      {tall && !narrow && e?.basket_slot && (
        <span className="mt-auto mb-1 self-start rounded-[3px] bg-ink/[0.07] px-1 text-[10.5px] font-semibold text-ink-2">Elective {e.basket_slot}</span>
      )}
      {moved && (
        <span className="absolute bottom-1 right-1 rounded-[3px] bg-signal px-1 text-[10px] font-bold leading-[14px] text-signal-ink [font-stretch:80%]">W7</span>
      )}
      {status && !narrow && (
        <span className="mt-auto mb-1 self-start rounded-[3px] bg-sheet/80 px-1 text-[10.5px] font-semibold text-ink-2 dark:bg-black/25">{status.label}</span>
      )}
    </motion.button>
  );
}

/** Live position of "now" on the grid, refreshed every minute. */
function useNow(periods?: Period[]) {
  const [now, setNow] = useState(() => nowOnGrid(periods));
  useEffect(() => {
    setNow(nowOnGrid(periods));
    const id = window.setInterval(() => setNow(nowOnGrid(periods)), 60_000);
    return () => clearInterval(id);
  }, [periods]);
  return now;
}

/**
 * The week as a printed timetable: days across, periods down, a lunch band, multi-period sessions
 * spanning rows and parallel sessions side by side. Cells share layout ids, so switching between
 * the regular week and Spectra week glides moved sessions to their new slots.
 */
export function TimetableGrid({
  items,
  days,
  periods,
  view,
  showEvening,
  lunchAfter = LUNCH_AFTER,
  selected,
  onSelect,
  showNow = true,
  marks,
  ghosts,
}: {
  items: GridItem[];
  days: string[];
  periods?: Period[];
  view: View;
  showEvening: boolean;
  lunchAfter?: number;
  selected: string | null;
  onSelect: (item: GridItem) => void;
  showNow?: boolean;
  /** diff mode: how each changed session is marked */
  marks?: Map<string, Mark>;
  /** diff mode: dashed outlines where sessions used to be */
  ghosts?: GridItem[];
}) {
  const last = showEvening ? 13 : 9;
  const shownPeriods = Array.from({ length: last }, (_, i) => i + 1);
  const height = rowTop(last, ROW_H, LUNCH_H, lunchAfter) + ROW_H;
  const now = useNow(periods);

  const byDay = useMemo(() => {
    const m = new Map<string, GridItem[]>();
    for (const d of days) m.set(d, []);
    for (const it of items) if (it.end <= last) m.get(it.day)?.push(it);
    return m;
  }, [items, days, last]);
  const lanes = useMemo(() => {
    const m = new Map<string, { lane: number; lanes: number }>();
    for (const list of byDay.values()) for (const [k, v] of assignLanes(list)) m.set(k, v);
    return m;
  }, [byDay]);

  let order = 0;
  return (
    <div className="overflow-x-auto rounded-sheet border-2 border-rule-strong bg-sheet shadow-panel">
      <div className="min-w-[760px]">
        {/* day header */}
        <div className="sticky top-0 z-20 grid border-b-2 border-rule-strong bg-sheet" style={{ gridTemplateColumns: `84px repeat(${days.length}, minmax(0,1fr))` }}>
          <div className="flex h-[52px] items-center border-r-2 border-rule-strong bg-[#111] px-3 text-[11px] font-extrabold tracking-[0.08em] text-white">PERIOD</div>
          {days.map((d) => {
            const today = showNow && now?.day === d;
            return (
              <div key={d} className={cn("relative flex h-[52px] items-center justify-center gap-2 border-r-2 border-rule-strong text-[14px] font-extrabold uppercase tracking-[0.06em] last:border-r-0", today && "bg-signal text-signal-ink")}>
                {dayShort(d)}
                {today && <span className="rounded-[3px] bg-[#111] px-1.5 py-0.5 text-[10px] font-bold tracking-[0.08em] text-signal">TODAY</span>}
              </div>
            );
          })}
        </div>

        <div className="relative grid" style={{ gridTemplateColumns: `84px repeat(${days.length}, minmax(0,1fr))`, height }}>
          {/* period labels */}
          <div className="relative border-r-2 border-rule-strong bg-sheet-2">
            {shownPeriods.map((p) => (
              <div
                key={p}
                className={cn("absolute inset-x-0 flex flex-col justify-center border-b-2 px-3", p === lunchAfter || p === last ? "border-rule-strong" : "border-rule")}
                style={{ top: rowTop(p, ROW_H, LUNCH_H, lunchAfter), height: ROW_H }}
              >
                <span className={cn("text-[15px] font-extrabold leading-5", p > 9 && "text-k-event")}>P{p}</span>
                <span className="text-[12px] leading-4 text-ink-3 tabular-nums">{periodLabel(p, periods)}</span>
              </div>
            ))}
            <div className="hatch-lunch absolute inset-x-0 flex items-center border-b-2 border-rule-strong px-2" style={{ top: rowTop(lunchAfter + 1, ROW_H, LUNCH_H, lunchAfter) - LUNCH_H, height: LUNCH_H }}>
              <span className="rounded-[3px] border-2 border-rule-strong bg-sheet px-1.5 text-[10px] font-extrabold tracking-[0.08em]">LUNCH</span>
            </div>
          </div>

          {days.map((d) => (
            <div key={d} className={cn("relative border-r-2 border-rule-strong last:border-r-0", showNow && now?.day === d && "bg-signal-faint")}>
              {/* row rules */}
              {shownPeriods.map((p) => (
                <div
                  key={p}
                  className={cn("absolute inset-x-0 border-b-2", p === lunchAfter || p === last ? "border-rule-strong" : "border-rule", p > 9 && "bg-k-event-tint/40")}
                  style={{ top: rowTop(p, ROW_H, LUNCH_H, lunchAfter), height: ROW_H }}
                />
              ))}
              <div
                className="hatch-lunch absolute inset-x-0 border-b-2 border-rule-strong"
                style={{ top: rowTop(lunchAfter + 1, ROW_H, LUNCH_H, lunchAfter) - LUNCH_H, height: LUNCH_H }}
                title={`Lunch ${periodEnd(lunchAfter, periods)}–${periodLabel(lunchAfter + 1, periods)}`}
              />
              {/* now line */}
              {showNow && now?.day === d && now.period <= last && (
                <div className="pointer-events-none absolute inset-x-0 z-[15]" style={{ top: rowTop(now.period, ROW_H, LUNCH_H, lunchAfter) + now.fraction * ROW_H }}>
                  <div className="h-[2px] bg-signal shadow-[0_0_0_1px_var(--signal-ink)]" />
                  <span className="absolute -left-1 -top-[5px] size-3 rounded-full border-2 border-signal-ink bg-signal" />
                </div>
              )}
              {/* where moved sessions used to be */}
              {ghosts
                ?.filter((g) => g.day === d && g.end <= last)
                .map((g) => {
                  const top = rowTop(g.start, ROW_H, LUNCH_H, lunchAfter) + 2;
                  const h = rowTop(g.end, ROW_H, LUNCH_H, lunchAfter) + ROW_H - top - 2;
                  return (
                    <div
                      key={`ghost-${g.key}`}
                      aria-hidden
                      className="absolute inset-x-[3px] flex items-start rounded-[6px] border-2 border-dashed border-signal-edge bg-signal-soft/50 px-2 pt-1 text-[11.5px] font-bold text-ink-3 [font-stretch:80%]"
                      style={{ top, height: h }}
                    >
                      {g.entry?.course_id} was here
                    </div>
                  );
                })}
              {/* blocks */}
              {(byDay.get(d) ?? []).map((it) => {
                const l = lanes.get(it.key) ?? { lane: 0, lanes: 1 };
                const top = rowTop(it.start, ROW_H, LUNCH_H, lunchAfter) + 6;
                const h = rowTop(it.end, ROW_H, LUNCH_H, lunchAfter) + ROW_H - top - 6;
                return (
                  <div
                    key={it.key}
                    className="absolute px-[6px]"
                    style={{ top, height: h, left: `${(l.lane / l.lanes) * 100}%`, width: `${100 / l.lanes}%` }}
                  >
                    <SessionCell
                      item={it}
                      view={view}
                      narrow={l.lanes > 2}
                      selected={selected === it.key}
                      onSelect={onSelect}
                      periods={periods}
                      index={order++}
                      mark={marks?.get(it.key)}
                    />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
