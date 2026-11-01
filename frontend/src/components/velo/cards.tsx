import { Accessibility, ArrowRight, ArrowUpRight, Check, CircleAlert, Loader2 } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { errorMessage } from "@/api/client";
import { useCancelBooking, useConfirmVeloAction, useRequestChange, useSubmitBooking, useSummary } from "@/api/hooks";
import type { Booking, BookingDraft, BookingSubmit, FreeRoom, Proposal, VeloActionOut, VeloCard } from "@/api/types";
import { Code, KindBullet, Lamp, StatusChip } from "@/components/board/signals";
import { Button } from "@/components/ui/button";
import { bookingStatus, categoryLabel, featureLabel, kindOf, proposalStatus, roomTypeLabel } from "@/lib/format";
import { dayName, periodEnd, periodLabel } from "@/lib/time";
import { cn } from "@/lib/utils";
import { bookText } from "./context";
import { useVelo, type ActionState } from "./VeloProvider";

/* eslint-disable @typescript-eslint/no-explicit-any -- card data comes from the server as a typed dict per kind */
type Data = Record<string, any>;

function Shell({ eyebrow, aside, children, className }: { eyebrow: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-[6px] border-2 border-rule-strong bg-sheet shadow-mount", className)}>
      <div className="flex items-center justify-between gap-2 border-b-2 border-rule-strong px-3 py-2">
        <span className="eyebrow">{eyebrow}</span>
        {aside}
      </div>
      {children}
    </section>
  );
}

function LinkButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 text-[12.5px] font-bold underline-offset-2 hover:underline">
      {children} <ArrowUpRight className="size-3.5" />
    </button>
  );
}

// ---------------------------------------------------------------- confirm, then progress, then result
const RUN_STEPS: Record<string, string[]> = {
  submit: ["Checking the rules", "Sending the request", "Deciding by priority"],
  cancel: ["Cancelling the request", "Freeing the slot", "Deciding the others again"],
  move: ["Checking the move", "Repairing the timetable", "Sending to the Admin"],
  decide: ["Checking it is still waiting", "Recording the decision", "Updating the schedule"],
};

/**
 * Every change Velo offers goes through this: a plain preview of what will happen, Confirm or Not now,
 * the steps while the usual endpoint works, then the result. The state lives in the thread.
 */
function ActionFlow<R>({
  msgId,
  action,
  optionKey,
  label,
  preview,
  steps,
  danger,
  quiet,
  run,
  result,
}: {
  msgId: string;
  action?: ActionState;
  optionKey?: string;
  label: string;
  preview: ReactNode;
  steps: keyof typeof RUN_STEPS;
  danger?: boolean;
  /** one of several options in a list: an outline button, so the list isn't a wall of yellow */
  quiet?: boolean;
  run: () => Promise<R>;
  result: (r: R) => ReactNode;
}) {
  const { setAction } = useVelo();
  const reduce = useReducedMotion();
  const mine = !action || action.key === optionKey;
  const status = mine ? action?.status : undefined;
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (status !== "running") return;
    setStep(0);
    const ids = [700, 1500].map((ms, i) => window.setTimeout(() => setStep(i + 1), ms));
    return () => ids.forEach(clearTimeout);
  }, [status]);

  if (!mine && action && action.status !== "failed") return null;
  if (!status || status === "failed")
    return (
      <div className="flex flex-col gap-2">
        {status === "failed" && (
          <p className="flex items-start gap-1.5 text-[12.5px] font-semibold text-stop">
            <CircleAlert className="mt-px size-4 shrink-0" /> {action?.error}
          </p>
        )}
        <Button size="sm" variant={danger ? "danger" : quiet ? "outline" : "primary"} className={cn("self-start", quiet && "hover:bg-signal")} onClick={() => setAction(msgId, { status: "confirming", key: optionKey })}>
          {label} <ArrowRight />
        </Button>
      </div>
    );
  if (status === "confirming")
    return (
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
        className="flex flex-col gap-2.5 rounded-[4px] border-2 border-dashed border-rule-strong bg-sheet-2 p-3"
      >
        <p className="eyebrow">Before anything changes</p>
        <div className="text-[13px] leading-[19px]">{preview}</div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={danger ? "danger" : "primary"}
            onClick={() => {
              setAction(msgId, { status: "running", key: optionKey });
              run().then(
                (r) => setAction(msgId, { status: "done", key: optionKey, result: r }),
                (e) => setAction(msgId, { status: "failed", key: optionKey, error: errorMessage(e) }),
              );
            }}
          >
            <Check /> Confirm
          </Button>
          <Button size="sm" variant="outline" onClick={() => setAction(msgId, undefined)}>
            Not now
          </Button>
        </div>
      </motion.div>
    );
  if (status === "running")
    return (
      <ol className="flex flex-col gap-1.5" aria-live="polite">
        {RUN_STEPS[steps].map((s, i) => (
          <li key={s} className={cn("flex items-center gap-2 text-[12.5px] font-semibold", i > step ? "text-ink-3" : "text-ink")}>
            <span className={cn("grid size-4 place-items-center rounded-[3px] border-2", i < step ? "border-rule-strong bg-ink text-sheet" : "border-rule-strong")}>
              {i < step ? <Check className="size-3" /> : i === step ? <Loader2 className="size-3 animate-spin" /> : null}
            </span>
            {s}
          </li>
        ))}
      </ol>
    );
  return <div className="flex flex-col gap-2">{result(action!.result as R)}</div>;
}

