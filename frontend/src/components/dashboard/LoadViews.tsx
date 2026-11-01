import { useMemo, useState } from "react";
import { useSummary, useTimetable } from "@/api/hooks";
import { Panel } from "@/components/states";
import { Segmented } from "@/components/ui/controls";
import { facultyLoad, groupWeeks } from "@/lib/load";
import { DAYS, LUNCH_AFTER } from "@/lib/time";
import { cn, plural } from "@/lib/utils";
import { Dot, DotRow, DotTable, dotCols, HourBox, KeyDot, Legend, ShowAll } from "./dots";

const SHOWN = 8;

/** Week entries and the dataset, shared by both views (one request each, cached). */
function useWeek() {
  const { data: summary } = useSummary();
  const { data: tt } = useTimetable("all", "", "regular");
  return { summary, entries: tt?.entries ?? [], days: summary?.days ?? [...DAYS] };
}

/** Hours each person teaches a day, as boxes up to their daily limit. */
export function FacultyLoad({ department, className }: { department?: string | null; className?: string }) {
  const { summary, entries, days } = useWeek();
  const [all, setAll] = useState(false);
  const rows = useMemo(() => {
    const load = facultyLoad(entries, days);
    return (summary?.faculty ?? [])
      .filter((f) => !department || f.department === department)
      .map((f) => ({ ...f, week: load.get(f.id) ?? { byDay: {}, total: 0 } }))
      .sort((a, b) => b.week.total - a.week.total || a.name.localeCompare(b.name));
  }, [entries, days, summary, department]);
  if (!summary || !entries.length || !rows.length) return null;

  const cols = dotCols(days.length, 150, 44);
  const full = rows.reduce((n, f) => n + days.filter((d) => (f.week.byDay[d] ?? 0) >= f.max_hours_per_day).length, 0);
  return (
    <Panel title="Teaching load" aside={<span className="font-semibold text-ink-2">{full ? `${full} full days` : "No one at their limit"}</span>} bodyClassName="p-0" className={className}>
      <DotTable days={days} name="Faculty" tail="Hrs" cols={cols} minWidth={560}>
        {(all ? rows : rows.slice(0, SHOWN)).map((f) => (
          <DotRow key={f.id} to={`/timetable?view=faculty&id=${encodeURIComponent(f.id)}`} label={`${f.name}: ${f.week.total} hours this week, at most ${f.max_hours_per_day} a day`} cols={cols}>
            <span className="min-w-0 truncate pl-1 text-[13px] font-bold">{f.name}</span>
            {days.map((d) => {
              const h = f.week.byDay[d] ?? 0;
              return (
                <span key={d} className="flex items-center gap-[3px]" aria-hidden>
                  {Array.from({ length: Math.max(f.max_hours_per_day, h) }, (_, i) => (
                    <HourBox key={i} tone={i >= f.max_hours_per_day ? "over" : i < h ? (h >= f.max_hours_per_day ? "full" : "taught") : "free"} />
                  ))}
                </span>
              );
            })}
            <span className="pr-1 text-right text-[13px] font-bold tabular-nums">{f.week.total}</span>
          </DotRow>
        ))}
      </DotTable>
      <ShowAll shown={SHOWN} total={rows.length} open={all} onToggle={() => setAll((v) => !v)} />
      <Legend
        unit="Each box is one hour; a day has as many boxes as that person's daily limit."
        items={[
          [<HourBox tone="taught" />, "Hour taught"],
          [<HourBox tone="free" />, "Hour free"],
          [<HourBox tone="full" />, "Day at the limit"],
          [<HourBox tone="over" />, "Over the limit"],
        ]}
      />
    </Panel>
  );
}

/** Each group's week as dots, with the free periods stuck between classes ringed in red. */
export function GroupDays({ department, className }: { department?: string | null; className?: string }) {
  const { summary, entries, days } = useWeek();
  const [all, setAll] = useState(false);
  const [order, setOrder] = useState<"group" | "gaps">("group");
  const lunchAfter = summary?.lunch_after ?? LUNCH_AFTER;
  const periods = (summary?.periods ?? []).filter((p) => p.teaching).map((p) => p.id);
  const rows = useMemo(() => {
    const weeks = groupWeeks(entries, days);
    const list = (summary?.groups ?? [])
      .filter((g) => !department || g.department === department)
      .map((g) => ({ ...g, week: weeks.get(g.id) }))
      .filter((g) => g.week);
    return order === "gaps" ? list.sort((a, b) => b.week!.gaps - a.week!.gaps || a.id.localeCompare(b.id)) : list;
  }, [entries, days, summary, department, order]);
  if (!summary || !rows.length) return null;

  const cols = dotCols(days.length, 96, 44);
  const total = rows.reduce((n, g) => n + g.week!.gaps, 0);
  return (
    <Panel
      title="Group days"
      aside={
        <Segmented
          aria-label="Sort groups"
          size="sm"
          value={order}
          onChange={setOrder}
          items={[
            { value: "group", label: "By group" },
            { value: "gaps", label: "Most gaps" },
          ]}
        />
      }
      bodyClassName="p-0"
      className={className}
    >
      <DotTable days={days} name="Group" tail="Gaps" cols={cols} minWidth={640}>
        {(all ? rows : rows.slice(0, SHOWN)).map((g) => (
          <DotRow key={g.id} to={`/timetable?view=group&id=${encodeURIComponent(g.id)}`} label={`${g.name}: ${g.week!.gaps} free periods between classes this week`} cols={cols}>
            <span className="min-w-0 truncate pl-1 text-[13px] font-bold" title={g.name}>
              {g.id}
            </span>
            {days.map((d) => {
              const day = g.week!.days[d];
              return (
                <span key={d} className="flex items-center" aria-hidden>
                  {periods.map((p) => (
                    <Dot key={p} on={!!day?.busy.has(p)} gap={day?.gaps.has(p)} lunch={p === lunchAfter} />
                  ))}
                </span>
              );
            })}
            <span className={cn("pr-1 text-right text-[13px] font-bold tabular-nums", g.week!.gaps ? "text-stop" : "text-ink-3")}>{g.week!.gaps}</span>
          </DotRow>
        ))}
      </DotTable>
      <ShowAll shown={SHOWN} total={rows.length} open={all} onToggle={() => setAll((v) => !v)} />
      <Legend
        unit="Each dot is one teaching period, P1 to P9; the space is lunch."
        items={[
          [<KeyDot on />, "In class"],
          [<KeyDot />, "Free"],
          [<KeyDot gap />, "Free period stuck between two classes"],
        ]}
      />
      <p className="px-[18px] pb-3 text-[13px] text-ink-2">
        {total
          ? `${plural(total, "free period")} ${total === 1 ? "sits" : "sit"} between classes. Each one counts against the timetable's score.`
          : "No group has a free period stuck between two classes."}
      </p>
    </Panel>
  );
}
