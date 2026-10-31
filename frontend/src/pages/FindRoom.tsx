import { Accessibility, CalendarRange, Sparkles, Ticket, Users } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { ApiError } from "@/api/client";
import { useFreeRooms, useSummary, useTimetable } from "@/api/hooks";
import type { Period, Room, Week } from "@/api/types";
import { GenerateCard } from "@/components/dashboard/GenerateCard";
import { ErrorState, Loading, PageHeader, SectionTitle } from "@/components/states";
import { fromEntries } from "@/components/timetable/layout";
import { RoomDayGrid } from "@/components/timetable/RoomDayGrid";
import { Button } from "@/components/ui/button";
import { ChipToggle, Segmented } from "@/components/ui/controls";
import { Field, Input } from "@/components/ui/field";
import { featureLabel, roomTypeLabel } from "@/lib/format";
import { useDebounced } from "@/lib/hooks";
import { dayName, dayShort, periodEnd, periodLabel, todayCode } from "@/lib/time";
import { cn, plural } from "@/lib/utils";

/** Pick a stretch of periods by clicking the first and then the last, like scrubbing a timeline. */
function PeriodScrubber({ from, to, onChange, last, lunchAfter, periods }: { from: number; to: number; onChange: (f: number, t: number) => void; last: number; lunchAfter: number; periods?: Period[] }) {
  const [anchor, setAnchor] = useState<number | null>(null);
  const pick = (p: number) => {
    if (anchor == null) {
      setAnchor(p);
      onChange(p, p);
    } else {
      onChange(Math.min(anchor, p), Math.max(anchor, p));
      setAnchor(null);
    }
  };
  const ps = Array.from({ length: last }, (_, i) => i + 1);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-1" role="group" aria-label="Periods">
        {ps.map((p) => {
          const on = p >= from && p <= to;
          return (
            <button
              key={p}
              type="button"
              onClick={() => pick(p)}
              aria-pressed={on}
              aria-label={`P${p} ${periodLabel(p, periods)}`}
              className={cn(
                "flex h-12 min-w-0 flex-1 flex-col items-center justify-center rounded-[6px] border text-[11px] leading-[14px] transition-colors",
                on ? "border-ink bg-ink text-sheet" : "border-rule-strong bg-sheet hover:bg-signal-soft",
                anchor === p && "bg-signal text-signal-ink",
                p === lunchAfter && "mr-2",
                p > 9 && !on && "bg-k-event-tint/60",
              )}
            >
              <b className="font-bold [font-stretch:80%]">P{p}</b>
              <span className={cn("tabular-nums", on ? "text-sheet/70" : "text-ink-3")}>{periodLabel(p, periods)}</span>
            </button>
          );
        })}
      </div>
      <p className="text-[12px] text-ink-2">
        {anchor != null ? "Now select the last period." : `${periodLabel(from, periods)}–${periodEnd(to, periods)} selected. Select a period to start a new range.`}
      </p>
    </div>
  );
}

function RoomResult({ r, day, from, to, i }: { r: { id: string; name: string; type: string; capacity: number; features: string[]; accessible: boolean }; day: string; from: number; to: number; i: number }) {
  const { data: summary } = useSummary();
  const room = summary?.rooms.find((x) => x.id === r.id);
  const bookable = room?.allowed_uses.includes("event");
  return (
    <motion.li layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2, delay: Math.min(i, 12) * 0.03 }} className="sheet flex items-stretch overflow-hidden p-0">
      <div className="grid w-[86px] shrink-0 place-items-center bg-signal px-2 text-center text-signal-ink">
        <span className="break-all text-[17px] font-black leading-5 [font-stretch:72%]">{r.id}</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1 p-3">
        <div className="flex items-center gap-2">
          <span className="truncate text-[14px] font-semibold">{r.name}</span>
          {r.accessible && <Accessibility className="size-4 shrink-0 text-ink-3" aria-label="Step-free access" />}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink-2">
          <span className="flex items-center gap-1">
            <Users className="size-3.5" /> {r.capacity}
          </span>
          <span>{roomTypeLabel(r.type)}</span>
          {r.features.length > 0 && <span className="truncate">{r.features.map(featureLabel).join(", ")}</span>}
        </div>
        {bookable && (
          <Button asChild size="sm" variant="ghost" className="-ml-2 mt-0.5 self-start">
            <Link to={`/book?room=${encodeURIComponent(r.id)}&day=${day}&from=${from}&to=${to}`}>
              <Ticket /> Book for Spectra week
            </Link>
          </Button>
        )}
      </div>
    </motion.li>
  );
}

