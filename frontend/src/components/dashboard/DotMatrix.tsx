import { useMemo, useState } from "react";
import type { RoomUse } from "@/api/types";
import { Panel } from "@/components/states";
import { Segmented } from "@/components/ui/controls";
import { roomTypeLabel } from "@/lib/format";
import { LUNCH_AFTER } from "@/lib/time";
import { Dot, DotRow, DotTable, dotCols, KeyDot, Legend } from "./dots";

/** Room use as dots: one per teaching period, filled when a class is in the room. */
export function DotMatrix({
  rooms,
  grid,
  days,
  lunchAfter = LUNCH_AFTER,
}: {
  rooms: RoomUse[];
  grid: Record<string, Record<string, number[]>>;
  days: string[];
  lunchAfter?: number;
}) {
  const [order, setOrder] = useState<"room" | "busy">("room");
  const sorted = useMemo(
    () => (order === "busy" ? [...rooms].sort((a, b) => b.pct - a.pct || a.room_id.localeCompare(b.room_id)) : rooms),
    [rooms, order],
  );
  const teaching = (grid[rooms[0]?.room_id]?.[days[0]] ?? []).length || 9;
  const avg = rooms.length ? rooms.reduce((s, r) => s + r.pct, 0) / rooms.length : 0;
  const cols = dotCols(days.length);

  return (
    <Panel
      title="Room use this week"
      aside={
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
      }
      bodyClassName="p-0"
    >
      <DotTable days={days} name="Room" tail="Use" cols={cols}>
        {sorted.map((r) => (
          <DotRow
            key={r.room_id}
            to={`/timetable?view=room&id=${encodeURIComponent(r.room_id)}`}
            label={`${r.room_id}, ${roomTypeLabel(r.type)}: in use ${r.used_hours} of ${r.total_hours} periods, ${r.pct.toFixed(0)}%`}
            cols={cols}
          >
            <span className="min-w-0 truncate pl-1 text-[13px]">
              <b className="font-bold">{r.room_id}</b> <span className="text-ink-3">{r.capacity}</span>
            </span>
            {days.map((d) => (
              <span key={d} className="flex items-center" aria-hidden>
                {Array.from({ length: teaching }, (_, i) => (
                  <Dot key={i} on={(grid[r.room_id]?.[d]?.[i] ?? 0) === 1} lunch={i + 1 === lunchAfter} />
                ))}
              </span>
            ))}
            <span className="pr-1 text-right text-[13px] font-bold tabular-nums">{r.pct.toFixed(0)}%</span>
          </DotRow>
        ))}
      </DotTable>
      <Legend
        unit="Each dot is one teaching period, P1 to P9; the space is lunch."
        items={[
          [<KeyDot on />, "A class is in the room"],
          [<KeyDot />, "Free"],
        ]}
      />
      <p className="px-[18px] pb-3 text-[13px] text-ink-2">Average use {avg.toFixed(0)}%. Pick a room to open its timetable.</p>
    </Panel>
  );
}
