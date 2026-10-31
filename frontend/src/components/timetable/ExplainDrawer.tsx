import { ArrowRight, Check, Loader2, MessageSquareQuote, MoveRight } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { ApiError, errorMessage } from "@/api/client";
import { useExplainBooking, useExplainSession, useManualMove } from "@/api/hooks";
import type { Alternative, Period } from "@/api/types";
import { Code, KindBullet, StatusChip } from "@/components/board/signals";
import { ErrorState, Loading } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/dialog";
import { Logo } from "@/components/ui/logo";
import { useUser } from "@/lib/auth";
import { bookingStatus, KIND } from "@/lib/format";
import { dayShort, periodLabel, periodRange, spanLabel } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useVelo, useVeloFocus } from "@/components/velo/VeloProvider";
import type { GridItem } from "./layout";

type SlotState = { kind: "here" } | { kind: "ok"; alt: Alternative } | { kind: "blocked"; alt: Alternative } | { kind: "none" };

/** Every other start time for this session: free (and what it costs) or blocked (and by what). */
function SlotMap({
  days,
  here,
  alternatives,
  duration,
  picked,
  onPick,
}: {
  days: string[];
  here: { day: string; start: number };
  alternatives: Alternative[];
  duration: number;
  picked: string | null;
  onPick: (key: string, s: SlotState) => void;
}) {
  const map = useMemo(() => {
    const m = new Map<string, SlotState>();
    for (const a of alternatives) m.set(`${a.day}-${a.start}`, a.blocked_by.length ? { kind: "blocked", alt: a } : { kind: "ok", alt: a });
    m.set(`${here.day}-${here.start}`, { kind: "here" });
    return m;
  }, [alternatives, here]);
  const ps = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  return (
    <div>
      <div className="grid gap-[3px]" style={{ gridTemplateColumns: `34px repeat(${ps.length}, minmax(0,1fr))` }} role="grid" aria-label="Start times this session could take">
        <span />
        {ps.map((p) => (
          <span key={p} className="text-center text-[10.5px] font-bold text-ink-3 [font-stretch:80%]">
            P{p}
          </span>
        ))}
        {days.map((d) => (
          <div key={d} className="contents" role="row">
            <span className="self-center text-[11.5px] font-bold [font-stretch:85%]">{dayShort(d)}</span>
            {ps.map((p) => {
              const key = `${d}-${p}`;
              const s = map.get(key) ?? { kind: "none" as const };
              const label =
                s.kind === "here"
                  ? `${d} P${p}: current slot`
                  : s.kind === "ok"
                    ? `${d} P${p}: free in ${s.alt.room}, soft penalty ${s.alt.soft_delta! >= 0 ? "+" : ""}${s.alt.soft_delta}`
                    : s.kind === "blocked"
                      ? `${d} P${p}: blocked`
                      : `${d} P${p}: not a possible start`;
              return (
                <button
                  key={p}
                  type="button"
                  role="gridcell"
                  disabled={s.kind === "none"}
                  onClick={() => onPick(key, s)}
                  aria-label={label}
                  title={label}
                  className={cn(
                    "grid h-6 place-items-center rounded-[2px] border-2 text-[10px] font-bold tabular-nums transition-[box-shadow]",
                    s.kind === "here" && "border-[#111] bg-signal text-[#111] shadow-mount",
                    s.kind === "ok" && "border-rule-strong bg-sheet text-ink hover:shadow-mount",
                    s.kind === "blocked" && "border-[#111] bg-stop-vivid text-[#111] hover:shadow-mount",
                    s.kind === "none" && "border-transparent bg-rule",
                    picked === key && "shadow-[0_0_0_2px_var(--ink)]",
                  )}
                >
                  {s.kind === "here" ? "●" : s.kind === "ok" ? (s.alt.soft_delta! > 0 ? `+${s.alt.soft_delta}` : s.alt.soft_delta) : s.kind === "blocked" ? "×" : ""}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-ink-2">
        <span className="flex items-center gap-1.5"><span className="size-3.5 rounded-[2px] border-2 border-[#111] bg-signal" /> Chosen</span>
        <span className="flex items-center gap-1.5"><span className="size-3.5 rounded-[2px] border-2 border-rule-strong bg-sheet" /> Allowed, the number is the soft penalty it adds</span>
        <span className="flex items-center gap-1.5"><span className="size-3.5 rounded-[2px] border-2 border-[#111] bg-stop-vivid" /> Breaks a hard rule</span>
        {duration > 1 && <span>Starts only; the session runs {duration} periods.</span>}
      </div>
    </div>
  );
}

function SessionExplain({ item, days, periods, onClose }: { item: GridItem; days: string[]; periods?: Period[]; onClose: () => void }) {
  const user = useUser();
  const e = item.entry!;
  const [words, setWords] = useState(false);
  const q = useExplainSession(e.session_id, false);
  const w = useExplainSession(words ? e.session_id : null, true);
  const [picked, setPicked] = useState<{ key: string; s: SlotState } | null>(null);
  const move = useManualMove();
  const nav = useNavigate();
  const canMove = user.role === "admin" || user.role === "coordinator";

  const propose = (alt: Alternative) =>
    move.mutate(
      { session_id: e.session_id, day: alt.day, start_period: alt.start, room_id: alt.room!, reason: "Moved from the timetable" },
      {
        onSuccess: (r) => {
          toast.success("Move proposed", {
            description: `${e.course_id} to ${alt.day} P${alt.start} in ${alt.room}. ${user.role === "admin" ? "Review the diff and apply it." : "The Admin will review it."}`,
            action: r.proposal_id ? { label: "Open", onClick: () => nav(`/changes/${r.proposal_id}`) } : undefined,
          });
          onClose();
        },
        onError: (err) => {
          const details = err instanceof ApiError ? (err.details.violations as { detail: string }[] | undefined) : undefined;
          toast.error("That move breaks a rule", { description: details?.[0]?.detail ?? errorMessage(err) });
        },
      },
    );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2">
        <span className="inline-flex h-8 items-center gap-1.5 rounded-[4px] border-2 border-rule-strong bg-sheet-2 px-2.5 text-[14px] font-bold">
          <KindBullet kind={item.kind} size="sm" /> {KIND[item.kind].label}
        </span>
        <span className="inline-flex h-8 items-center rounded-[4px] border-2 border-rule-strong bg-sheet-2 px-2.5 text-[14px] font-bold tabular-nums">
          {dayShort(e.day)} {spanLabel(e.start_period, e.duration, periods)}
        </span>
        <span className="inline-flex h-8 items-center rounded-[4px] border-2 border-rule-strong bg-sheet-2 px-2.5 text-[14px] font-bold">{e.room_id}</span>
        {e.week7_moved && <span className="inline-flex h-8 items-center rounded-[3px] border-2 border-rule-strong bg-signal px-2.5 text-[12.5px] font-bold text-signal-ink">Moved for Week 7</span>}
      </div>

      <section>
        <h3 className="mb-2.5 text-[12px] font-extrabold uppercase tracking-[0.08em]">Why it's here</h3>
        {q.isLoading ? (
          <Loading rows={3} />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : (
          <ul className="flex flex-col gap-2">
            {q.data!.facts.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-[13.5px] leading-[20px]">
                <span className="mt-px grid size-[18px] shrink-0 place-items-center rounded-[3px] border-2 border-[#111] bg-clear-vivid text-[#111]"><Check className="size-2.5" strokeWidth={4} /></span>
                {f}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3">
          {!words ? (
            <Button size="sm" variant="ghost" onClick={() => setWords(true)}>
              <MessageSquareQuote /> Say it in plain words
            </Button>
          ) : w.isLoading ? (
            <p className="flex items-center gap-2 text-[13px] text-ink-2">
              <Loader2 className="size-4 animate-spin" /> Rewording the checker's facts…
            </p>
          ) : w.data?.words ? (
            <blockquote className="rounded-[4px] border-2 border-rule-strong bg-signal-soft px-3 py-2 text-[13.5px] leading-[20px]">{w.data.words}</blockquote>
          ) : null}
        </div>
      </section>

      {q.data && (
        <section>
          <h3 className="mb-1 border-t-2 border-rule-strong pt-3.5 text-[12px] font-extrabold uppercase tracking-[0.08em]">Every other slot</h3>
          <p className="mb-3 text-[12.5px] text-ink-2">Select a slot to see what blocks it{canMove ? ", or to propose moving the session there" : ""}.</p>
          <SlotMap
            days={days}
            here={{ day: e.day, start: e.start_period }}
            alternatives={q.data.alternatives}
            duration={e.duration}
            picked={picked?.key ?? null}
            onPick={(key, s) => setPicked({ key, s })}
          />
          {picked && picked.s.kind !== "none" && (
            <div className="mt-3 rounded-[6px] border-2 border-rule-strong bg-sheet-2 p-3" aria-live="polite">
              {picked.s.kind === "here" ? (
                <p className="text-[13px]">This is where the solver put it.</p>
              ) : picked.s.kind === "blocked" ? (
                <>
                  <p className="mb-2 text-[13px] font-semibold">
                    {dayShort(picked.s.alt.day)} {periodRange(picked.s.alt.start, picked.s.alt.start + e.duration - 1)} is blocked:
                  </p>
                  <ul className="flex flex-col gap-1.5">
                    {picked.s.alt.blocked_by.map((b, i) => (
                      <li key={i} className="text-[12.5px] leading-[18px] text-ink-2">
                        <span className="font-semibold text-stop">{b.split(":")[0]}.</span> {b.split(":").slice(1).join(":")}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <p className="min-w-0 flex-1 text-[13px]">
                    Free on {dayShort(picked.s.alt.day)} at {periodLabel(picked.s.alt.start, periods)} in <b>{picked.s.alt.room}</b>.{" "}
                    {picked.s.alt.soft_delta! > 0 ? `Soft penalty goes up by ${picked.s.alt.soft_delta}.` : "No extra soft penalty."}
                  </p>
                  {canMove && (
                    <Button size="sm" variant="primary" disabled={move.isPending} onClick={() => picked.s.kind === "ok" && propose(picked.s.alt)}>
                      {move.isPending ? <Loader2 className="animate-spin" /> : <MoveRight />} Propose this move
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function BookingExplain({ item, periods }: { item: GridItem; periods?: Period[] }) {
  const b = item.booking!;
  const q = useExplainBooking(b.request_id);
  const s = bookingStatus(b.status);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip aspect={s.aspect}>{s.label}</StatusChip>
        <Code>{b.room_id}</Code>
        <span className="text-[13px] text-ink-2 tabular-nums">
          {dayShort(b.day)} {spanLabel(b.start_period, b.end_period - b.start_period + 1, periods)}, {b.attendance} people
        </span>
      </div>
      {q.isLoading ? (
        <Loading rows={2} />
      ) : q.isError ? (
        <p className="text-[13px] text-ink-2">{errorMessage(q.error)}</p>
      ) : (
        <>
          <p className="text-[14px] leading-[21px]">{q.data!.reason}</p>
          <ul className="flex flex-col gap-1.5">
            {q.data!.facts.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-[13px] text-ink-2">
                <ArrowRight className="mt-0.5 size-3.5 shrink-0" /> {f}
              </li>
            ))}
          </ul>
        </>
      )}
      <Button asChild size="sm" className="self-start">
        <Link to="/spectra">Open the Spectra week board</Link>
      </Button>
    </div>
  );
}

export function ExplainDrawer({ item, days, periods, onClose }: { item: GridItem | null; days: string[]; periods?: Period[]; onClose: () => void }) {
  const e = item?.entry;
  const velo = useVelo();
  useVeloFocus(e ? { kind: "session", id: e.session_id } : null, true);
  return (
    <Drawer
      open={!!item}
      onOpenChange={(v) => !v && onClose()}
      wide
      title={item ? (e ? `${e.course_id} ${e.course_title}` : item.booking!.title) : ""}
      description={
        item &&
        (e ? (
          <>
            {e.groups.join(", ")} with {e.faculty_name}. {e.size} students.
          </>
        ) : (
          <>Spectra week booking {item.booking!.request_id}</>
        ))
      }
    >
      <div className="-mx-5 -mt-4 mb-4 flex items-center justify-between border-b-2 border-rule-strong bg-signal px-5 py-3 text-signal-ink">
        <span className="text-[15px] font-extrabold tracking-[0.08em]">WHY HERE?</span>
        <span className="text-[12px] font-bold">From the rule checker</span>
      </div>
      {item && e && (
        <button
          type="button"
          onClick={() => {
            onClose();
            velo.setOpen(true);
          }}
          className="mb-4 inline-flex items-center gap-2 rounded-[4px] border-2 border-rule-strong bg-sheet-2 px-2.5 py-1.5 text-[12.5px] font-bold transition-colors hover:bg-signal-soft"
        >
          <Logo size={22} title="" />
          Ask Velo about {e.course_id}
        </button>
      )}
      {item && (e ? <SessionExplain item={item} days={days} periods={periods} onClose={onClose} /> : <BookingExplain item={item} periods={periods} />)}
    </Drawer>
  );
}
