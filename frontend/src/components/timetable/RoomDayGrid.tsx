import { Accessibility, Plus } from "lucide-react";
import { Fragment, useMemo } from "react";
import type { Period, Room } from "@/api/types";
import { KindBullet } from "@/components/board/signals";
import { roomTypeLabel } from "@/lib/format";
import { LUNCH_AFTER, periodLabel } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { GridItem } from "./layout";

const TINT: Record<string, string> = {
  lecture: "bg-k-lecture-tint border-k-lecture-edge",
  tutorial: "bg-k-tutorial-tint border-k-tutorial-edge",
  lab: "bg-k-lab-tint border-k-lab-edge",
  exam: "bg-k-exam-tint border-k-exam-edge",
  event: "hatch-event border-k-event-edge",
};

/**
 * One day, every room: rooms down the side, periods across (the availability grid room-booking
 * offices use). Blank cells are free; with `onFreeCell` they start a booking.
 */
export function RoomDayGrid({
  rooms,
  items,
  day,
  periods,
  showEvening,
  lunchAfter = LUNCH_AFTER,
  onSelect,
  selected,
  onFreeCell,
  focusPeriod,
  dimRoom,
}: {
  rooms: Room[];
  items: GridItem[];
  day: string;
  periods?: Period[];
  showEvening: boolean;
  lunchAfter?: number;
  onSelect?: (item: GridItem) => void;
  selected?: string | null;
  onFreeCell?: (room: Room, period: number) => void;
  /** a period to mark, e.g. the one a time scrubber points at */
  focusPeriod?: number | null;
  /** rooms that don't match the current filters */
  dimRoom?: (room: Room) => boolean;
}) {
  const last = showEvening ? 13 : 9;
  const ps = Array.from({ length: last }, (_, i) => i + 1);
  const col = (p: number) => (p <= lunchAfter ? p + 1 : p + 2);
  const template = `minmax(118px,140px) repeat(${lunchAfter}, minmax(46px,1fr)) 10px repeat(${last - lunchAfter}, minmax(46px,1fr))`;

  const byRoom = useMemo(() => {
    const m = new Map<string, GridItem[]>();
    for (const it of items) if (it.day === day && it.end <= last) (m.get(it.room) ?? m.set(it.room, []).get(it.room)!).push(it);
    return m;
  }, [items, day, last]);

  let type = "";
  return (
    <div className="sheet overflow-x-auto">
      <div className="min-w-[760px]" role="grid" aria-label={`Rooms on ${day}`}>
        <div className="sticky top-0 z-10 grid border-b border-rule bg-sheet text-[11.5px]" style={{ gridTemplateColumns: template }} role="row">
          <div className="px-3 py-2 font-semibold text-ink-3" role="columnheader">
            Room
          </div>
          {ps.map((p) => (
            <Fragment key={p}>
              {p === lunchAfter + 1 && <div className="hatch-closed bg-platform-2/60" />}
              <div
                role="columnheader"
                className={cn("flex flex-col px-1.5 py-1.5 leading-[14px]", focusPeriod === p && "rounded-t-[6px] bg-signal text-signal-ink")}
              >
                <b className={cn("font-bold [font-stretch:80%]", p > 9 && focusPeriod !== p && "text-k-event")}>P{p}</b>
                <span className={cn("tabular-nums", focusPeriod === p ? "text-signal-ink" : "text-ink-3")}>{periodLabel(p, periods)}</span>
              </div>
            </Fragment>
          ))}
        </div>

        {rooms.map((r, ri) => {
          const header = r.type !== type;
          type = r.type;
          const dim = dimRoom?.(r) ?? false;
          const list = byRoom.get(r.id) ?? [];
          const busy = new Set(list.flatMap((it) => Array.from({ length: it.end - it.start + 1 }, (_, k) => it.start + k)));
          return (
            <Fragment key={r.id}>
              {header && (
                <div className="border-b border-rule bg-sheet-2 px-3 py-1 text-[11.5px] font-semibold text-ink-3" role="row">
                  {roomTypeLabel(r.type)}
                </div>
              )}
              <div
                role="row"
                className={cn("grid border-b border-rule/70 transition-opacity last:border-b-0", dim && "opacity-35")}
                style={{ gridTemplateColumns: template, gridTemplateRows: "36px" }}
              >
                <div role="rowheader" className="flex min-w-0 items-center gap-2 px-3" style={{ gridColumn: 1, gridRow: 1 }}>
                  <b className="text-[12.5px] font-bold [font-stretch:80%]">{r.id}</b>
                  <span className="truncate text-[11.5px] text-ink-3">{r.capacity}</span>
                  {r.accessible && <Accessibility className="size-3.5 shrink-0 text-ink-3" aria-label="Step-free access" />}
                </div>
                <div className="hatch-closed bg-platform-2/40" style={{ gridColumn: lunchAfter + 2, gridRow: 1 }} />
                {focusPeriod != null && <div className="bg-signal/15" style={{ gridColumn: col(focusPeriod), gridRow: 1 }} />}
                {onFreeCell &&
                  ps
                    .filter((p) => !busy.has(p))
                    .map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => onFreeCell(r, p)}
                        className="group/free m-[3px] grid place-items-center rounded-[4px] text-ink-3 transition-colors hover:bg-signal-soft hover:text-ink focus-visible:bg-signal-soft"
                        style={{ gridColumn: col(p), gridRow: 1 }}
                        aria-label={`Book ${r.id} on ${day} P${p}`}
                      >
                        <Plus className="size-3.5 opacity-0 transition-opacity group-hover/free:opacity-100 group-focus-visible/free:opacity-100" />
                      </button>
                    ))}
                {list.map((it, k) => (
                  <button
                    key={it.key}
                    type="button"
                    onClick={() => onSelect?.(it)}
                    className={cn(
                      "animate-rise m-[3px] flex min-w-0 items-center gap-1.5 overflow-hidden rounded-[4px] border px-1.5 text-left text-[11.5px] transition-shadow hover:shadow-[0_0_0_1px_var(--ink)]",
                      TINT[it.kind],
                      selected === it.key && "shadow-[0_0_0_2px_var(--ink),0_0_0_4px_var(--signal)]",
                      it.entry?.week7_moved && "shadow-[0_0_0_2px_var(--signal)]",
                    )}
                    style={{ gridColumn: `${col(it.start)} / ${col(it.end) + 1}`, gridRow: 1, animationDelay: `${Math.min(ri * 12 + k * 20, 400)}ms` }}
                    title={it.entry ? `${it.entry.course_id} ${it.entry.course_title} (${it.entry.groups.join(", ")})` : it.booking?.title}
                  >
                    <KindBullet kind={it.kind} size="sm" />
                    <span className="truncate font-bold [font-stretch:80%]">{it.entry ? it.entry.course_id : it.booking?.request_id}</span>
                    <span className="truncate text-ink-3">{it.entry ? it.entry.groups.join(" ") : it.booking?.title}</span>
                  </button>
                ))}
              </div>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
