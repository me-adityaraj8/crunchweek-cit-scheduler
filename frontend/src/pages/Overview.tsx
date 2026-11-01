import { ArrowRight, CalendarPlus, CalendarRange, Check, Download, MessageSquareText, Ticket } from "lucide-react";
import { toast } from "sonner";
import { download, errorMessage } from "@/api/client";
import { Link, useNavigate } from "react-router";
import { useBookings, useChanges, useDashboard, useExams, useFest, useSummary, useTimetable } from "@/api/hooks";
import type { Dashboard, Entry } from "@/api/types";
import { Board, BoardRow, BoardText } from "@/components/board/Board";
import { Code, KindBullet, StatusChip } from "@/components/board/signals";
import { SplitFlap, type FlapTone } from "@/components/board/SplitFlap";
import { DotMatrix } from "@/components/dashboard/DotMatrix";
import { GenerateCard } from "@/components/dashboard/GenerateCard";
import { FacultyLoad, GroupDays } from "@/components/dashboard/LoadViews";
import { Badge, CountChips, MetricCard, MiniColumns, ProgressBar, RingMeter, RuleTicks, StackBar, type Part, type Tick } from "@/components/dashboard/Metrics";
import { Empty, ErrorState, Loading, PageHeader, Panel, SectionTitle } from "@/components/states";
import { Button } from "@/components/ui/button";
import { useUser } from "@/lib/auth";
import { bookingStatus, categoryLabel, kindOf, proposalStatus, ROLE, ruleLabel, RULES, SOFT_RULES } from "@/lib/format";
import { dayName, dayShort, DAYS, nowOnGrid, periodLabel, spanLabel, todayCode } from "@/lib/time";
import { cn, fmtDateTime, plural } from "@/lib/utils";

type Status = [string, FlapTone];

const FILL: Record<string, string> = { clear: "bg-clear", caution: "bg-caution", stop: "bg-stop", wait: "bg-wait", off: "bg-rule" };

/** Every hard rule the checker runs, and whether it holds right now. */
function ruleTicks(d: Dashboard): Tick[] {
  const broken = new Set(d.conflicts.map((c) => c.rule));
  return Object.keys(RULES).map((k) => ({ key: k, label: RULES[k], ok: !broken.has(k) }));
}

function TimetableHealth({ d, hero }: { d: Dashboard; hero?: boolean }) {
  return (
    <MetricCard
      hero={hero}
      label="Timetable health"
      value={d.placed}
      unit={`of ${d.total} placed`}
      note={d.hard_count ? `${plural(d.hard_count, "hard-rule violation")} to fix.` : "Sessions placed. Every hard rule holds across classes, exams and bookings."}
      to="/timetable"
    >
      <RuleTicks hero={hero} ticks={ruleTicks(d)} />
    </MetricCard>
  );
}

