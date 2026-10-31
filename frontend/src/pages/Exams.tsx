import { Loader2, NotebookPen } from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/api/client";
import { useExams, useGenerateExams, useSummary } from "@/api/hooks";
import type { Exam } from "@/api/types";
import { Code } from "@/components/board/signals";
import { TrackProgress } from "@/components/board/TrackProgress";
import { DotRow, MetricCard, MiniColumns, RingMeter } from "@/components/dashboard/Metrics";
import { Empty, ErrorState, Loading, PageHeader, RuleList } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { useUser } from "@/lib/auth";
import { dayName, dayShort, EXAM_DAYS } from "@/lib/time";
import { cn, plural } from "@/lib/utils";

function SeatBar({ size, seats }: { size: number; seats: number }) {
  const pct = seats ? Math.min(100, (size / seats) * 100) : 0;
  return (
    <span className="flex items-center gap-2" title={`${size} students, ${seats} exam seats`}>
      <span className="h-3 w-14 overflow-hidden rounded-[2px] border-2 border-rule-strong bg-sheet">
        <span className="block h-full bg-ink" style={{ width: `${pct}%` }} />
      </span>
      <span className="text-[11.5px] tabular-nums text-ink-3">
        {size}/{seats}
      </span>
    </span>
  );
}

function ExamCard({ e, i, onOpen, dim }: { e: Exam; i: number; onOpen: (e: Exam) => void; dim: boolean }) {
  return (
    <motion.button
      type="button"
      onClick={() => onOpen(e)}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: dim ? 0.3 : 1, y: 0 }}
      transition={{ duration: 0.2, delay: Math.min(i, 30) * 0.012 }}
      className="flex w-full flex-col gap-1.5 rounded-[4px] border border-k-exam-edge bg-k-exam-tint px-2.5 py-2 text-left transition-shadow hover:shadow-[0_0_0_1px_var(--ink)]"
    >
      <span className="flex items-center gap-2">
        <b className="text-[13px] font-bold [font-stretch:80%]">{e.course_ids.join(" ") || e.exam_id}</b>
        <span className="ml-auto flex gap-1">
          {e.rooms.map((r) => (
            <span key={r} className="rounded-[3px] bg-sheet/80 px-1 text-[10.5px] font-bold text-ink-2 [font-stretch:78%] dark:bg-black/25">
              {r}
            </span>
          ))}
        </span>
      </span>
      <span className="flex items-center justify-between gap-2">
        <span className="truncate text-[12px] text-ink-2">{e.groups.join(", ")}</span>
        <SeatBar size={e.size} seats={e.seats} />
      </span>
    </motion.button>
  );
}

