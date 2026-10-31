import { useMemo, useState } from "react";
import { Link } from "react-router";
import type { Period, RoomUse } from "@/api/types";
import { Segmented } from "@/components/ui/controls";
import { roomTypeLabel } from "@/lib/format";
import { dayShort, LUNCH_AFTER, periodLabel } from "@/lib/time";
import { cn } from "@/lib/utils";

interface Hover {
  room: string;
  day: string;
  period: number;
  used: boolean;
}

/**
 * Room use as a dot-matrix display: one dot per teaching period, filled when the room is in use.
 * Hovering a dot reads it out on the line above, like a board's message strip.
 */
export function DotMatrix({
  rooms,
  grid,
  days,
  periods,
  lunchAfter = LUNCH_AFTER,
}: {
  rooms: RoomUse[];
  grid: Record<string, Record<string, number[]>>;
  days: string[];
  periods?: Period[];
  lunchAfter?: number;
}) {
  const [order, setOrder] = useState<"room" | "busy">("room");
  const [hover, setHover] = useState<Hover | null>(null);
  const sorted = useMemo(
    () => (order === "busy" ? [...rooms].sort((a, b) => b.pct - a.pct || a.room_id.localeCompare(b.room_id)) : rooms),
    [rooms, order],
  );
  const teaching = (grid[rooms[0]?.room_id]?.[days[0]] ?? []).length || 9;
  const avg = rooms.length ? rooms.reduce((s, r) => s + r.pct, 0) / rooms.length : 0;

  return (
    <div className="sheet overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule px-4 py-3 sm:px-5">
        <div>
          <h2 className="text-[16px] font-bold">Room use this week</h2>
          <p className="text-[12.5px] text-ink-2">
            One dot per teaching period. Filled means a class is in the room. Average use {avg.toFixed(0)}%.
          </p>
        </div>
        <Segmented
          aria-label="Sort rooms"
          size="sm"
          value={order}
          onChange={setOrder}
          items={[
            { value: "room", label: "By room" },
            { value: "busy", label: "Busiest first" },
          ]}
        />
      </div>

      {/* message strip */}
      <div className="flex h-9 items-center gap-2 border-b border-rule bg-anthracite px-4 text-[12.5px] text-on-anthracite sm:px-5" aria-live="polite">
        {hover ? (
          <>
            <span className="rounded-[3px] bg-anthracite-3 px-1.5 py-0.5 font-bold [font-stretch:78%]">{hover.room}</span>
            <span className="font-semibold uppercase tracking-[0.03em] [font-stretch:80%]">
              {dayShort(hover.day)} P{hover.period} {periodLabel(hover.period, periods)}
            </span>
            <span className={cn("ml-auto font-bold uppercase tracking-[0.04em] [font-stretch:80%]", hover.used ? "text-on-anthracite" : "text-signal")}>
              {hover.used ? "In use" : "Free"}
            </span>
          </>
        ) : (
          <span className="text-on-anthracite-2">Point at a dot to read it. Select a room to open its timetable.</span>
        )}
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[760px] px-4 py-3 sm:px-5" onMouseLeave={() => setHover(null)}>
          <div className="grid items-end gap-x-3 pb-2 text-[11.5px] font-semibold text-ink-3 [font-stretch:88%]" style={{ gridTemplateColumns: `128px repeat(${days.length}, minmax(0,1fr)) 92px` }}>
            <span>Room</span>
            {days.map((d) => (
              <span key={d}>{dayShort(d)}</span>
            ))}
            <span className="text-right">Use</span>
          </div>
          <ul className="flex flex-col">
            {sorted.map((r) => (
              <li key={r.room_id}>
                <Link
                  to={`/timetable?view=room&id=${encodeURIComponent(r.room_id)}`}
                  aria-label={`${r.room_id}, ${roomTypeLabel(r.type)}: in use ${r.used_hours} of ${r.total_hours} periods, ${r.pct.toFixed(0)}%`}
                  className="grid items-center gap-x-3 rounded-[6px] py-[5px] transition-colors hover:bg-signal-soft focus-visible:bg-signal-soft"
                  style={{ gridTemplateColumns: `128px repeat(${days.length}, minmax(0,1fr)) 92px` }}
                >
                  <span className="min-w-0 truncate pl-1 text-[12.5px]">
                    <b className="font-bold [font-stretch:80%]">{r.room_id}</b> <span className="text-ink-3">{r.capacity}</span>
                  </span>
                  {days.map((d) => (
                    <span key={d} className="flex items-center" aria-hidden>
                      {Array.from({ length: teaching }, (_, i) => {
                        const used = (grid[r.room_id]?.[d]?.[i] ?? 0) === 1;
                        return (
                          <span
                            key={i}
                            onMouseEnter={() => setHover({ room: r.room_id, day: d, period: i + 1, used })}
                            className={cn("grid h-4 flex-1 place-items-center", i + 1 === lunchAfter && "mr-1.5")}
                          >
                            <span className={cn("size-[7px] rounded-full transition-transform", used ? "bg-ink" : "ring-1 ring-inset ring-rule-strong", hover?.room === r.room_id && hover.day === d && hover.period === i + 1 && "scale-150 bg-signal ring-0")} />
                          </span>
                        );
                      })}
                    </span>
                  ))}
                  <span className="flex items-center justify-end gap-2 pr-1">
                    <span className="h-1.5 w-10 overflow-hidden rounded-full bg-platform-2">
                      <span className="block h-full rounded-full bg-ink" style={{ width: `${Math.min(r.pct, 100)}%` }} />
                    </span>
                    <span className="w-9 text-right text-[12.5px] font-semibold tabular-nums">{r.pct.toFixed(0)}%</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
