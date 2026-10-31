import { CalendarPlus, CalendarRange, MessageSquareText, Ticket } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { useBookings, useChanges, useDashboard, useSummary, useTimetable } from "@/api/hooks";
import type { Dashboard, Entry } from "@/api/types";
import { Board, BoardRow, BoardText } from "@/components/board/Board";
import { Code, KindBullet, StatusChip } from "@/components/board/signals";
import { SplitFlap, type FlapTone } from "@/components/board/SplitFlap";
import { DotMatrix } from "@/components/dashboard/DotMatrix";
import { GenerateCard } from "@/components/dashboard/GenerateCard";
import { DotRow, MetricCard, MiniColumns, RingMeter, RuleTicks, StackBar, type Part, type Tick } from "@/components/dashboard/Metrics";
import { RoomLoad } from "@/components/dashboard/RoomLoad";
import { Empty, ErrorState, Loading, PageHeader, SectionTitle } from "@/components/states";
import { Button } from "@/components/ui/button";
import { useUser } from "@/lib/auth";
import { bookingStatus, kindOf, proposalStatus, ROLE, ruleLabel, RULES, SOFT_RULES } from "@/lib/format";
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
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <TimetableHealth d={d} hero />
      <MetricCard label="Soft penalty" value={d.soft_total} unit="points" note="Lower is better. The tallest column is the rule costing most.">
        <MiniColumns mark columns={Object.keys(SOFT_RULES).map((k) => ({ key: k, label: k, value: d.soft[k] ?? 0, detail: `${k} ${SOFT_RULES[k]}: ${d.soft[k] ?? 0}` }))} />
      </MetricCard>
      <SpectraMetric d={d} />
      <MetricCard
        label="Midsem exams"
        value={d.exams_scheduled}
        unit={`of ${d.exams_total} placed`}
        note={d.exams_scheduled ? "Monday to Saturday, rooms at half capacity." : "Not scheduled yet."}
        to="/exams"
      >
        {d.exams_total > 0 && <DotRow done={d.exams_scheduled} total={d.exams_total} label="exams placed" />}
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

function ServiceBoard({ d, scope }: { d: Dashboard; scope: "admin" | "coordinator" }) {
  const nav = useNavigate();
  const fest = d.fest;
  const rows: { service: string; detail: string; status: Status; to: string }[] = [
    {
      service: "Timetable",
      detail: d.has_timetable ? `${d.placed} of ${d.total} sessions placed. Soft penalty ${d.soft_total}.` : "Not generated yet",
      status: !d.has_timetable ? ["NOT RUN", "wait"] : d.placed === d.total ? ["ON TIME", "clear"] : ["PARTIAL", "stop"],
      to: "/timetable",
    },
    {
      service: "Hard rules",
      detail: !d.has_timetable ? "Checked once a timetable exists" : d.hard_count ? `${plural(d.hard_count, "violation")} found` : "No violations in the timetable, exams or bookings",
      status: !d.has_timetable ? ["", "wait"] : d.hard_count ? ["STOP", "stop"] : ["CLEAR", "clear"],
      to: "/timetable",
    },
    {
      service: "Midsem exams",
      detail: d.exams_scheduled ? `${d.exams_scheduled} of ${d.exams_total} exams placed` : "Not scheduled yet",
      status: !d.exams_scheduled ? ["NOT RUN", "wait"] : d.exams_scheduled === d.exams_total ? ["ON TIME", "clear"] : ["PARTIAL", "caution"],
      to: "/exams",
    },
    {
      service: "Spectra week",
      detail: fest
        ? `${fest.approved} approved, ${fest.alternatives} offered another slot, ${fest.rejected} rejected. Score ${fest.booking_score} of ${fest.booking_score_max}.`
        : "Not decided yet",
      status: !fest ? ["NOT RUN", "wait"] : fest.priority_inversions.length ? ["CHECK", "stop"] : fest.pending ? ["WAITING", "caution"] : ["DECIDED", "clear"],
      to: "/spectra",
    },
    {
      service: "Approvals",
      detail: d.pending.length ? `${plural(d.pending.length, "request")} waiting for you` : "Nothing waiting for you",
      status: d.pending.length ? ["WAITING", "caution"] : ["NONE", "wait"],
      to: "/approvals",
    },
  ];
  const shown = scope === "admin" ? rows : rows.filter((r) => r.service !== "Hard rules" && r.service !== "Midsem exams");
  return (
    <Board
      title="Status"
      meta={<span>Checked against the same rules as the official validator</span>}
      columns="150px minmax(0,1fr) 136px"
      headers={["Service", "Detail", "Status"]}
    >
      {shown.map((r, i) => (
        <BoardRow key={r.service} index={i} onClick={() => nav(r.to)}>
          <BoardText className="text-[14px]">{r.service}</BoardText>
          <span role="cell" className="col-span-2 row-start-2 text-[13px] text-on-anthracite-2 sm:col-span-1 sm:row-start-auto">
            {r.detail}
          </span>
          <span role="cell" className="justify-self-end text-[15px] sm:justify-self-start">
            <SplitFlap value={r.status[0]} length={8} tone={r.status[1]} delay={i * 120} label={r.status[0] || "waiting"} />
          </span>
        </BoardRow>
      ))}
    </Board>
  );
}