function SpectraMetric({ d }: { d: Dashboard }) {
  const f = d.fest;
  return (
    <MetricCard
      label="Spectra week"
      value={f ? f.booking_score : "—"}
      unit={f ? `of ${f.booking_score_max} points` : undefined}
      note={!f ? "Not decided yet." : f.priority_inversions.length ? `${plural(f.priority_inversions.length, "priority inversion")} to check.` : "Decided in priority order, no inversions."}
      to="/spectra"
    >
      {f && (
        <div className="flex items-center gap-4">
          <RingMeter value={f.booking_score} max={f.booking_score_max} caption="score" />
          <dl className="flex min-w-0 flex-1 flex-col gap-1.5 text-[12.5px]">
            {[
              ["Approved", f.approved, "bg-clear"],
              ["Other slot", f.alternatives, "bg-caution"],
              ["Rejected", f.rejected, "bg-stop"],
            ].map(([label, v, fill]) => (
              <div key={label} className="flex items-center gap-2">
                <span className={cn("size-2.5 shrink-0 rounded-[2px]", fill as string)} aria-hidden />
                <dt className="flex-1 truncate text-ink-2">{label}</dt>
                <dd className="font-bold tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </MetricCard>
  );
}

function AdminMetrics({ d }: { d: Dashboard }) {
  const f = d.fest;
  const peak = Object.entries(d.soft).sort((a, b) => b[1] - a[1])[0];
  const rules = Object.keys(RULES);
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-5">
      <MetricCard
        label="Sessions placed"
        value={d.placed}
        unit={`/ ${d.total}`}
        badge={<Badge fill={d.placed === d.total ? "bg-clear-vivid" : "bg-stop-vivid"}>{d.placed === d.total ? "All" : "Missing"}</Badge>}
        note={d.placed === d.total ? "Every session in the dataset, and any added by a change file, has a slot." : `${d.total - d.placed} still without a slot.`}
        to="/timetable"
      >
        <ProgressBar value={d.placed} max={d.total} label={`${d.placed} of ${d.total} placed`} />
      </MetricCard>
      <MetricCard
        label="Hard violations"
        value={d.hard_count}
        badge={<Badge fill={d.hard_count ? "bg-stop-vivid" : "bg-clear-vivid"}>{d.hard_count ? "Stop" : "Clear"}</Badge>}
        note={d.hard_count ? `${plural(d.hard_count, "violation")} to fix, listed below.` : `All ${rules.length} hard rules hold, ${rules[0]} to ${rules.at(-1)}.`}
      >
        <RuleTicks ticks={ruleTicks(d)} />
      </MetricCard>
      <MetricCard
        label="Soft penalty"
        value={d.soft_total}
        badge={d.solver_status === "optimal" && <Badge fill="bg-signal">Proven optimal</Badge>}
        note={peak && peak[1] > 0 ? `${peak[0]} = ${peak[1]}: ${SOFT_RULES[peak[0]] ?? peak[0]}.` : "No soft rule costs anything."}
      >
        <MiniColumns mark columns={Object.keys(SOFT_RULES).map((k) => ({ key: k, label: k, value: d.soft[k] ?? 0, detail: `${k} ${SOFT_RULES[k]}: ${d.soft[k] ?? 0}` }))} />
      </MetricCard>
      <MetricCard
        label="Spectra week"
        value={f ? f.booking_score : "—"}
        unit={f ? `/ ${f.booking_score_max}` : undefined}
        badge={f && <Badge fill={f.priority_inversions.length ? "bg-stop-vivid" : "bg-k-event-tint"}>{f.priority_inversions.length ? "Check" : "Decided"}</Badge>}
        note={f ? `Booking score, ${plural(f.priority_inversions.length, "priority inversion")}.` : "Not decided yet."}
        to="/spectra"
      >
        {f && (
          <CountChips
            items={[
              { label: "approved", value: f.approved, fill: "bg-white" },
              { label: f.alternatives === 1 ? "alternative" : "alternatives", value: f.alternatives, fill: "bg-caution-soft" },
              { label: "rejected", value: f.rejected, fill: "bg-[#ffc9c3]" },
            ]}
          />
        )}
      </MetricCard>
    </div>
  );
}

/** Rooms in use per day, for the coordinator's room-use card. */
function dayLoad(d: Dashboard, days: string[]) {
  return days.map((day) => {
    const n = d.utilisation.reduce((sum, r) => sum + (d.grid[r.room_id]?.[day] ?? []).filter((v) => v === 1).length, 0);
    return { key: day, label: dayShort(day).slice(0, 2), value: n, detail: `${dayName(day)}: ${n} room-periods in use` };
  });
}

function CoordinatorMetrics({ d, days }: { d: Dashboard; days: string[] }) {
  const changes = d.pending.filter((p) => p.kind === "change").length;
  const avg = d.utilisation.length ? d.utilisation.reduce((s, r) => s + r.pct, 0) / d.utilisation.length : 0;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard hero label="Waiting for you" value={d.pending.length} unit={d.pending.length === 1 ? "request" : "requests"} note={d.pending.length ? "Open approvals to decide them." : "Nothing to approve right now."} to="/approvals">
        <StackBar
          parts={[
            { key: "change", label: "Timetable changes", value: changes, fill: "bg-signal-ink" },
            { key: "booking", label: "Venue bookings", value: d.pending.length - changes, fill: "bg-signal-ink/40" },
          ]}
        />
      </MetricCard>
      {d.has_timetable && <TimetableHealth d={d} />}
      <SpectraMetric d={d} />
      {d.has_timetable && (
        <MetricCard label="Room use" value={`${avg.toFixed(0)}%`} unit="of teaching hours" note="Room-periods in use each day. The busiest day is marked.">
          <MiniColumns mark columns={dayLoad(d, days)} />
        </MetricCard>
      )}
    </div>
  );
}

function Waiting({ d }: { d: Dashboard }) {
  return (
    <Panel title="Waiting for you" aside={d.pending.length > 0 && <Link to="/approvals" className="underline underline-offset-2">Open approvals</Link>} className="min-w-0 flex-[1_1_420px]">
      {d.pending.length === 0 ? (
        <div className="flex items-center gap-4 rounded-[4px] border-2 border-dashed border-rule-strong bg-sheet-2 p-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-[4px] border-2 border-[#111] bg-clear-vivid text-[#111] shadow-mount">
            <Check className="size-6" strokeWidth={3} />
          </span>
          <span>
            <span className="block text-[16px] font-bold">Nothing to approve</span>
            <span className="block text-[14px] text-ink-2">Change proposals and lab bookings that need you will show up here.</span>
          </span>
        </div>
      ) : (
        <ul className="-my-1 flex flex-col divide-y-2 divide-rule">
          {d.pending.slice(0, 6).map((p) => (
            <li key={p.kind + p.id}>
              <Link to={p.kind === "change" ? `/changes/${p.id}` : "/approvals"} className="flex items-center gap-3 py-2.5 hover:bg-sheet-2">
                <Code tone="signal">{p.kind === "change" ? `#${p.id}` : p.id}</Code>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold">{p.title}</span>
                  <span className="block truncate text-[12px] text-ink-3">
                    {p.kind === "change" ? "Timetable change" : "Venue booking"} from {p.requested_by}
                    {p.created_at ? `, ${fmtDateTime(p.created_at)}` : ""}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function Conflicts({ d }: { d: Dashboard }) {
  if (!d.conflicts.length) return null;
  return (
    <div role="alert">
      <Panel title="Hard-rule violations" tint="bg-stop-vivid">
        <ul className="flex flex-col gap-2">
          {d.conflicts.map((c, i) => (
            <li key={i} className="flex items-start gap-2 text-[14px]">
              <Code className="bg-stop-vivid text-[#111]">{c.rule}</Code>
              <span>
                <b className="font-semibold">{ruleLabel(c.rule)}.</b> {c.detail} <span className="text-ink-3">({c.where})</span>
              </span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

const DECISION: Record<string, [string, string]> = {
  approved: ["Approved", "bg-clear-vivid"],
  alternative_offered: ["Alternative", "bg-caution-soft"],
  rejected: ["Rejected", "bg-[#ffc9c3]"],
  pending_approval: ["Pending approval", "bg-white border-dashed"],
};

/** The first decisions in priority order, as on the Overview board. */
function SpectraTable() {
  const { data } = useFest();
  const { data: summary } = useSummary();
  if (!data?.decided) return null;
  const rows = data.requests.filter((r) => r.decision).slice(0, 6);
  return (
    <Panel
      title="Spectra week decisions"
      tint="bg-k-event-tint"
      aside={<Link to="/spectra" className="underline underline-offset-2">All {data.requests.length} requests</Link>}
      className="min-w-0 flex-[1.7_1_560px]"
      bodyClassName="overflow-x-auto p-0"
    >
      <table className="w-full min-w-[640px] text-left text-[14px]">
        <thead>
          <tr className="border-b-2 border-rule-strong text-[11px] font-extrabold uppercase tracking-[0.08em]">
            <th className="px-[18px] py-2.5">Request</th>
            <th className="px-3 py-2.5">Decision</th>
            <th className="px-3 py-2.5">Venue · time</th>
            <th className="px-3 py-2.5">Why</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const [label, fill] = DECISION[r.status] ?? [r.status, "bg-white"];
            const dec = r.decision!;
            return (
              <tr key={r.id} className="border-b-2 border-rule align-top last:border-b-0 hover:bg-sheet-2">
                <td className="px-[18px] py-3">
                  <span className="block font-bold">{r.title}</span>
                  <span className="block text-[12px] text-ink-3">
                    {r.id} · {categoryLabel(r.category)} · {r.attendance}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <Badge fill={fill}>{label}</Badge>
                </td>
                <td className="whitespace-nowrap px-3 py-3 font-semibold">
                  {dec.room_id ? `${dec.room_id} · ${dayShort(dec.day ?? "")} ${periodLabel(dec.start_period ?? 0, summary?.periods)}` : "—"}
                </td>
                <td className="px-3 py-3 text-ink-2">{r.reason || dec.reason}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}

/** Midsems placed, and how they spread over Monday to Saturday. */
function MidsemCard({ d }: { d: Dashboard }) {
  const { data } = useExams();
  const days = data?.days ?? ["MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const per = (day: string) => data?.exams.filter((e) => e.day === day).length ?? 0;
  return (
    <Panel
      title="Midsem exams"
      aside={
        <Badge fill="bg-k-exam-tint">
          {d.exams_scheduled} / {d.exams_total} placed
        </Badge>
      }
      className="min-w-0 flex-[1_1_420px]"
    >
      <Link to="/exams" className="grid grid-cols-6 overflow-hidden rounded-[4px] border-2 border-[#111] hover:brightness-95">
        {days.map((day) => (
          <span key={day} className="border-r-2 border-[#111] bg-k-exam-tint px-1 py-2.5 text-center text-[#111] last:border-r-0">
            <span className="block text-[12px] font-extrabold">{dayShort(day)}</span>
            <span className="block text-[18px] font-black tabular-nums">{per(day)}</span>
          </span>
        ))}
      </Link>
      <p className="mt-3 text-[13px] text-ink-2">Two sessions a day, rooms at half capacity, no group sits two exams at once.</p>
    </Panel>
  );
}

function RoomUse({ d }: { d: Dashboard }) {
  const { data: summary } = useSummary();
  return <DotMatrix rooms={d.utilisation} grid={d.grid} days={summary?.days ?? [...DAYS]} lunchAfter={summary?.lunch_after} />;
}

function AdminOverview({ d }: { d: Dashboard }) {
  if (!d.has_timetable) return <GenerateCard />;
  return (
    <>
      <AdminMetrics d={d} />
      <Conflicts d={d} />
      <RoomUse d={d} />
      <div className="flex flex-wrap items-start gap-6">
        <FacultyLoad className="min-w-0 flex-[1_1_480px]" />
        <GroupDays className="min-w-0 flex-[1_1_480px]" />
      </div>
      <SpectraTable />
      <div className="flex flex-wrap items-stretch gap-6">
        <Waiting d={d} />
        <MidsemCard d={d} />
      </div>
    </>
  );
}

function CoordinatorOverview({ d }: { d: Dashboard }) {
  const user = useUser();
  const { data: summary } = useSummary();
  return (
    <>
      <CoordinatorMetrics d={d} days={summary?.days ?? [...DAYS]} />
      <div className="flex flex-wrap items-start gap-6">
        <Waiting d={d} />
        <div className="min-w-0 flex-[1_1_420px]">
          <MyBookings compact />
        </div>
      </div>
      {d.has_timetable && (
        <>
          <RoomUse d={d} />
          <div className="flex flex-wrap items-start gap-6">
            <FacultyLoad department={user.department} className="min-w-0 flex-[1_1_480px]" />
            <GroupDays department={user.department} className="min-w-0 flex-[1_1_480px]" />
          </div>
        </>
      )}
    </>
  );
}

/** Today's sessions for a faculty member, as departures. */
function YourDay() {
  const user = useUser();
  const { data: summary } = useSummary();
  const tt = useTimetable("faculty", user.faculty_id ?? "", "regular", !!user.faculty_id);
  const today = todayCode();
  const now = nowOnGrid(summary?.periods);
  const weekday = new Date().getDay();
  const isToday = weekday >= 1 && weekday <= 5; // weekends show Monday, the next teaching day
  if (tt.isLoading) return <Loading rows={4} />;
  if (tt.isError) return <ErrorState error={tt.error} onRetry={() => tt.refetch()} />;
  const entries = (tt.data?.entries ?? []).filter((e) => e.day === today).sort((a, b) => a.start_period - b.start_period);
  const nextIdx = entries.findIndex((e) => !now || now.day !== today || e.start_period + e.duration - 1 >= now.period);
  const status = (e: Entry, i: number): Status => {
    if (!isToday || !now || now.day !== today) return i === 0 ? ["FIRST", "clear"] : ["", "board"];
    const end = e.start_period + e.duration - 1;
    if (now.period > end) return ["DONE", "wait"];
    if (now.period >= e.start_period) return ["NOW", "caution"];
    return i === nextIdx ? ["NEXT", "clear"] : ["LATER", "board"];
  };
  return (
    <Board
      title={`${dayName(today)}${isToday ? "" : " (next teaching day)"}`}
      meta={<Link to="/timetable" className="font-semibold text-ink hover:underline">Full week</Link>}
      columns="112px minmax(0,1fr) 92px 120px 96px"
      headers={["Time", "Class", "Room", "Groups", "Status"]}
      footer={entries.length ? `${plural(entries.length, "class", "classes")} today` : undefined}
    >
      {entries.length === 0 ? (
        <div className="px-5 py-6 text-[13.5px] text-ink-2">No classes on {dayName(today)}.</div>
      ) : (
        entries.map((e, i) => {
          const [label, tone] = status(e, i);
          return (
            <BoardRow key={e.session_id} index={i} highlight={label === "NOW"}>
              <BoardText className="tabular-nums">{spanLabel(e.start_period, e.duration, summary?.periods)}</BoardText>
              <span role="cell" className="col-span-2 row-start-2 flex min-w-0 items-center gap-2 sm:col-span-1 sm:row-start-auto">
                <KindBullet kind={kindOf(e.kind)} size="sm" />
                <span className="truncate text-[13.5px] font-semibold">
                  {e.course_id} <span className="font-normal text-ink-2">{e.course_title}</span>
                </span>
              </span>
              <BoardText className="hidden sm:block">{e.room_id}</BoardText>
              <BoardText dim className="hidden sm:block">
                {e.groups.join(", ")}
              </BoardText>
              <span role="cell" className="justify-self-end text-[14px] sm:justify-self-start">
                <SplitFlap value={label} length={5} tone={tone} delay={i * 110} label={label || "later"} />
              </span>
            </BoardRow>
          );
        })
      )}
    </Board>
  );
}

function MyChanges() {
  const { data, isLoading } = useChanges();
  return (
    <section className="sheet p-4 sm:p-5">
      <SectionTitle aside={<Link to="/changes" className="text-[13px] font-semibold hover:underline">All changes</Link>}>Your change requests</SectionTitle>
      {isLoading ? (
        <Loading rows={3} />
      ) : !data?.length ? (
        <p className="text-[13.5px] text-ink-2">You haven't asked for any changes.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-rule">
          {data.slice(0, 5).map((p) => {
            const s = proposalStatus(p.status);
            return (
              <li key={p.id}>
                <Link to={`/changes/${p.id}`} className="flex items-center gap-3 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{p.title}</span>
                  <StatusChip aspect={s.aspect}>{s.label}</StatusChip>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** The faculty member's week in three numbers: today, hours by day, and their change requests. */
function FacultyMetrics() {
  const user = useUser();
  const { data: summary } = useSummary();
  const tt = useTimetable("faculty", user.faculty_id ?? "", "regular", !!user.faculty_id);
  const changes = useChanges();
  if (!tt.data) return null;
  const days = summary?.days ?? [...DAYS];
  const today = todayCode();
  const entries = tt.data.entries;
  const todays = entries.filter((e) => e.day === today).sort((a, b) => a.start_period - b.start_period);
  const hours = days.map((day) => {
    const h = entries.filter((e) => e.day === day).reduce((n, e) => n + e.duration, 0);
    return { key: day, label: dayShort(day).slice(0, 2), value: h, detail: `${dayName(day)}: ${plural(h, "teaching hour")}` };
  });
  const total = hours.reduce((n, h) => n + h.value, 0);
  const mine = changes.data ?? [];
  const parts: Part[] = ["pending", "approved", "rejected", "infeasible"].map((k) => {
    const st = proposalStatus(k);
    return { key: k, label: st.label, value: mine.filter((c) => c.status === k).length, fill: FILL[st.aspect] };
  });
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <MetricCard hero label={dayName(today)} value={todays.length} unit={todays.length === 1 ? "class" : "classes"} note={todays[0] ? `First: ${todays[0].course_id} at ${periodLabel(todays[0].start_period, summary?.periods)} in ${todays[0].room_id}.` : `No classes on ${dayName(today)}.`} to="/timetable">
        <ul className="flex gap-1.5" aria-hidden>
          {Array.from({ length: 9 }, (_, i) => {
            const busy = todays.some((e) => i + 1 >= e.start_period && i + 1 < e.start_period + e.duration);
            return <li key={i} className={cn("h-7 flex-1 rounded-[3px]", busy ? "bg-signal-ink" : "border-2 border-signal-ink/30")} />;
          })}
        </ul>
        <p className="mt-2 text-[11.5px] font-semibold text-signal-ink/75">Periods 1 to 9, filled when you teach</p>
      </MetricCard>
      <MetricCard label="This week" value={total} unit="teaching hours" note="Hours by day. The busiest day is marked.">
        <MiniColumns mark columns={hours} unit=" h" />
      </MetricCard>
      <MetricCard label="Change requests" value={mine.length} unit="asked for" note={mine.length ? "Each one is a proposal the Admin approves." : "You haven't asked for any changes."} to="/changes">
        <StackBar parts={parts} />
      </MetricCard>
    </div>
  );
}

function FacultyOverview() {
  return (
    <>
      <FacultyMetrics />
      <YourDay />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <MyChanges />
        <section className="sheet flex flex-col gap-3 p-4 sm:p-5">
          <SectionTitle>Need a change?</SectionTitle>
          <p className="-mt-2 text-[13.5px] text-ink-2">Every request becomes a proposal the Admin approves. The solver moves as few classes as possible.</p>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="primary">
              <Link to="/changes?new=unavailable">
                <CalendarPlus /> Mark time you can't teach
              </Link>
            </Button>
            <Button asChild>
              <Link to="/changes?new=ask">
                <MessageSquareText /> Ask to move a class
              </Link>
            </Button>
          </div>
        </section>
      </div>
    </>
  );
}

function MyBookings({ compact }: { compact?: boolean }) {
  const nav = useNavigate();
  const { data, isLoading, isError, error, refetch } = useBookings(true);
  const { data: summary } = useSummary();
  if (isLoading) return <Loading rows={3} />;
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (!data?.length)
    return (
      <Empty
        icon={<Ticket />}
        title="No venue requests yet"
        action={
          <Button asChild variant="signal">
            <Link to="/book">
              <Ticket /> Book a venue
            </Link>
          </Button>
        }
      >
        Describe what you need in plain English or Hinglish. The assistant fills the form, and the code decides.
      </Empty>
    );
  return (
    <Board
      title="Your venue requests"
      meta={<Link to="/book" className="font-semibold text-ink hover:underline">New request</Link>}
      columns={compact ? "96px minmax(0,1fr) 120px" : "96px minmax(0,1fr) 150px 96px 132px"}
      headers={compact ? ["Request", "Event", "Status"] : ["Request", "Event", "When", "Venue", "Status"]}
    >
      {data.map((b, i) => {
        const s = bookingStatus(b.status);
        const d = b.decision;
        const tone: FlapTone = s.aspect === "clear" ? "clear" : s.aspect === "stop" ? "stop" : s.aspect === "caution" ? "caution" : "wait";
        return (
          <BoardRow key={b.id} index={i} onClick={() => nav(`/book?request=${encodeURIComponent(b.id)}`)}>
            <BoardText>{b.id}</BoardText>
            <span role="cell" className="col-span-2 row-start-2 truncate text-[13.5px] font-semibold sm:col-span-1 sm:row-start-auto">
              {b.title}
            </span>
            {!compact && (
              <BoardText dim className="hidden sm:block">
                {d?.day ? `${d.day} ${periodLabel(d.start_period ?? 0, summary?.periods)}` : "—"}
              </BoardText>
            )}
            {!compact && <BoardText className="hidden sm:block">{d?.room_id ?? "—"}</BoardText>}
            <span role="cell" className="justify-self-end text-[14px] sm:justify-self-start">
              <SplitFlap value={s.board.slice(0, 10)} length={compact ? 9 : 10} tone={tone} delay={i * 90} label={s.label} />
            </span>
          </BoardRow>
        );
      })}
    </Board>
  );
}

/** A club's requests as a headline: how many were approved, and where the rest stand. */
function ClubMetrics() {
  const { data } = useBookings(true);
  if (!data?.length) return null;
  const by = (aspect: string) => data.filter((b) => bookingStatus(b.status).aspect === aspect).length;
  const approved = by("clear");
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <MetricCard hero label="Approved" value={approved} unit={`of ${data.length} requests`} note={approved === data.length ? "Every request has a venue." : "The rest are below, with what the code decided."}>
        <ul className="flex flex-wrap gap-[3px]" aria-hidden>
          {data.map((b) => (
            <li key={b.id} className={cn("size-[11px] rounded-[2px]", bookingStatus(b.status).aspect === "clear" ? "bg-signal-ink" : "border-2 border-signal-ink/35")} />
          ))}
        </ul>
      </MetricCard>
      <MetricCard label="Where they stand" value={data.length} unit="sent" note="Each request, by its current decision.">
        <StackBar
          parts={[
            { key: "clear", label: "Approved", value: approved, fill: FILL.clear },
            { key: "caution", label: "Another slot offered", value: by("caution"), fill: FILL.caution },
            { key: "stop", label: "Rejected", value: by("stop"), fill: FILL.stop },
            { key: "wait", label: "Waiting", value: by("wait") + by("off"), fill: FILL.wait },
          ]}
        />
      </MetricCard>
    </div>
  );
}

function ClubOverview() {
  return (
    <>
      <ClubMetrics />
      <MyBookings />
      <section className="flex flex-col items-start gap-3 rounded-[6px] border-2 border-rule-strong bg-anthracite p-5 text-on-anthracite shadow-float sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <p className="eyebrow text-on-anthracite-2">Assistant</p>
          <h2 className="mt-1 text-[20px] font-black [font-stretch:106%]">Book a venue in plain words</h2>
          <p className="mt-1 max-w-[60ch] text-[14px]">
            "Seminar hall kal shaam 6 baje, 2 ghante, 100 log, mic chahiye" works. You check the form before anything is sent.
          </p>
        </div>
        <Button asChild variant="primary" size="lg">
          <Link to="/book">
            <Ticket /> Start a request
          </Link>
        </Button>
      </section>
    </>
  );
}

export default function Overview() {
  const user = useUser();
  const dash = useDashboard();
  const first = user.name.replace(/^(Dr\.|Prof\.)\s+/, "").split(" ")[0];
  const date = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={user.role === "admin" ? undefined : `${ROLE[user.role]} · ${date}`}
        title={user.role === "faculty" ? `Good to see you, ${first}` : user.role === "club" ? user.name : "Overview"}
        lede={
          user.role === "admin"
            ? "Where the week stands. Every number here comes from the solver and the rule checker, which applies the same rules as the official validator."
            : user.role === "coordinator"
              ? `Requests for ${user.department} and the state of the week.`
              : user.role === "faculty"
                ? "Your classes today and the changes you've asked for."
                : "Your venue requests for Spectra week and where they stand."
        }
        actions={
          user.role === "admin" ? (
            <>
              <Button size="xl" onClick={() => download("/export/schedule.json", { after: 0 }, "schedule.json").catch((e) => toast.error("Couldn't export", { description: errorMessage(e) }))}>
                <Download /> Export schedule.json
              </Button>
              <Button asChild size="xl" variant="primary">
                <Link to="/data">
                  Generate timetable <ArrowRight />
                </Link>
              </Button>
            </>
          ) : (
            user.role !== "club" && (
              <Button asChild size="xl">
                <Link to="/timetable">
                  <CalendarRange /> Open timetable
                </Link>
              </Button>
            )
          )
        }
      />
      {dash.isLoading ? (
        <Loading rows={6} />
      ) : dash.isError ? (
        <ErrorState error={dash.error} onRetry={() => dash.refetch()} />
      ) : dash.data ? (
        user.role === "admin" ? (
          <AdminOverview d={dash.data} />
        ) : user.role === "coordinator" ? (
          <CoordinatorOverview d={dash.data} />
        ) : user.role === "faculty" ? (
          <FacultyOverview />
        ) : (
          <ClubOverview />
        )
      ) : null}
    </div>
  );
}
