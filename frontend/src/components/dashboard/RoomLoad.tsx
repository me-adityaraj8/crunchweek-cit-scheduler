import { useMemo, useState } from "react";
import type { Period, RoomUse } from "@/api/types";
import { dayName, dayShort, LUNCH_AFTER, periodLabel } from "@/lib/time";
import { cn } from "@/lib/utils";

interface Cell {
  day: string;
  period: number;
  rooms: number;
}

/**
 * How many rooms are in use in each teaching period of the week, as one column per period grouped by day.
 * The busiest period takes the accent. Beside it, the three numbers people ask about first.
 */
export function RoomLoad({
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
  const [on, setOn] = useState<Cell | null>(null);
  const teaching = (grid[rooms[0]?.room_id]?.[days[0]] ?? []).length || 9;

  const { cells, peak, quietDay, avg } = useMemo(() => {
    const cells: Cell[] = [];
    for (const day of days)
      for (let i = 0; i < teaching; i++) cells.push({ day, period: i + 1, rooms: rooms.reduce((n, r) => n + ((grid[r.room_id]?.[day]?.[i] ?? 0) === 1 ? 1 : 0), 0) });
    const peak = cells.reduce((a, c) => (c.rooms > a.rooms ? c : a), cells[0]);
    const perDay = days.map((d) => [d, cells.filter((c) => c.day === d).reduce((s, c) => s + c.rooms, 0)] as const);
    const quietDay = perDay.reduce((a, d) => (d[1] < a[1] ? d : a), perDay[0]);
    const avg = rooms.length ? rooms.reduce((s, r) => s + r.pct, 0) / rooms.length : 0;
    return { cells, peak, quietDay, avg };
  }, [rooms, grid, days, teaching]);

  if (!cells.length) return null;
  const top = Math.max(1, peak.rooms);
  const read = (c: Cell) => `${dayName(c.day)} ${periodLabel(c.period, periods)}: ${c.rooms} of ${rooms.length} rooms in use`;

  return (
    <section className="sheet flex flex-col gap-5 p-4 sm:p-5" aria-labelledby="load-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Room use</p>
          <h2 id="load-title" className="mt-1 text-[18px] font-black leading-6 [font-stretch:104%]">
            Rooms in use, period by period
          </h2>
        </div>
        <p className="text-[12.5px] text-ink-2">{rooms.length} rooms, {teaching} teaching periods a day</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_200px]">
        <div className="min-w-0">
          <div className="flex h-40 items-stretch gap-2 sm:gap-3" onMouseLeave={() => setOn(null)}>
            {days.map((day) => (
              <div key={day} className="flex min-w-0 flex-1 flex-col">
                <div className="relative flex flex-1 items-end gap-[2px] border-b-2 border-rule-strong">
                  {cells
                    .filter((c) => c.day === day)
                    .map((c) => {
                      const isPeak = c.rooms > 0 && c.rooms === peak.rooms;
                      return (
                        <span
                          key={c.period}
                          onMouseEnter={() => setOn(c)}
                          title={read(c)}
                          className={cn("flex h-full flex-1 items-end", c.period === lunchAfter && "mr-1")}
                        >
                          <span
                            className={cn(
                              "block w-full rounded-t-[3px] transition-opacity duration-150",
                              c.rooms === 0 ? "h-[3px] bg-rule" : isPeak ? "bg-mark outline-2 -outline-offset-2 outline-rule-strong" : "bg-ink",
                              on && on !== c && "opacity-40",
                            )}
                            style={c.rooms ? { height: `${(c.rooms / top) * 100}%` } : undefined}
                          />
                        </span>
                      );
                    })}
                </div>
                <span className="mt-1.5 text-center text-[11px] font-black uppercase tracking-[0.08em] text-ink-2">{dayShort(day)}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 truncate text-[12px] font-semibold text-ink-3" aria-live="polite">
            {on ? read(on) : "Point at a column to read it. The gap in each day is lunch."}
          </p>
          <table className="sr-only">
            <caption>Rooms in use by period</caption>
            <tbody>
              {days.map((d) => (
                <tr key={d}>
                  <th scope="row">{dayName(d)}</th>
                  {cells
                    .filter((c) => c.day === d)
                    .map((c) => (
                      <td key={c.period}>{c.rooms}</td>
                    ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <dl className="grid grid-cols-3 gap-2 lg:grid-cols-1">
          {[
            ["Busiest period", `${peak.rooms} rooms`, `${dayShort(peak.day)} ${periodLabel(peak.period, periods)}`],
            ["Quietest day", dayName(quietDay[0]), `${quietDay[1]} room-periods`],
            ["Average use", `${avg.toFixed(0)}%`, "of teaching hours"],
          ].map(([label, value, sub]) => (
            <div key={label} className="inset-tile flex min-w-0 flex-col gap-0.5 px-3 py-2.5">
              <dt className="eyebrow truncate">{label}</dt>
              <dd className="truncate text-[20px] font-black leading-6">{value}</dd>
              <dd className="truncate text-[12px] text-ink-2">{sub}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