function SoftBreakdown({ d }: { d: Dashboard }) {
  const entries = Object.keys(SOFT_RULES).map((k) => [k, d.soft[k] ?? 0] as const);
  const max = Math.max(1, ...entries.map(([, v]) => v));
  return (
    <section className="sheet p-4 sm:p-5">
      <p className="eyebrow">Soft rules</p>
      <SectionTitle className="mt-1" aside={<span className="text-[24px] font-black leading-none">{d.soft_total}</span>}>Where the penalty comes from</SectionTitle>
      <p className="-mt-2 mb-4 text-[12.5px] text-ink-2">Lower is better. Once every hard rule holds, the solver keeps these as low as it can.</p>
      <ul className="flex flex-col gap-2.5">
        {entries.map(([k, v]) => (
          <li key={k} className="grid grid-cols-[34px_minmax(0,1fr)_64px_28px] items-center gap-2 text-[13px]">
            <Code>{k}</Code>
            <span className={cn("truncate", v ? "text-ink" : "text-ink-3")}>{SOFT_RULES[k]}</span>
            <span className="h-3 overflow-hidden rounded-[2px] border-2 border-rule-strong bg-sheet">
              <span className="block h-full bg-ink transition-[width] duration-500" style={{ width: `${(v / max) * 100}%` }} />
            </span>
            <span className="text-right font-semibold tabular-nums">{v}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Waiting({ d }: { d: Dashboard }) {
  const changes = d.pending.filter((p) => p.kind === "change").length;
  return (
    <section className="sheet flex flex-col p-4 sm:p-5">
      <p className="eyebrow">Activity</p>
      <SectionTitle className="mt-1" aside={d.pending.length > 0 && <Link to="/approvals" className="text-[13px] font-semibold underline-offset-2 hover:underline">Open approvals</Link>}>
        Waiting for you
      </SectionTitle>
      <dl className="mb-3 grid grid-cols-2 gap-2">
        {[
          ["Changes", changes],
          ["Bookings", d.pending.length - changes],
        ].map(([label, v]) => (
          <div key={label} className="inset-tile px-3 py-2.5">
            <dt className="eyebrow truncate">{label}</dt>
            <dd className="text-[26px] font-black leading-8">{v}</dd>
          </div>
        ))}
      </dl>
      {d.pending.length === 0 ? (
        <p className="text-[13.5px] text-ink-2">Nothing to approve. Requests that need you will appear here.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-rule">
          {d.pending.slice(0, 6).map((p) => (
            <li key={p.kind + p.id}>
              <Link to={p.kind === "change" ? `/changes/${p.id}` : "/approvals"} className="flex items-center gap-3 py-2.5 hover:text-ink">
                <Code tone="signal">{p.kind === "change" ? `#${p.id}` : p.id}</Code>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold">{p.title}</span>
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
    </section>
  );
}

function Conflicts({ d }: { d: Dashboard }) {
  if (!d.conflicts.length) return null;
  return (
    <section className="sheet border-stop/50 p-4 sm:p-5" role="alert">
      <SectionTitle>Hard-rule violations</SectionTitle>
      <ul className="flex flex-col gap-2">
        {d.conflicts.map((c, i) => (
          <li key={i} className="flex items-start gap-2 text-[13px]">
            <Code className="bg-stop text-sheet">{c.rule}</Code>
            <span>
              <b className="font-semibold">{ruleLabel(c.rule)}.</b> {c.detail} <span className="text-ink-3">({c.where})</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SpectraDecisions({ d }: { d: Dashboard }) {
  const f = d.fest;
  return (
    <section className="sheet flex flex-col p-4 sm:p-5">
      <p className="eyebrow">Spectra week</p>
      <SectionTitle className="mt-1" aside={<Link to="/spectra" className="text-[13px] font-semibold underline-offset-2 hover:underline">Decision board</Link>}>
        How the requests were decided
      </SectionTitle>
      {!f ? (
        <p className="text-[13.5px] text-ink-2">Not decided yet. The Admin decides every request at once, in priority order.</p>
      ) : (
        <>
          <StackBar
            parts={[
              { key: "approved", label: "Approved", value: f.approved, fill: FILL.clear },
              { key: "alt", label: "Another slot offered", value: f.alternatives, fill: FILL.caution },
              { key: "rejected", label: "Rejected", value: f.rejected, fill: FILL.stop },
              { key: "pending", label: "Waiting for approval", value: f.pending, fill: FILL.wait },
            ]}
          />
          <dl className="mt-4 grid grid-cols-2 gap-2">
            {[
              ["Priority inversions", f.priority_inversions.length],
              ["Overrides", f.overrides],
            ].map(([label, v]) => (
              <div key={label} className="inset-tile px-3 py-2.5">
                <dt className="eyebrow truncate">{label}</dt>
                <dd className="text-[26px] font-black leading-8">{v}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </section>
  );
}

function AdminOverview({ d }: { d: Dashboard }) {
  const { data: summary } = useSummary();
  return (
    <>
      {!d.has_timetable && <GenerateCard />}
      {d.has_timetable && <AdminMetrics d={d} />}
      {d.has_timetable && summary && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <RoomLoad rooms={d.utilisation} grid={d.grid} days={summary.days} periods={summary.periods} lunchAfter={summary.lunch_after} />
          <Waiting d={d} />
        </div>
      )}
      <ServiceBoard d={d} scope="admin" />
      <Conflicts d={d} />
      {d.has_timetable && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <SoftBreakdown d={d} />
          <SpectraDecisions d={d} />
        </div>
      )}
      {d.has_timetable && summary && <DotMatrix rooms={d.utilisation} grid={d.grid} days={summary.days} periods={summary.periods} lunchAfter={summary.lunch_after} />}
    </>
  );
}

function CoordinatorOverview({ d }: { d: Dashboard }) {
  const { data: summary } = useSummary();
  return (
    <>
      <CoordinatorMetrics d={d} days={summary?.days ?? [...DAYS]} />
      <ServiceBoard d={d} scope="coordinator" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Waiting d={d} />
        <MyBookings compact />
      </div>
      {d.has_timetable && summary && <DotMatrix rooms={d.utilisation} grid={d.grid} days={summary.days} periods={summary.periods} lunchAfter={summary.lunch_after} />}
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
      meta={<Link to="/timetable" className="font-semibold text-on-anthracite hover:underline">Full week</Link>}
      columns="112px minmax(0,1fr) 92px 120px 96px"
      headers={["Time", "Class", "Room", "Groups", "Status"]}
      footer={entries.length ? `${plural(entries.length, "class", "classes")} today` : undefined}
    >
      {entries.length === 0 ? (
        <div className="px-5 py-6 text-[13.5px] text-on-anthracite-2">No classes on {dayName(today)}.</div>
      ) : (
        entries.map((e, i) => {
          const [label, tone] = status(e, i);
          return (
            <BoardRow key={e.session_id} index={i} highlight={label === "NOW"}>
              <BoardText className="tabular-nums">{spanLabel(e.start_period, e.duration, summary?.periods)}</BoardText>
              <span role="cell" className="col-span-2 row-start-2 flex min-w-0 items-center gap-2 sm:col-span-1 sm:row-start-auto">
                <KindBullet kind={kindOf(e.kind)} size="sm" />
                <span className="truncate text-[13.5px] font-semibold">
                  {e.course_id} <span className="font-normal text-on-anthracite-2">{e.course_title}</span>
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
      meta={<Link to="/book" className="font-semibold text-on-anthracite hover:underline">New request</Link>}
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
        eyebrow={`${ROLE[user.role]} · ${date}`}
        title={user.role === "faculty" ? `Good to see you, ${first}` : user.role === "club" ? user.name : "Overview"}
        lede={
          user.role === "admin"
            ? "Where the week stands. Every number here comes from the solver and the rule checker."
            : user.role === "coordinator"
              ? `Requests for ${user.department} and the state of the week.`
              : user.role === "faculty"
                ? "Your classes today and the changes you've asked for."
                : "Your venue requests for Spectra week and where they stand."
        }
        actions={
          user.role !== "club" && (
            <Button asChild>
              <Link to="/timetable">
                <CalendarRange /> Open timetable
              </Link>
            </Button>
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