export default function Exams() {
  const user = useUser();
  const q = useExams();
  const { data: summary } = useSummary();
  const gen = useGenerateExams();
  const [group, setGroup] = useState("all");
  const [open, setOpen] = useState<Exam | null>(null);
  const data = q.data;
  const cells = useMemo(() => {
    const m = new Map<string, Exam[]>();
    for (const e of data?.exams ?? []) (m.get(`${e.day}-${e.session}`) ?? m.set(`${e.day}-${e.session}`, []).get(`${e.day}-${e.session}`)!).push(e);
    return m;
  }, [data]);
  const mine = (e: Exam) => group === "all" || e.groups.includes(group);
  const run = () =>
    gen.mutate(undefined, {
      onSuccess: (r) => toast.success("Exams scheduled", { description: `${r.exams.length} of ${r.total} placed, same-day penalty ${r.penalty}.` }),
      onError: (e) => toast.error("Couldn't schedule the exams", { description: errorMessage(e) }),
    });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Midsem exams"
        lede="Monday to Saturday, a morning and an afternoon sitting. Rooms seat half their capacity and no group sits two exams at once. Two exams for a group on one day add to the penalty."
        actions={
          user.role === "admin" && (
            <Button variant="signal" onClick={run} disabled={gen.isPending}>
              {gen.isPending ? <Loader2 className="animate-spin" /> : <NotebookPen />} {data?.exams.length ? "Schedule again" : "Schedule exams"}
            </Button>
          )
        }
      />
      <TrackProgress running={gen.isPending} label="Placing exams and rooms" />
      {q.isLoading ? (
        <Loading rows={8} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !data?.exams.length ? (
        <Empty icon={<NotebookPen />} title="Exams aren't scheduled yet" action={user.role === "admin" && <Button variant="signal" onClick={run} disabled={gen.isPending}><NotebookPen /> Schedule exams</Button>}>
          {user.role === "admin" ? `Place all ${data?.total ?? ""} exams across the week in a few seconds.` : "The Admin hasn't scheduled them yet."}
        </Empty>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <MetricCard hero label="Exams placed" value={data.exams.length} unit={`of ${data.total}`} note={data.hard_count ? `${plural(data.hard_count, "hard-rule violation")} to fix.` : "No group sits two exams at once, every room fits its sitting."}>
              <DotRow done={data.exams.length} total={data.total} label="exams placed" />
            </MetricCard>
            <MetricCard label="Exams by day" value={EXAM_DAYS.length} unit="days" note="Exams in each day's two sittings. The busiest day is marked.">
              <MiniColumns
                mark
                columns={EXAM_DAYS.map((d) => {
                  const n = data.exams.filter((e) => e.day === d).length;
                  return { key: d, label: dayShort(d).slice(0, 2), value: n, detail: `${dayName(d)}: ${plural(n, "exam")}` };
                })}
              />
            </MetricCard>
            <MetricCard label="Same-day penalty" value={data.penalty} unit="points" note="Two exams for one group on one day add a point. Seats are filled to half capacity at most.">
              <div className="flex items-center gap-4">
                <RingMeter value={data.exams.reduce((n, e) => n + e.size, 0)} max={data.exams.reduce((n, e) => n + e.seats, 0)} caption="seats" />
                <p className="text-[12.5px] leading-[17px] text-ink-2">Share of the exam seats taken by students across the week.</p>
              </div>
            </MetricCard>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            {summary && (
              <Select
                aria-label="Show exams for"
                value={group}
                onValueChange={setGroup}
                options={[{ value: "all", label: "All groups" }, ...summary.groups.map((g) => ({ value: g.id, label: `${g.id}  ${g.name}`, group: g.year ? `Year ${g.year}` : "Groups" }))]}
                className="ml-auto w-[260px]"
              />
            )}
          </div>
          {data.violations.length > 0 && <RuleList items={data.violations} className="sheet border-stop/50 p-4" />}
          <div className="sheet overflow-x-auto">
            <div className="grid min-w-[640px]" style={{ gridTemplateColumns: `92px repeat(${data.sessions.length}, minmax(0,1fr))` }}>
              <div className="border-b border-rule" />
              {data.sessions.map((s) => (
                <div key={String(s.id)} className="border-b border-l border-rule px-3 py-2.5">
                  <div className="text-[13px] font-bold">{String(s.id) === "AM" ? "Morning" : String(s.id) === "PM" ? "Afternoon" : String(s.id)}</div>
                  <div className="text-[12px] tabular-nums text-ink-3">
                    {String(s.start)}–{String(s.end)}
                  </div>
                </div>
              ))}
              {data.days.map((d, di) => (
                <div key={d} className="contents">
                  <div className={cn("border-rule px-3 py-3", di < data.days.length - 1 && "border-b")}>
                    <div className="text-[13.5px] font-bold [font-stretch:88%]">{dayShort(d)}</div>
                  </div>
                  {data.sessions.map((s) => {
                    const list = cells.get(`${d}-${s.id}`) ?? [];
                    return (
                      <div key={String(s.id)} className={cn("flex flex-col gap-1.5 border-l border-rule p-2", di < data.days.length - 1 && "border-b")}>
                        {list.map((e, i) => (
                          <ExamCard key={e.exam_id} e={e} i={di * 8 + i} onOpen={setOpen} dim={!mine(e)} />
                        ))}
                        {!list.length && <span className="px-1 py-2 text-[12px] text-ink-3">No exams</span>}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
      <Drawer open={!!open} onOpenChange={(v) => !v && setOpen(null)} title={open ? `${open.course_ids.join(", ")} exam` : ""} description={open && `${dayName(open.day)}, ${open.session === "AM" ? "morning" : "afternoon"} sitting`}>
        {open && (
          <div className="flex flex-col gap-4 text-[13.5px]">
            <p>
              {plural(open.size, "student")} from {open.groups.join(", ")} sit it in {plural(open.rooms.length, "room")}, {open.seats} exam seats in all.
            </p>
            <ul className="flex flex-col divide-y divide-rule rounded-[6px] border border-rule">
              {open.rooms.map((r) => {
                const room = summary?.rooms.find((x) => x.id === r);
                return (
                  <li key={r} className="flex items-center gap-3 px-3 py-2.5">
                    <Code>{r}</Code>
                    <span className="flex-1 text-ink-2">{room?.name}</span>
                    {room && <span className="tabular-nums">{Math.floor(room.capacity / 2)} of {room.capacity} seats</span>}
                  </li>
                );
              })}
            </ul>
            <SeatBar size={open.size} seats={open.seats} />
          </div>
        )}
      </Drawer>
    </div>
  );
}
