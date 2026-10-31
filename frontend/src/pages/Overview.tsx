import { CalendarPlus, CalendarRange, MessageSquareText, Ticket } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { useBookings, useChanges, useDashboard, useSummary, useTimetable } from "@/api/hooks";
import type { Dashboard, Entry } from "@/api/types";
import { Board, BoardRow, BoardText } from "@/components/board/Board";
import { Code, KindBullet, StatusChip } from "@/components/board/signals";
import { SplitFlap, type FlapTone } from "@/components/board/SplitFlap";
import { DotMatrix } from "@/components/dashboard/DotMatrix";
import { GenerateCard } from "@/components/dashboard/GenerateCard";
import { Empty, ErrorState, Loading, PageHeader, SectionTitle } from "@/components/states";
import { Button } from "@/components/ui/button";
import { useUser } from "@/lib/auth";
import { bookingStatus, kindOf, proposalStatus, ruleLabel, SOFT_RULES } from "@/lib/format";
import { dayName, nowOnGrid, periodLabel, spanLabel, todayCode } from "@/lib/time";
import { cn, fmtDateTime, plural } from "@/lib/utils";

type Status = [string, FlapTone];

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
      <SectionTitle aside={<span className="text-[24px] font-bold tabular-nums leading-none">{d.soft_total}</span>}>Soft penalty</SectionTitle>
      <p className="-mt-2 mb-4 text-[12.5px] text-ink-2">Lower is better. Once every hard rule holds, the solver keeps these as low as it can.</p>
      <ul className="flex flex-col gap-2.5">
        {entries.map(([k, v]) => (
          <li key={k} className="grid grid-cols-[34px_minmax(0,1fr)_64px_28px] items-center gap-2 text-[13px]">
            <Code>{k}</Code>
            <span className={cn("truncate", v ? "text-ink" : "text-ink-3")}>{SOFT_RULES[k]}</span>
            <span className="h-2 overflow-hidden rounded-full bg-platform-2">
              <span className="block h-full rounded-full bg-ink transition-[width] duration-500" style={{ width: `${(v / max) * 100}%` }} />
            </span>
            <span className="text-right font-semibold tabular-nums">{v}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Waiting({ d }: { d: Dashboard }) {
  return (
    <section className="sheet flex flex-col p-4 sm:p-5">
      <SectionTitle aside={d.pending.length > 0 && <Link to="/approvals" className="text-[13px] font-semibold underline-offset-2 hover:underline">Open approvals</Link>}>
        Waiting for you
      </SectionTitle>
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

function AdminOverview({ d }: { d: Dashboard }) {
  const { data: summary } = useSummary();
  return (
    <>
      {!d.has_timetable && <GenerateCard />}
      <ServiceBoard d={d} scope="admin" />
      <Conflicts d={d} />
      {d.has_timetable && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <SoftBreakdown d={d} />
          <Waiting d={d} />
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

function FacultyOverview() {
  return (
    <>
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

function ClubOverview() {
  return (
    <>
      <MyBookings />
      <section className="flex flex-col items-start gap-3 rounded-[12px] bg-signal p-5 text-signal-ink shadow-[inset_0_-3px_0_oklch(0_0_0/0.12)] sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <h2 className="text-[18px] font-bold">Book a venue in plain words</h2>
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
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
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