// ---------------------------------------------------------------- rooms
function RoomsCard({ d }: { d: Data }) {
  const { send } = useVelo();
  const nav = useNavigate();
  const { data: summary } = useSummary();
  const rooms = d.rooms as FreeRoom[];
  const from = periodLabel(d.start, summary?.periods);
  const to = periodEnd(d.end, summary?.periods);
  return (
    <Shell
      eyebrow={`Free ${d.when}${d.week === "spectra" ? " · Spectra week" : d.week === "regular" ? " · Regular week" : ""}`}
      aside={<span className="text-[12px] font-bold text-ink-3">{d.total} found</span>}
    >
      {rooms.length === 0 ? (
        <p className="px-3 py-3 text-[13px] text-ink-2">Nothing fits that slot.</p>
      ) : (
        <ul className="divide-y-2 divide-rule">
          {rooms.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[13.5px] font-black">{r.name}</span>
                  <Code>{r.id}</Code>
                  {r.accessible && <Accessibility className="size-3.5 shrink-0 text-ink-3" aria-label="Step-free" />}
                </div>
                <p className="truncate text-[12px] text-ink-2">
                  {roomTypeLabel(r.type)} · {r.capacity} seats{r.features.length ? ` · ${r.features.map(featureLabel).join(", ")}` : ""}
                </p>
              </div>
              {d.bookable !== false && (
                <Button size="sm" variant="outline" className="hover:bg-signal" aria-label={`Book ${r.name}`} onClick={() => send(bookText(r.id, dayName(d.day), from, to, d.people, d.week))}>
                  Book
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="border-t-2 border-rule px-3 py-2">
        <LinkButton onClick={() => nav("/rooms")}>Open Find a room</LinkButton>
      </div>
    </Shell>
  );
}

// ---------------------------------------------------------------- booking draft and preview
function DraftRows({ draft, guessed, question }: { draft: Data; guessed: string[]; question?: string | null }) {
  const { data: summary } = useSummary();
  const w = (draft.windows ?? [])[0];
  const rows: [string, string | null, string][] = [
    ["Event", draft.title && draft.title !== "Venue request" ? draft.title : null, "title"],
    ["When", w ? `${dayName(w.day)} ${periodLabel(w.from_period, summary?.periods)}–${periodEnd(w.to_period, summary?.periods)}` : null, "windows"],
    ["People", draft.attendance ? String(draft.attendance) : null, "attendance"],
    ["Length", draft.duration_periods ? `${draft.duration_periods} hour${draft.duration_periods > 1 ? "s" : ""}` : null, "duration_periods"],
    ["Room", draft.requested_room ?? (draft.room_types?.length ? draft.room_types.map(roomTypeLabel).join(", ") : null), "room_types"],
    ["Needs", draft.needs?.length ? draft.needs.map(featureLabel).join(", ") : "Nothing special", "needs"],
  ];
  return (
    <dl className="grid grid-cols-[72px_minmax(0,1fr)] gap-x-3 gap-y-1.5 px-3 py-2.5 text-[13px]">
      {rows.map(([label, value, key]) => (
        <div key={label} className="contents">
          <dt className="text-ink-3">{label}</dt>
          <dd className="min-w-0">
            {value ? (
              <span className={cn("font-semibold", guessed.includes(key) && "border-b-2 border-dashed border-ink-3")} title={guessed.includes(key) ? "Guessed from your message" : undefined}>
                {value}
              </span>
            ) : (
              <span className="rounded-[3px] border-2 border-dashed border-rule-strong px-1.5 text-[11.5px] font-bold uppercase tracking-[0.06em]">
                {question && key !== "title" ? "Needed" : "Not given"}
              </span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function DraftCard({ d }: { d: Data }) {
  const nav = useNavigate();
  return (
    <Shell eyebrow="Booking draft" aside={<span className="text-[12px] font-bold text-ink-3">Not sent</span>}>
      <DraftRows draft={d.draft} guessed={d.guessed} question={d.question} />
      <div className="border-t-2 border-rule px-3 py-2">
        <LinkButton onClick={() => nav("/book", { state: { draft: d.draft, guessed: d.guessed } })}>Open in the form</LinkButton>
      </div>
    </Shell>
  );
}

const VERDICT: Record<string, [string, "clear" | "caution" | "stop" | "wait"]> = {
  approved: ["Would be approved", "clear"],
  pending_approval: ["Fits; an approver confirms", "wait"],
  alternative_offered: ["Another slot would be offered", "caution"],
  rejected: ["Would be rejected", "stop"],
};

function PreviewCard({ d, msgId, action }: { d: Data; msgId: string; action?: ActionState }) {
  const nav = useNavigate();
  const submit = useSubmitBooking();
  const chk = d.check;
  const place = chk.placement ?? {};
  const [label, aspect] = chk.valid ? (VERDICT[place.status] ?? ["Checked", "wait"]) : (["Can't be sent as it is", "stop"] as const);
  return (
    <Shell eyebrow="Rule checker, right now" aside={<Lamp aspect={aspect} />}>
      <div className="flex flex-col gap-1 px-3 pt-2.5">
        <p className="text-[13px] font-bold">{label}</p>
        {place.room_id && place.when && (
          <p className="text-[18px] font-black leading-6 [font-stretch:104%]">
            {place.room_id} <span className="font-semibold text-ink-2">· {place.when}</span>
          </p>
        )}
        <p className="text-[12px] text-ink-3">
          Counts as {categoryLabel(chk.category).toLowerCase()}
          {chk.category_note ? `. ${chk.category_note}` : ""}
        </p>
        {chk.violations?.length > 0 && (
          <ul className="mt-1 flex flex-col gap-1">
            {chk.violations.map((v: string) => (
              <li key={v} className="flex items-start gap-1.5 text-[12.5px] text-ink">
                <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-stop" /> {v}
              </li>
            ))}
          </ul>
        )}
      </div>
      <DraftRows draft={d.draft} guessed={d.guessed} />
      {chk.alternatives?.length > 0 && (
        <div className="mx-3 mb-2.5 rounded-[4px] bg-sheet-2 px-2.5 py-2">
          <p className="eyebrow mb-1">Also free</p>
          <ul className="flex flex-col gap-0.5 text-[12.5px]">
            {chk.alternatives.map((a: Data) => (
              <li key={`${a.room_id}-${a.day}-${a.start_period}`}>
                <b className="font-bold">{a.room_id}</b> · {a.when}
              </li>
            ))}
          </ul>
        </div>
      )}
      {chk.valid && (
        <div className="border-t-2 border-rule px-3 py-2.5">
          <ActionFlow<BookingSubmit>
            msgId={msgId}
            action={action}
            label="Send request"
            steps="submit"
            preview={
              <>
                Send {d.draft.title === "Venue request" ? "a venue request" : <b>{d.draft.title}</b>} for {d.draft.attendance} people
                {place.room_id && place.when ? (
                  <>
                    {" "}
                    in <b>{place.room_id}</b>, {place.when}
                  </>
                ) : null}
                . The code decides it by priority against every other request{place.status === "pending_approval" ? ", then an approver confirms" : ""}. You can cancel it later.
              </>
            }
            run={() => submit.mutateAsync(d.draft as BookingDraft)}
            result={(r) => (
              <>
                {r.bookings.map((b: Booking) => (
                  <div key={b.id} className="flex flex-wrap items-center gap-2 text-[13px]">
                    <Code>{b.id}</Code>
                    <StatusChip aspect={bookingStatus(b.status).aspect}>{bookingStatus(b.status).label}</StatusChip>
                    <span className="w-full text-[12.5px] text-ink-2">{b.reason}</span>
                  </div>
                ))}
                <LinkButton onClick={() => nav(`/book?request=${encodeURIComponent(r.bookings[0]?.id ?? "")}`)}>See it in Book a venue</LinkButton>
              </>
            )}
          />
        </div>
      )}
      <div className="border-t-2 border-rule px-3 py-2">
        <LinkButton onClick={() => nav("/book", { state: { draft: d.draft, guessed: d.guessed } })}>Open in the form</LinkButton>
      </div>
    </Shell>
  );
}

// ---------------------------------------------------------------- requests and cancelling
function RequestRow({ r, actions = true }: { r: Data; actions?: boolean }) {
  const { send } = useVelo();
  const nav = useNavigate();
  const s = bookingStatus(r.status);
  return (
    <li className="flex flex-col gap-1 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Code>{r.id}</Code>
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold">{r.title}</span>
        <StatusChip aspect={s.aspect}>{s.label}</StatusChip>
      </div>
      {(r.when || r.room) && <p className="text-[12.5px] font-semibold">{[r.room, r.when].filter(Boolean).join(" · ")}</p>}
      {r.reason && <p className="line-clamp-2 text-[12px] text-ink-2">{r.reason}</p>}
      {actions && (
        <div className="flex gap-3">
          <LinkButton onClick={() => nav(`/book?request=${encodeURIComponent(r.id)}`)}>Open</LinkButton>
          {r.can_cancel && (
            <button type="button" className="text-[12.5px] font-bold text-stop underline-offset-2 hover:underline" onClick={() => send(`Cancel ${r.id}`)}>
              Cancel…
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function RequestsCard({ d }: { d: Data }) {
  return (
    <Shell eyebrow="Your requests">
      <ul className="divide-y-2 divide-rule">
        {(d.items as Data[]).map((r) => (
          <RequestRow key={r.id} r={r} />
        ))}
      </ul>
    </Shell>
  );
}

function CancelCard({ d, msgId, action }: { d: Data; msgId: string; action?: ActionState }) {
  const cancel = useCancelBooking();
  const r = d.request;
  return (
    <Shell eyebrow="Cancel a request" aside={<Lamp aspect="stop" />}>
      <ul>
        <RequestRow r={r} actions={false} />
      </ul>
      <div className="border-t-2 border-rule px-3 py-2.5">
        <ActionFlow<Booking>
          msgId={msgId}
          action={action}
          danger
          label="Cancel request"
          steps="cancel"
          preview={
            <>
              Cancel <b>{r.id}</b>, {r.title}? Its slot is freed and the other requests are decided again. This can't be undone.
            </>
          }
          run={() => cancel.mutateAsync(r.id)}
          result={(b) => (
            <div className="flex items-center gap-2 text-[13px]">
              <Code>{b.id}</Code>
              <StatusChip aspect="off">Cancelled</StatusChip>
              <span className="text-[12.5px] text-ink-2">The slot is free again.</span>
            </div>
          )}
        />
      </div>
    </Shell>
  );
}

// ---------------------------------------------------------------- timetable
function SessionHead({ d }: { d: Data }) {
  return (
    <div className="flex items-start gap-2.5 px-3 pt-2.5">
      <KindBullet kind={kindOf(d.kind)} />
      <div className="min-w-0">
        <p className="text-[14px] font-black leading-5">
          {d.course_id} <span className="font-semibold text-ink-2">{d.title}</span>
        </p>
        <p className="text-[12.5px] text-ink-2">
          <b className="font-bold text-ink">
            {d.when} · {d.room}
          </b>{" "}
          · {d.groups.join(", ")} · {d.faculty}
        </p>
      </div>
    </div>
  );
}

function ExplainCard({ d }: { d: Data }) {
  const { send } = useVelo();
  const nav = useNavigate();
  return (
    <Shell eyebrow="Why it's here" aside={<span className="text-[12px] font-bold text-ink-3">{d.blocked} of {d.total} slots blocked</span>}>
      <SessionHead d={d} />
      <ul className="flex flex-col gap-1.5 px-3 py-2.5">
        {(d.facts as string[]).map((f) => (
          <li key={f} className="flex items-start gap-2 text-[12.5px] leading-[18px]">
            <Check className="mt-0.5 size-3.5 shrink-0 text-clear" /> {f}
          </li>
        ))}
      </ul>
      {d.options.length > 0 && (
        <div className="mx-3 mb-2.5 rounded-[4px] bg-sheet-2 px-2.5 py-2">
          <p className="eyebrow mb-1">Best other slots</p>
          <ul className="flex flex-col gap-0.5 text-[12.5px]">
            {(d.options as Data[]).map((o) => (
              <li key={`${o.day}-${o.start}`}>
                <b className="font-bold">{o.when}</b> · {o.room} · {o.soft_delta > 0 ? `+${o.soft_delta}` : o.soft_delta} soft
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t-2 border-rule px-3 py-2">
        <LinkButton onClick={() => send("Find another slot", { kind: "session", id: d.session_id })}>Other slots</LinkButton>
        <LinkButton onClick={() => nav("/timetable")}>Open the timetable</LinkButton>
      </div>
    </Shell>
  );
}

function AlternativesCard({ d, msgId, action }: { d: Data; msgId: string; action?: ActionState }) {
  const nav = useNavigate();
  const move = useRequestChange();
  const options = d.options as Data[];
  return (
    <Shell eyebrow="Other valid slots" aside={<span className="text-[12px] font-bold text-ink-3">cheapest first</span>}>
      <SessionHead d={d} />
      {options.length === 0 ? (
        <p className="px-3 py-2.5 text-[13px] text-ink-2">No other slot keeps every hard rule right now.</p>
      ) : (
        <ul className="mt-2 divide-y-2 divide-rule border-t-2 border-rule">
          {options.map((o) => {
            const key = `${o.day}-${o.start}-${o.room}`;
            return (
              <li key={key} className="flex flex-col gap-2 px-3 py-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[13.5px] font-black">{o.when}</span>
                  <span className="text-[12px] font-bold text-ink-2">
                    {o.room} · {o.soft_delta > 0 ? `+${o.soft_delta}` : o.soft_delta} soft
                  </span>
                </div>
                {d.can_move && (
                  <ActionFlow<Proposal>
                    msgId={msgId}
                    action={action}
                    optionKey={key}
                    quiet
                    label="Ask to move here"
                    steps="move"
                    preview={
                      <>
                        Ask the Admin to move <b>{d.course_id}</b> to <b>{o.when}</b> in {o.room}. The solver repairs the week around it and it becomes a proposal; nothing moves until the Admin approves.
                      </>
                    }
                    run={() => move.mutateAsync({ type: "move_session", session_id: d.session_id, target: { day: o.day, start: o.start, room: o.room }, reason: "Asked through Velo", days: [], periods: [] })}
                    result={(p) => (
                      <>
                        <p className="text-[13px]">
                          <b>Proposal #{p.id}</b>: moves {p.moved} session{p.moved === 1 ? "" : "s"}, soft penalty {p.soft_before} → {p.soft_after}.{" "}
                          <StatusChip aspect={proposalStatus(p.status).aspect}>{proposalStatus(p.status).label}</StatusChip>
                        </p>
                        <LinkButton onClick={() => nav(`/changes/${p.id}`)}>Open the proposal</LinkButton>
                      </>
                    )}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!d.can_move && options.length > 0 && <p className="border-t-2 border-rule px-3 py-2 text-[12px] text-ink-3">Only the class's faculty, its department coordinator or the Admin can ask for a move.</p>}
    </Shell>
  );
}

// ---------------------------------------------------------------- approvals and proposals
function ApprovalsCard({ d }: { d: Data }) {
  const nav = useNavigate();
  return (
    <Shell eyebrow={d.mine ? "Yours, waiting on an approver" : "Waiting for you"} aside={<span className="text-[12px] font-bold text-ink-3">{d.total}</span>}>
      <ul className="divide-y-2 divide-rule">
        {(d.items as Data[]).map((p) => (
          <li key={p.kind + p.id}>
            <button type="button" onClick={() => nav(p.kind === "change" ? `/changes/${p.id}` : d.mine ? `/book?request=${p.id}` : "/approvals")} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-sheet-2">
              <Code tone="signal">{p.kind === "change" ? `#${p.id}` : p.id}</Code>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-bold">{p.title}</span>
                <span className="block truncate text-[12px] text-ink-3">
                  {p.kind === "change" ? "Timetable change" : "Venue booking"} from {p.requested_by}
                </span>
              </span>
              <ArrowRight className="size-4 shrink-0 text-ink-3" />
            </button>
          </li>
        ))}
      </ul>
      {!d.mine && d.total > 0 && (
        <div className="border-t-2 border-rule px-3 py-2">
          <LinkButton onClick={() => nav("/approvals")}>Open approvals</LinkButton>
        </div>
      )}
    </Shell>
  );
}

function ProposalsCard({ d }: { d: Data }) {
  const nav = useNavigate();
  return (
    <Shell eyebrow={d.detail ? "Change proposal" : "Change proposals"}>
      <ul className="divide-y-2 divide-rule">
        {(d.items as Data[]).map((p) => {
          const s = proposalStatus(p.status);
          return (
            <li key={p.id}>
              <button type="button" onClick={() => nav(`/changes/${p.id}`)} className="flex w-full flex-col gap-1.5 px-3 py-2.5 text-left hover:bg-sheet-2">
                <span className="flex w-full items-center gap-2">
                  <Code>#{p.id}</Code>
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold">{p.title}</span>
                  <StatusChip aspect={s.aspect}>{s.label}</StatusChip>
                </span>
                {p.status !== "infeasible" && (
                  <span className="grid grid-cols-3 gap-2">
                    {[
                      ["Moved", p.moved],
                      ["Soft", `${p.soft_before} → ${p.soft_after}`],
                      ["Minimal", p.proven_minimal ? "Proven" : "Best found"],
                    ].map(([k, v]) => (
                      <span key={k} className="inset-tile px-2 py-1.5">
                        <span className="eyebrow block">{k}</span>
                        <span className="block text-[14px] font-black">{v}</span>
                      </span>
                    ))}
                  </span>
                )}
                {p.stale && <span className="text-[12px] font-semibold text-stop">The timetable changed since; it needs re-checking.</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </Shell>
  );
}

// ---------------------------------------------------------------- the agent's data cards
function TableCard({ d }: { d: Data }) {
  const [all, setAll] = useState(false);
  const rows = d.rows as Data[];
  const cols = d.columns as { key: string; label: string }[];
  const shown = all ? rows : rows.slice(0, 10);
  return (
    <Shell eyebrow={d.title} aside={d.subtitle ? <span className="text-[12px] font-bold text-ink-3">{d.subtitle}</span> : undefined}>
      {rows.length === 0 ? (
        <p className="px-3 py-3 text-[13px] text-ink-2">Nothing here.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-left text-[12.5px]">
            <thead>
              <tr className="border-b-2 border-rule">
                {cols.map((c) => (
                  <th key={c.key} scope="col" className="eyebrow whitespace-nowrap px-3 py-1.5 font-black">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-rule">
              {shown.map((r, i) => (
                <tr key={i}>
                  {cols.map((c, j) => (
                    <td key={c.key} className={cn("px-3 py-1.5 align-top", j === 0 ? "whitespace-nowrap font-bold" : "text-ink-2", c.key === "course" && "font-bold text-ink")}>
                      {String(r[c.key] ?? "—")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > 10 && (
        <div className="border-t-2 border-rule px-3 py-2">
          <button type="button" onClick={() => setAll(!all)} className="text-[12.5px] font-bold underline-offset-2 hover:underline">
            {all ? "Show fewer" : `Show all ${rows.length}`}
          </button>
        </div>
      )}
    </Shell>
  );
}

function BarsCard({ d }: { d: Data }) {
  const reduce = useReducedMotion();
  const items = d.items as { label: string; value: number; max: number; sub?: string }[];
  return (
    <Shell eyebrow={d.title} aside={d.note ? <span className="text-[12px] font-bold text-ink-3">{d.note}</span> : undefined}>
      <ul className="flex flex-col gap-2.5 px-3 py-3">
        {items.map((it, i) => (
          <li key={it.label} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
              <span className="truncate font-bold">{it.label}</span>
              <span className="shrink-0 font-mono font-bold tabular-nums">
                {it.value}
                {d.unit === "%" ? "%" : ` ${d.unit}`}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-[3px] border-2 border-rule-strong bg-sheet-2">
              <motion.div
                className="h-full bg-signal"
                initial={reduce ? false : { width: 0 }}
                animate={{ width: `${Math.min(100, (100 * it.value) / Math.max(it.max, 1))}%` }}
                transition={{ duration: 0.4, delay: reduce ? 0 : i * 0.03, ease: [0.23, 1, 0.32, 1] }}
              />
            </div>
            {it.sub && <span className="text-[11.5px] text-ink-3">{it.sub}</span>}
          </li>
        ))}
      </ul>
    </Shell>
  );
}

function StatsCard({ d }: { d: Data }) {
  return (
    <Shell eyebrow={d.title}>
      <dl className="divide-y-2 divide-rule">
        {(d.items as { label: string; value: string }[]).map((it, i) => (
          <div key={`${it.label}-${i}`} className="grid grid-cols-[minmax(0,9.5rem)_1fr] gap-3 px-3 py-1.5 text-[12.5px]">
            <dt className="font-bold text-ink-2">{it.label}</dt>
            <dd className="font-semibold">{it.value}</dd>
          </div>
        ))}
      </dl>
    </Shell>
  );
}

const CELL: Record<string, string> = {
  free: "bg-sheet",
  class: "bg-k-lecture-tint",
  booked: "bg-k-event-tint",
  pending: "bg-caution-soft",
  closed: "bg-stop-soft",
};
const CELL_LABEL: Record<string, string> = { free: "Free", class: "Class", booked: "Booked", pending: "Pending", closed: "Closed" };

type Period = { period: number; time: string; state: string; label: string };

/** Neighbouring periods with the same thing in them, as one row ("08:00–11:00 Free"). */
function runs(periods: Period[]): { from: Period; to: Period }[] {
  const out: { from: Period; to: Period }[] = [];
  for (const p of periods) {
    const last = out[out.length - 1];
    if (last && last.to.state === p.state && last.to.label === p.label && last.to.period + 1 === p.period) last.to = p;
    else out.push({ from: p, to: p });
  }
  return out;
}

function OccupancyCard({ d }: { d: Data }) {
  const periods = d.periods as Period[];
  const free = periods.filter((p) => p.state === "free").length;
  return (
    <Shell eyebrow={`${d.room} · ${d.day_label}${d.week === "spectra" ? " · Spectra week" : ""}`} aside={<span className="text-[12px] font-bold text-ink-3">{free} free</span>}>
      <div className="flex gap-1 px-3 pt-3" aria-hidden>
        {periods.map((p) => (
          <span key={p.period} title={`P${p.period} ${CELL_LABEL[p.state]}`} className={cn("h-5 flex-1 rounded-[3px] border-2 border-rule-strong", CELL[p.state])} />
        ))}
      </div>
      <ul className="divide-y-2 divide-rule pt-2">
        {runs(periods).map((r) => (
          <li key={r.from.period} className="flex items-center gap-3 px-3 py-1.5 text-[12.5px]">
            <span className="w-[5.5rem] shrink-0 font-mono text-[11.5px] text-ink-2">
              {r.from.time.split("–")[0]}–{r.to.time.split("–")[1]}
            </span>
            <span className={cn("shrink-0 rounded-[3px] border-2 border-rule-strong px-1.5 text-[11px] font-black", CELL[r.from.state])}>{CELL_LABEL[r.from.state]}</span>
            <span className="truncate text-ink-2">{r.from.label}</span>
          </li>
        ))}
      </ul>
      <p className="border-t-2 border-rule px-3 py-2 text-[11.5px] text-ink-3">Scheduled from the timetable and bookings, not live occupancy.</p>
    </Shell>
  );
}

function CompareCard({ d }: { d: Data }) {
  const rows = d.rows as Data[];
  const ok = d.status !== "infeasible";
  return (
    <Shell eyebrow={d.title} aside={<StatusChip aspect={ok ? "clear" : "stop"}>{ok ? `${d.moved} moved` : "No valid fix"}</StatusChip>}>
      {ok ? (
        <>
          <ul className="divide-y-2 divide-rule">
            {rows.slice(0, 12).map((r) => (
              <li key={r.session} className="flex flex-col gap-0.5 px-3 py-2 text-[12.5px]">
                <span className="font-bold">
                  {r.course} <span className="font-normal text-ink-3">· {r.groups}</span>
                </span>
                <span className="flex flex-wrap items-center gap-1.5 font-mono text-[11.5px]">
                  <span className="text-ink-3 line-through decoration-ink-3/60">{r.before}</span>
                  <ArrowRight className="size-3.5 text-ink-3" />
                  <span className="font-bold">{r.after}</span>
                </span>
              </li>
            ))}
            {rows.length === 0 && <li className="px-3 py-2.5 text-[12.5px] text-ink-2">Nothing has to move.</li>}
          </ul>
          <p className="border-t-2 border-rule px-3 py-2 text-[12px] text-ink-2">
            Soft penalty {d.soft_before} → {d.soft_after ?? "—"}
            {d.proven_minimal ? " · fewest possible moves, proven" : ""}. Every hard rule passes.
          </p>
        </>
      ) : (
        <ul className="flex flex-col gap-1 px-3 py-2.5 text-[12.5px]">
          {(d.conflicts as { text: string }[]).map((c, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-stop" /> {c.text}
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}

const ACTION_STEPS: Record<string, keyof typeof RUN_STEPS> = {
  submit_booking: "submit",
  cancel_booking: "cancel",
  create_change_proposal: "move",
  decide_request: "decide",
};

/** A change the agent prepared on the server. Confirm runs it once there, with the usual checks. */
function AgentActionCard({ d, msgId, action }: { d: Data; msgId: string; action?: ActionState }) {
  const confirm = useConfirmVeloAction();
  const lines = d.lines as { label: string; value: string }[];
  const warnings = d.warnings as string[];
  const danger = d.tool === "cancel_booking" || (d.tool === "decide_request" && /reject/i.test(d.confirm));
  return (
    <Shell eyebrow={d.title} aside={<Lamp aspect={danger ? "stop" : "caution"} />}>
      <dl className="divide-y-2 divide-rule">
        {lines.map((l) => (
          <div key={l.label} className="grid grid-cols-[6.5rem_1fr] gap-3 px-3 py-1.5 text-[12.5px]">
            <dt className="font-bold text-ink-2">{l.label}</dt>
            <dd className="font-semibold">{l.value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-col gap-2 border-t-2 border-rule px-3 py-2.5">
        {warnings.map((w) => (
          <p key={w} className="flex items-start gap-1.5 text-[12px] text-ink-2">
            <CircleAlert className="mt-px size-3.5 shrink-0" /> {w}
          </p>
        ))}
        <ActionFlow<VeloActionOut>
          msgId={msgId}
          action={action}
          danger={danger}
          label={d.confirm}
          steps={ACTION_STEPS[d.tool] ?? "submit"}
          preview={<>{d.title} Nothing has changed yet; this runs once, with the same checks as the page.</>}
          run={() => confirm.mutateAsync(d.id)}
          result={(r) => (
            <div className="flex items-center gap-2 text-[13px]">
              <StatusChip aspect="clear">Done</StatusChip>
              <span className="text-[12.5px] text-ink-2">{String(r.result?.message ?? "")}</span>
            </div>
          )}
        />
      </div>
    </Shell>
  );
}

// ---------------------------------------------------------------- navigation and help
function NavigateCard({ d }: { d: Data }) {
  const nav = useNavigate();
  return (
    <button type="button" onClick={() => nav(d.path)} className="press flex items-center justify-between gap-3 rounded-[6px] border-2 border-rule-strong bg-sheet px-3 py-2.5 text-left shadow-mount">
      <span>
        <span className="eyebrow block">Opened</span>
        <span className="text-[14px] font-black">{d.label}</span>
      </span>
      <ArrowUpRight className="size-4" />
    </button>
  );
}

function HelpCard({ d }: { d: Data }) {
  const { send } = useVelo();
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {(d.items as Data[]).map((c) => (
        <button key={c.label} type="button" onClick={() => send(c.example)} className="press rounded-[6px] border-2 border-rule-strong bg-sheet px-3 py-2.5 text-left shadow-mount">
          <span className="block text-[13px] font-black">{c.label}</span>
          <span className="block truncate text-[12px] text-ink-2">“{c.example}”</span>
        </button>
      ))}
    </div>
  );
}

export function VeloCards({ cards, msgId, action }: { cards: VeloCard[]; msgId: string; action?: ActionState }) {
  return (
    <>
      {cards.map((c, i) => {
        const d = c.data as Data;
        const k = `${c.kind}-${i}`;
        switch (c.kind) {
          case "rooms":
            return <RoomsCard key={k} d={d} />;
          case "draft":
            return <DraftCard key={k} d={d} />;
          case "preview":
            return <PreviewCard key={k} d={d} msgId={msgId} action={action} />;
          case "requests":
            return <RequestsCard key={k} d={d} />;
          case "confirm_cancel":
            return <CancelCard key={k} d={d} msgId={msgId} action={action} />;
          case "explain":
            return <ExplainCard key={k} d={d} />;
          case "alternatives":
            return <AlternativesCard key={k} d={d} msgId={msgId} action={action} />;
          case "approvals":
            return <ApprovalsCard key={k} d={d} />;
          case "proposals":
            return <ProposalsCard key={k} d={d} />;
          case "navigate":
            return <NavigateCard key={k} d={d} />;
          case "help":
            return <HelpCard key={k} d={d} />;
          case "table":
            return <TableCard key={k} d={d} />;
          case "bars":
            return <BarsCard key={k} d={d} />;
          case "stats":
            return <StatsCard key={k} d={d} />;
          case "occupancy":
            return <OccupancyCard key={k} d={d} />;
          case "compare":
            return <CompareCard key={k} d={d} />;
          case "action":
            return <AgentActionCard key={k} d={d} msgId={msgId} action={action} />;
          default:
            return null;
        }
      })}
    </>
  );
}

