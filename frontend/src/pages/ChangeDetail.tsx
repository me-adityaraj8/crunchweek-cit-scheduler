import { ArrowLeft, Check, CircleSlash, Loader2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";
import { ApiError, errorMessage } from "@/api/client";
import { useApproveChange, useChange, useRejectChange, useSummary } from "@/api/hooks";
import type { Proposal, Summary } from "@/api/types";
import { Code, Stamp, StatusChip } from "@/components/board/signals";
import { DiffView, MoveBoard } from "@/components/changes/DiffView";
import { ErrorState, Loading, PageHeader, RuleList, SectionTitle } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { useUser } from "@/lib/auth";
import { PROPOSAL_KIND, proposalStatus } from "@/lib/format";
import { dayShort, periodLabel } from "@/lib/time";
import { cn, fmtDateTime, plural } from "@/lib/utils";

function daysText(days: string[], all: string[]) {
  return days.length === all.length ? "every day" : days.map(dayShort).join(", ");
}

function periodsText(ps: number[]) {
  const s = [...ps].sort((a, b) => a - b);
  if (s.length > 1 && s[s.length - 1] - s[0] === s.length - 1) return s[0] === 1 && s[s.length - 1] >= 9 ? "all day" : `P${s[0]}–P${s[s.length - 1]}`;
  return s.map((p) => `P${p}`).join(", ");
}

/** The change file (or request) in words. */
function WhatChanged({ p, summary }: { p: Proposal; summary?: Summary }) {
  const all = summary?.days ?? [];
  const changes = (p.payload.changes as Record<string, unknown>[] | undefined) ?? [];
  const move = p.payload.move as { session_id: string; day: string; start_period: number; room_id: string } | undefined;
  const lines: { tag: string; text: string }[] = [];
  for (const c of changes) {
    const t = String(c.type);
    if (t === "faculty_unavailable")
      lines.push({ tag: "Faculty away", text: `${c.faculty_id} can't teach ${daysText(c.days as string[], all)}, ${periodsText(c.periods as number[])}. ${c.reason ?? ""}` });
    else if (t === "room_unavailable")
      lines.push({ tag: "Room closed", text: `${c.room_id} is closed ${daysText(c.days as string[], all)}, ${periodsText(c.periods as number[])}. ${c.reason ?? ""}` });
    else if (t === "add_session") {
      const s = c.session as { id: string; course_id: string; kind: string; groups: string[]; duration: number; faculty_id: string };
      lines.push({ tag: "New session", text: `${s.id}: ${s.course_id} ${s.kind} for ${s.groups.join(", ")}, ${plural(s.duration, "period")}, taught by ${s.faculty_id}.` });
    } else if (t === "remove_session") lines.push({ tag: "Session dropped", text: `${c.session_id} is removed from the timetable.` });
    else if (t === "add_faculty") {
      const f = c.faculty as { id: string; name: string };
      lines.push({ tag: "New faculty", text: `${f.id} ${f.name} joins.` });
    } else lines.push({ tag: t.replace(/_/g, " "), text: JSON.stringify(c) });
  }
  if (move) lines.push({ tag: "Move", text: `${move.session_id} to ${dayShort(move.day)} ${periodLabel(move.start_period, summary?.periods)} in ${move.room_id}.${p.payload.reason ? ` ${p.payload.reason}` : ""}` });
  return (
    <section className="sheet p-4 sm:p-5">
      <SectionTitle>What changed</SectionTitle>
      <ul className="flex flex-col gap-2">
        {lines.map((l, i) => (
          <li key={i} className="flex items-start gap-3 text-[13.5px] leading-[20px]">
            <span className="mt-px inline-flex h-5 shrink-0 items-center rounded-[4px] bg-anthracite px-1.5 text-[11px] font-bold text-on-anthracite [font-stretch:80%]">{l.tag}</span>
            <span>{l.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The repair in numbers. Each figure is a separate plate so nothing hides in a sentence. */
function Figures({ p }: { p: Proposal }) {
  const items: [string, string | number, boolean?][] = [
    ["Sessions moved", p.moved, true],
    ["New time", p.time_changed],
    ["Room only", p.room_only],
    ["Added", p.added],
    ["Removed", p.removed],
    ["Hard violations", p.status === "infeasible" ? "—" : p.hard_count],
    ["Soft penalty", p.status === "infeasible" ? "—" : `${p.soft_before} → ${p.soft_after}`],
  ];
  return (
    <div className="flex flex-col gap-2">
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-rule bg-rule sm:grid-cols-4 lg:grid-cols-7">
        {items.map(([label, value, strong]) => (
          <div key={label} className={cn("flex flex-col gap-0.5 bg-sheet px-4 py-3", strong && "bg-signal text-signal-ink")}>
            <dt className={cn("text-[12px]", strong ? "font-semibold" : "text-ink-2")}>{label}</dt>
            <dd className="text-[20px] font-bold tabular-nums leading-6">{value}</dd>
          </div>
        ))}
      </dl>
      {p.status !== "infeasible" && (
        <p className="flex items-center gap-2 text-[12.5px] text-ink-2">
          {p.proven_minimal ? (
            <>
              <Check className="size-4 text-clear" /> Minimal, proven: the solver showed no valid fix moves fewer sessions.
            </>
          ) : (
            "The fewest moves the solver found in its time limit."
          )}
        </p>
      )}
    </div>
  );
}

export default function ChangeDetail() {
  const { id } = useParams();
  const user = useUser();
  const { data: summary } = useSummary();
  const q = useChange(Number(id));
  const approve = useApproveChange();
  const reject = useRejectChange();
  const [note, setNote] = useState("");
  const [stamp, setStamp] = useState<"clear" | "stop" | null>(null);

  if (q.isLoading) return <Loading rows={8} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const p = q.data!;
  const s = proposalStatus(p.status);

  const decide = (ok: boolean) =>
    (ok ? approve : reject).mutate(
      { id: p.id, note },
      {
        onSuccess: () => {
          setStamp(ok ? "clear" : "stop");
          toast.success(ok ? "Change applied" : "Change rejected", {
            description: ok ? `The timetable now has the ${plural(p.moved, "move")}. Everyone sees it.` : "Nothing in the timetable changed.",
          });
        },
        onError: (e) =>
          toast.error(e instanceof ApiError && e.status === 409 ? "This proposal is out of date" : "Couldn't record the decision", {
            description: errorMessage(e),
          }),
      },
    );

  return (
    <div className="flex flex-col gap-6">
      <Link to="/changes" className="-mb-2 inline-flex items-center gap-1.5 self-start text-[13px] font-semibold text-ink-2 hover:text-ink">
        <ArrowLeft className="size-4" /> All changes
      </Link>
      <div className="relative">
        <PageHeader
          title={p.title}
          lede={`${PROPOSAL_KIND[p.kind] ?? p.kind} from ${p.requested_by_name}, ${fmtDateTime(p.created_at)}.${p.decided_by_name ? ` ${s.label} by ${p.decided_by_name}${p.decided_at ? `, ${fmtDateTime(p.decided_at)}` : ""}.` : ""}${p.decision_note ? ` Note: ${p.decision_note}` : ""}`}
          actions={<StatusChip aspect={s.aspect}>{s.label}</StatusChip>}
        />
        <AnimatePresence>
          {stamp && (
            <motion.div className="pointer-events-none absolute right-4 top-0 sm:right-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Stamp tone={stamp} className="bg-sheet/80 text-[18px]">
                {stamp === "clear" ? "Applied" : "Rejected"}
                <span className="text-[10px] tracking-[0.14em]">{new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              </Stamp>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {p.stale && (
        <div className="flex items-start gap-3 rounded-[10px] border border-stop/40 bg-stop-soft p-4 text-[13.5px]" role="alert">
          <CircleSlash className="mt-0.5 size-4 shrink-0 text-stop" />
          <p>This proposal is out of date: the timetable changed after it was made, so it can't be applied. Make the change again to get a fresh proposal.</p>
        </div>
      )}

      <Figures p={p} />
      <WhatChanged p={p} summary={summary} />

      {p.status === "infeasible" ? (
        <section className="sheet border-stop/50 p-4 sm:p-5" role="alert">
          <SectionTitle>Why there's no valid fix</SectionTitle>
          <p className="-mt-2 mb-3 text-[13px] text-ink-2">
            The repair solver couldn't find any timetable that keeps every hard rule with this change. These constraints can't all hold at once:
          </p>
          <RuleList items={p.conflicts} />
          {p.alternatives.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-2 text-[13.5px] font-bold">Slots that would work instead</h3>
              <div className="flex flex-wrap gap-2">
                {p.alternatives.map((a, i) => (
                  <span key={i} className="inline-flex h-8 items-center gap-2 rounded-[7px] border border-rule-strong px-2.5 text-[13px] font-semibold">
                    <Code>{a.room}</Code> {dayShort(a.day)} {periodLabel(a.start, summary?.periods)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>
      ) : (
        <>
          {p.conflicts.length > 0 && (
            <section className="sheet border-signal-edge p-4 sm:p-5">
              <SectionTitle>Spectra week bookings this affects</SectionTitle>
              <p className="-mt-2 mb-3 text-[13px] text-ink-2">Bookings are re-decided on the new timetable. These come out differently:</p>
              <RuleList items={p.conflicts} />
            </section>
          )}
          {p.diff.length > 0 && <DiffView p={p} />}
          {p.diff.length > 0 && <MoveBoard p={p} />}
        </>
      )}

      {p.can_approve && !stamp && (
        <section className="sheet flex flex-col gap-3 p-4 sm:p-5">
          <SectionTitle>Your decision</SectionTitle>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note for the requester" maxLength={500} className="min-h-16" />
          <div className="flex flex-wrap gap-2">
            <Button variant="clear" size="lg" onClick={() => decide(true)} disabled={approve.isPending || reject.isPending}>
              {approve.isPending ? <Loader2 className="animate-spin" /> : <Check />} Apply this change
            </Button>
            <Button variant="outline" size="lg" onClick={() => decide(false)} disabled={approve.isPending || reject.isPending}>
              {reject.isPending ? <Loader2 className="animate-spin" /> : <X />} Reject
            </Button>
          </div>
          <p className="text-[12.5px] text-ink-2">Applying re-checks every hard rule against the live timetable first.</p>
        </section>
      )}
      {!p.can_approve && p.status === "pending" && !p.stale && (
        <p className="text-[13px] text-ink-2">
          {user.role === "admin" ? "You made this request, so it can't be approved by you." : "Waiting for the Admin to review it."}
        </p>
      )}
    </div>
  );
}