export default function FindRoom() {
  const { data: summary, isLoading } = useSummary();
  const nav = useNavigate();
  const days = summary?.days ?? ["MON", "TUE", "WED", "THU", "FRI"];
  const [day, setDay] = useState(() => (days.includes(todayCode()) ? todayCode() : days[0]));
  const [week, setWeek] = useState<Week>("regular");
  const [range, setRange] = useState<[number, number]>([3, 4]);
  const [capacity, setCapacity] = useState("40");
  const [needs, setNeeds] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const cap = useDebounced(Math.max(1, Number(capacity) || 1), 300);
  const last = week === "spectra" ? 13 : 9;
  const from = Math.min(range[0], last);
  const to = Math.min(range[1], last);

  const free = useFreeRooms(summary ? { day, from, to, capacity: cap, needs, types, week } : null);
  const all = useTimetable("all", "", week, !!summary);
  const items = useMemo(() => (all.data ? fromEntries(all.data.entries, all.data.bookings) : []), [all.data]);
  const freeIds = new Set((free.data ?? []).map((r) => r.id));
  const noTimetable = free.error instanceof ApiError && free.error.code === "no_timetable";

  if (isLoading || !summary) return <Loading rows={8} />;
  const roomTypes = [...new Set(summary.rooms.map((r) => r.type))];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Find a room"
        lede="Choose a day, the periods and what you need. Rooms free for the whole stretch light up, smallest first."
        actions={
          <Segmented
            aria-label="Week"
            value={week}
            onChange={setWeek}
            items={[
              { value: "regular", label: "Regular week", icon: <CalendarRange /> },
              { value: "spectra", label: "Spectra week", icon: <Sparkles /> },
            ]}
          />
        }
      />
      {noTimetable ? (
        <GenerateCard />
      ) : (
        <>
          <section className="sheet flex flex-col gap-4 p-4 sm:p-5">
            <div className="flex flex-wrap items-end gap-4">
              <Field label="Day">
                <Segmented aria-label="Day" value={day} onChange={setDay} items={days.map((d) => ({ value: d, label: dayShort(d) }))} />
              </Field>
              <Field label="People" htmlFor="fr-cap" className="w-28">
                <Input id="fr-cap" inputMode="numeric" value={capacity} onChange={(e) => setCapacity(e.target.value.replace(/\D/g, ""))} />
              </Field>
            </div>
            <Field label="When">
              <PeriodScrubber from={from} to={to} last={last} lunchAfter={summary.lunch_after} periods={summary.periods} onChange={(f, t) => setRange([f, t])} />
            </Field>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Needs">
                <ChipToggle aria-label="Needs" values={needs} onChange={setNeeds} items={summary.features.map((f) => ({ value: f, label: featureLabel(f) }))} />
              </Field>
              <Field label="Kind of room" hint="None selected means any kind.">
                <ChipToggle aria-label="Kind of room" values={types} onChange={setTypes} items={roomTypes.map((t) => ({ value: t, label: roomTypeLabel(t) }))} />
              </Field>
            </div>
          </section>

          <section>
            <SectionTitle aside={<span className="text-[13px] text-ink-2">{free.data ? plural(free.data.length, "room") : ""}</span>}>
              Free on {dayName(day)}, {periodLabel(from, summary.periods)}–{periodEnd(to, summary.periods)}
            </SectionTitle>
            {free.isError ? (
              <ErrorState error={free.error} onRetry={() => free.refetch()} />
            ) : !free.data ? (
              <Loading rows={3} />
            ) : free.data.length === 0 ? (
              <p className="sheet p-4 text-[13.5px] text-ink-2">No room is free for that whole stretch with those needs. Try fewer periods, fewer needs or a smaller head count.</p>
            ) : (
              <ul className={cn("grid gap-2 sm:grid-cols-2 xl:grid-cols-3", free.isFetching && "opacity-70")}>
                <AnimatePresence mode="popLayout">
                  {free.data.map((r, i) => (
                    <RoomResult key={r.id} r={r} day={day} from={from} to={to} i={i} />
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <SectionTitle aside={<span className="text-[12.5px] text-ink-2">Rooms that don't fit are faded. Select a blank cell to book it.</span>}>
              Every room on {dayName(day)}
            </SectionTitle>
            {all.isLoading ? (
              <Loading rows={6} />
            ) : all.isError ? (
              <ErrorState error={all.error} onRetry={() => all.refetch()} />
            ) : (
              <RoomDayGrid
                rooms={summary.rooms}
                items={items}
                day={day}
                periods={summary.periods}
                showEvening={week === "spectra"}
                lunchAfter={summary.lunch_after}
                focusPeriod={from === to ? from : null}
                dimRoom={(r: Room) => !!free.data && !freeIds.has(r.id)}
                onFreeCell={(r, p) => {
                  if (r.allowed_uses.includes("event")) nav(`/book?room=${encodeURIComponent(r.id)}&day=${day}&from=${p}&to=${p}`);
                  else setRange([p, p]);
                }}
              />
            )}
          </section>
        </>
      )}
    </div>
  );
}
