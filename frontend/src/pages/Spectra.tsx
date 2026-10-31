import { Check, Gavel, Loader2, MessageSquareQuote, Play, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { ApiError, errorMessage } from "@/api/client";
import { useDecideAll, useDecideBooking, useExplainBooking, useFest, useSettings, useSummary, useTimetable } from "@/api/hooks";
import type { Booking, Summary } from "@/api/types";
import { Board, BoardRow, BoardText } from "@/components/board/Board";
import { Code, StatusChip } from "@/components/board/signals";
import { SplitFlap, type FlapTone } from "@/components/board/SplitFlap";
import { TrackProgress } from "@/components/board/TrackProgress";
import { GenerateCard } from "@/components/dashboard/GenerateCard";
import { MetricCard, RingMeter, StackBar } from "@/components/dashboard/Metrics";
import { Empty, ErrorState, Loading, PageHeader, SectionTitle } from "@/components/states";
import { fromEntries } from "@/components/timetable/layout";
import { RoomDayGrid } from "@/components/timetable/RoomDayGrid";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { Drawer } from "@/components/ui/dialog";
import { useUser } from "@/lib/auth";
import { bookingStatus, categoryLabel, featureLabel } from "@/lib/format";
import { dayShort, periodEnd, periodLabel, periodRange } from "@/lib/time";
import { cn, plural } from "@/lib/utils";

type Filter = "all" | "approved" | "alternative" | "rejected" | "waiting";

const toneOf = (status: string): FlapTone => {
  const a = bookingStatus(status).aspect;
  return a === "clear" ? "clear" : a === "stop" ? "stop" : a === "caution" ? "caution" : "wait";
};

function when(b: Booking, summary?: Summary) {
  const d = b.decision;
  if (d?.day && d.start_period != null && d.end_period != null) return `${dayShort(d.day)} ${periodLabel(d.start_period, summary?.periods)}–${periodEnd(d.end_period, summary?.periods)}`;
  const w = b.windows[0];
  return w ? `${dayShort(w.day)} ${periodRange(w.from_period, w.to_period)}` : "";
}

function RequestDrawer({ b, onClose, onShow, summary }: { b: Booking | null; onClose: () => void; onShow: (id: string) => void; summary?: Summary }) {
  const [words, setWords] = useState(false);
  const ex = useExplainBooking(b?.id ?? null, false);
  const w = useExplainBooking(words && b ? b.id : null, true);
  const decide = useDecideBooking();
  const s = b ? bookingStatus(b.status) : null;
  const d = b?.decision;
  const act = (action: "approve" | "reject") =>
    b &&
    decide.mutate(
      { id: b.id, action },
      {
        onSuccess: (r) => toast.success(`${b.id} ${action === "approve" ? "approved" : "declined"}`, { description: r.reason }),
        onError: (e) => toast.error("Couldn't record the decision", { description: errorMessage(e) }),
      },
    );
  return (
    <Drawer
      open={!!b}
      onOpenChange={(v) => {
        if (!v) {
          setWords(false);
          onClose();
        }
      }}
      wide
      title={b ? b.title : ""}
      description={b && `${b.id} from ${b.requester}${b.department ? ` (${b.department})` : ""}`}
    >
      {b && s && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip aspect={s.aspect}>{s.label}</StatusChip>
            {d?.room_id && <Code>{d.room_id}</Code>}
            <span className="text-[13px] tabular-nums text-ink-2">{when(b, summary)}</span>
          </div>
          <section>
            <h3 className="mb-1.5 text-[14px] font-bold">Decision</h3>
            <p className="text-[14px] leading-[21px]">{b.reason || d?.reason}</p>
            {ex.data && ex.data.facts.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1.5">
                {ex.data.facts.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-[13px] leading-[19px] text-ink-2">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-clear" />
                    {f}
                  </li>
                ))}
              </ul>
            )}
            {ex.isLoading && <Loading rows={2} className="mt-2" />}
            <div className="mt-3">
              {!words ? (
                <Button size="sm" variant="ghost" onClick={() => setWords(true)}>
                  <MessageSquareQuote /> Say it in plain words
                </Button>
              ) : w.isLoading ? (
                <p className="flex items-center gap-2 text-[13px] text-ink-2">
                  <Loader2 className="size-4 animate-spin" /> Rewording the decision…
                </p>
              ) : w.data?.words ? (
                <blockquote className="rounded-[4px] border-l-[3px] border-signal bg-signal-soft px-3 py-2 text-[13.5px] leading-[20px]">{w.data.words}</blockquote>
              ) : null}
            </div>
          </section>
          {(d?.lost_to || ex.data?.lost_to) && (
            <section className="rounded-[4px] border-2 border-rule-strong bg-stop-soft p-3">
              <p className="text-[13.5px]">
                Lost its first choice to <b>{d?.lost_to ?? ex.data?.lost_to}</b>, which ranks higher.
              </p>
              <Button size="sm" className="mt-2" onClick={() => onShow((d?.lost_to ?? ex.data?.lost_to)!)}>
                Show {d?.lost_to ?? ex.data?.lost_to} on the board
              </Button>
            </section>
          )}
          {!!d?.displaces?.length && (
            <section>
              <h3 className="mb-1.5 text-[14px] font-bold">Classes moved for it</h3>
              <p className="mb-2 text-[13px] text-ink-2">Institute events may displace classes in Week 7 only. These sessions were re-placed for that week.</p>
              <div className="flex flex-wrap gap-1.5">
                {d.displaces.map((sid) => (
                  <Code key={sid}>{sid}</Code>
                ))}
              </div>
            </section>
          )}
          <section className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-[6px] bg-sheet-2 p-3 text-[13px]">
            <div>
              <div className="text-[11.5px] text-ink-3">Category</div>
              {categoryLabel(b.category)}
              {b.category !== b.requested_category && <div className="text-[12px] text-ink-3">Asked for {categoryLabel(b.requested_category).toLowerCase()}</div>}
            </div>
            <div>
              <div className="text-[11.5px] text-ink-3">People</div>
              {b.attendance}
            </div>
            <div>
              <div className="text-[11.5px] text-ink-3">Asked for</div>
              {b.windows.map((x) => `${dayShort(x.day)} ${periodRange(x.from_period, x.to_period)}`).join(", ")}
              {b.requested_room ? ` in ${b.requested_room}` : ""}
            </div>
            <div>
              <div className="text-[11.5px] text-ink-3">Needs</div>
              {b.needs.length ? b.needs.map(featureLabel).join(", ") : "None"}
            </div>
            {b.raw_text && (
              <div className="col-span-2">
                <div className="text-[11.5px] text-ink-3">In their words</div>
                <q className="text-ink-2">{b.raw_text}</q>
              </div>
            )}
          </section>
          {b.can_decide && (
            <div className="flex flex-wrap gap-2">
              <Button variant="clear" onClick={() => act("approve")} disabled={decide.isPending}>
                <Check /> Approve
              </Button>
              <Button variant="danger" onClick={() => act("reject")} disabled={decide.isPending}>
                <X /> Decline
              </Button>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}

function VenueLanes({ summary }: { summary: Summary }) {
  const [day, setDay] = useState(summary.days[0]);
  const tt = useTimetable("all", "", "spectra");
  const items = useMemo(() => (tt.data ? fromEntries(tt.data.entries, tt.data.bookings) : []), [tt.data]);
  const rooms = summary.rooms.filter((r) => r.allowed_uses.includes("event"));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented aria-label="Day" value={day} onChange={setDay} items={summary.days.map((d) => ({ value: d, label: dayShort(d) }))} />
        <p className="text-[12.5px] text-ink-2">Event venues on {dayShort(day)} in Week 7: hatched blocks are bookings, the rest are classes.</p>
      </div>
      {tt.isLoading ? <Loading rows={6} /> : tt.isError ? <ErrorState error={tt.error} onRetry={() => tt.refetch()} /> : (
        <RoomDayGrid rooms={rooms} items={items} day={day} periods={summary.periods} showEvening lunchAfter={summary.lunch_after} />
      )}
    </div>
  );
}

export default function Spectra() {
  const user = useUser();
  const fest = useFest();
  const { data: summary } = useSummary();
  const { data: settings } = useSettings();
  const decideAll = useDecideAll();
  const [filter, setFilter] = useState<Filter>("all");
  const [mode, setMode] = useState<"board" | "venues">("board");
  const [open, setOpen] = useState<Booking | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [replay, setReplay] = useState(0);

  const ordered = useMemo(() => {
    const order = settings?.priority_order ?? [];
    const rank = (b: Booking) => (b.status === "cancelled" ? 99 : order.indexOf(b.category) === -1 ? 50 : order.indexOf(b.category));
    return [...(fest.data?.requests ?? [])].sort((a, b) => rank(a) - rank(b) || a.submitted_at.localeCompare(b.submitted_at) || a.id.localeCompare(b.id));
  }, [fest.data, settings]);

  const shown = ordered.filter((b) => {
    const a = bookingStatus(b.status).aspect;
    return filter === "all" || (filter === "approved" && a === "clear") || (filter === "alternative" && a === "caution") || (filter === "rejected" && (a === "stop" || a === "off")) || (filter === "waiting" && a === "wait");
  });

  const showRow = (id: string) => {
    setOpen(null);
    setFilter("all");
    setFlash(id);
    setTimeout(() => document.getElementById(`fest-${id}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 250);
    setTimeout(() => setFlash(null), 2600);
  };

  const runDecideAll = () =>
    decideAll.mutate(undefined, {
      onSuccess: (s) => {
        setReplay((r) => r + 1);
        toast.success("Spectra week decided", { description: `${s.approved} approved, ${s.alternatives} offered another slot, ${s.rejected} rejected. Score ${s.booking_score} of ${s.booking_score_max}.` });
      },
      onError: (e) => toast.error("Couldn't decide Spectra week", { description: errorMessage(e) }),
    });

  const noTimetable = fest.error instanceof ApiError && fest.error.code === "no_timetable";
  const sum = fest.data?.summary;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Spectra week"
        lede="Week 7 venue requests, decided in priority order: institute events, guest lectures, department events, then club events. Ties go to whoever asked first, and every decision carries its reason."
        actions={
          <>
            <Button onClick={() => setReplay((r) => r + 1)} disabled={!fest.data?.decided}>
              <Play /> Replay decisions
            </Button>
            {user.role === "admin" && (
              <Button variant="signal" onClick={runDecideAll} disabled={decideAll.isPending || !fest.data}>
                {decideAll.isPending ? <Loader2 className="animate-spin" /> : <Gavel />} Decide all
              </Button>
            )}
          </>
        }
      />
      <TrackProgress running={decideAll.isPending} label="Deciding requests in priority order" />

      {noTimetable ? (
        <GenerateCard />
      ) : fest.isLoading ? (
        <Loading rows={10} />
      ) : fest.isError ? (
        <ErrorState error={fest.error} onRetry={() => fest.refetch()} />
      ) : !fest.data?.decided ? (
        <Empty icon={<Gavel />} title="Not decided yet" action={user.role === "admin" && <Button variant="signal" onClick={runDecideAll}><Gavel /> Decide all</Button>}>
          {user.role === "admin" ? "Decide every request at once. The code goes down the priority list and gives each request the best slot still free." : "The Admin hasn't run the decisions yet."}
        </Empty>
      ) : (
        <>
          {sum && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <MetricCard hero label="Booking score" value={sum.booking_score} unit={`of ${sum.booking_score_max} points`} note="Each request scores by its priority and how close it got to what it asked for.">
                <div className="flex items-center gap-4">
                  <RingMeter value={sum.booking_score} max={sum.booking_score_max} caption="score" />
                  <p className="text-[12.5px] leading-[17px] text-signal-ink/80">The ring is the share of the best possible score.</p>
                </div>
              </MetricCard>
              <MetricCard label="Decisions" value={sum.approved + sum.alternatives + sum.rejected + sum.pending} unit="requests" note="Every request, by what the code decided.">
                <StackBar
                  parts={[
                    { key: "approved", label: "Approved", value: sum.approved, fill: "bg-clear" },
                    { key: "alt", label: "Another slot", value: sum.alternatives, fill: "bg-caution" },
                    { key: "rejected", label: "Rejected", value: sum.rejected, fill: "bg-stop" },
                    { key: "pending", label: "Waiting", value: sum.pending, fill: "bg-wait" },
                  ]}
                />
              </MetricCard>
              <MetricCard
                label="Priority inversions"
                value={sum.priority_inversions.length}
                unit={sum.priority_inversions.length ? "to check" : "found"}
                note={sum.priority_inversions.length ? "A lower-priority request took a slot a higher one wanted." : "No lower-priority request took a slot a higher one wanted."}
              >
                <dl className="grid grid-cols-2 gap-2">
                  {[
                    ["Overrides", sum.overrides],
                    ["Hard violations", sum.hard_count],
                  ].map(([label, v]) => (
                    <div key={label} className="inset-tile px-3 py-2.5">
                      <dt className="eyebrow truncate">{label}</dt>
                      <dd className="text-[24px] font-black leading-7">{v}</dd>
                    </div>
                  ))}
                </dl>
              </MetricCard>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Segmented aria-label="View" value={mode} onChange={setMode} items={[{ value: "board", label: "Decision board" }, { value: "venues", label: "Venues by day" }]} />
            {mode === "board" && (
              <Segmented
                aria-label="Filter"
                size="sm"
                value={filter}
                onChange={setFilter}
                items={[
                  { value: "all", label: "All" },
                  { value: "approved", label: "Approved" },
                  { value: "alternative", label: "Other slot" },
                  { value: "rejected", label: "Rejected" },
                  { value: "waiting", label: "Waiting" },
                ]}
              />
            )}
          </div>

          {mode === "board" ? (
            <Board
              title="Decisions, highest priority first"
              meta={<span>{plural(ordered.length, "request")}. Select one for its reason.</span>}
              columns="36px 76px minmax(0,1fr) 128px 120px 82px 142px"
              headers={["#", "Request", "Event", "Category", "When", "Venue", "Status"]}
            >
              {shown.map((b) => {
                const rank = ordered.indexOf(b);
                const s = bookingStatus(b.status);
                return (
                  <div key={b.id} id={`fest-${b.id}`}>
                    <BoardRow index={rank} onClick={() => setOpen(b)} active={open?.id === b.id} highlight={flash === b.id} className={cn(flash === b.id && "bg-anthracite-2")}>
                      <BoardText dim className="hidden tabular-nums sm:block">{rank + 1}</BoardText>
                      <BoardText>
                        <span className="text-ink-3 sm:hidden">{rank + 1}. </span>
                        {b.id}
                      </BoardText>
                      <span role="cell" className="col-span-2 row-start-2 min-w-0 sm:col-span-1 sm:row-start-auto">
                        <span className="block truncate text-[13.5px] font-semibold">{b.title}</span>
                        <span className="block truncate text-[12px] text-ink-2">{b.reason}</span>
                      </span>
                      <BoardText dim className="hidden sm:block">{categoryLabel(b.category)}</BoardText>
                      <BoardText dim className="hidden tabular-nums sm:block">{when(b, summary)}</BoardText>
                      <BoardText className="hidden sm:block">{b.decision?.room_id ?? "—"}</BoardText>
                      <span role="cell" className="justify-self-end text-[14px] sm:justify-self-start">
                        <SplitFlap key={replay} value={s.board.slice(0, 11)} length={11} tone={toneOf(b.status)} delay={replay ? rank * 160 : rank * 40} label={s.label} />
                      </span>
                    </BoardRow>
                  </div>
                );
              })}
              {shown.length === 0 && <div className="px-5 py-6 text-[13.5px] text-ink-2">No requests with this status.</div>}
            </Board>
          ) : (
            summary && <VenueLanes summary={summary} />
          )}

          {fest.data.overrides.length > 0 && (
            <section className="sheet p-4 sm:p-5">
              <SectionTitle aside={<Link to="/timetable?week=spectra" className="text-[13px] font-semibold hover:underline">See them on the timetable</Link>}>
                Classes moved for Week 7
              </SectionTitle>
              <p className="-mt-2 mb-3 text-[12.5px] text-ink-2">Only approved institute events may move a class, and only for Week 7.</p>
              <ul className="flex flex-col divide-y divide-rule">
                {fest.data.overrides.map((o, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2 py-2 text-[13px]">
                    <Code>{String(o.session_id)}</Code>
                    <span className="text-ink-2">moves to</span>
                    <b className="tabular-nums">
                      {dayShort(String(o.day))} {periodLabel(Number(o.start_period), summary?.periods)}
                    </b>
                    <span className="text-ink-2">in</span>
                    <Code>{String(o.room_id)}</Code>
                    <span className="text-ink-3">for {String(o.displaced_by)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <RequestDrawer b={open} onClose={() => setOpen(null)} onShow={showRow} summary={summary} />
    </div>
  );
}
