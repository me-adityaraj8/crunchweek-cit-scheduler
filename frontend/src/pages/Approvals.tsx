import { Check, ClipboardCheck, Loader2, Lock, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { errorMessage } from "@/api/client";
import { useBookings, useChanges, useDecideBooking, useSummary } from "@/api/hooks";
import type { Booking } from "@/api/types";
import { Code, Stamp, StatusChip } from "@/components/board/signals";
import { Empty, ErrorState, Loading, PageHeader, SectionTitle } from "@/components/states";
import { Button } from "@/components/ui/button";
import { useUser } from "@/lib/auth";
import { categoryLabel, PROPOSAL_KIND, proposalStatus } from "@/lib/format";
import { dayShort, periodEnd, periodLabel } from "@/lib/time";
import { fmtDateTime, plural } from "@/lib/utils";

function BookingApproval({ b }: { b: Booking }) {
  const { data: summary } = useSummary();
  const decide = useDecideBooking();
  const [done, setDone] = useState<"clear" | "stop" | null>(null);
  const d = b.decision;
  const act = (action: "approve" | "reject") =>
    decide.mutate(
      { id: b.id, action },
      {
        onSuccess: () => {
          setDone(action === "approve" ? "clear" : "stop");
          toast.success(`${b.id} ${action === "approve" ? "approved" : "declined"}`);
        },
        onError: (e) => toast.error("Couldn't record the decision", { description: errorMessage(e) }),
      },
    );
  return (
    <li className="sheet relative flex flex-col gap-3 overflow-hidden p-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Code tone="signal">{b.id}</Code>
          <span className="truncate text-[14.5px] font-semibold">{b.title}</span>
        </div>
        <p className="mt-1 text-[13px] text-ink-2">
          {b.requester}
          {b.department ? ` (${b.department})` : ""} asks for {b.attendance} people. {categoryLabel(b.category)}.
        </p>
        {d?.day && d.start_period != null && d.end_period != null && (
          <p className="mt-1 text-[13px]">
            The code would give it <b>{d.room_id}</b> on {dayShort(d.day)}, {periodLabel(d.start_period, summary?.periods)}–{periodEnd(d.end_period, summary?.periods)}.
          </p>
        )}
        {b.reason && <p className="mt-0.5 text-[12.5px] text-ink-3">{b.reason}</p>}
      </div>
      <div className="flex shrink-0 gap-2">
        <Button variant="clear" onClick={() => act("approve")} disabled={decide.isPending || !!done}>
          {decide.isPending && decide.variables?.action === "approve" ? <Loader2 className="animate-spin" /> : <Check />} Approve
        </Button>
        <Button variant="outline" onClick={() => act("reject")} disabled={decide.isPending || !!done}>
          <X /> Decline
        </Button>
      </div>
      <AnimatePresence>
        {done && (
          <motion.div className="pointer-events-none absolute right-6 top-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Stamp tone={done} className="bg-sheet/85 text-[15px]">
              {done === "clear" ? "Approved" : "Declined"}
            </Stamp>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

export default function Approvals() {
  const user = useUser();
  const changes = useChanges("pending");
  const bookings = useBookings(false);
  const admin = user.role === "admin";
  const toDecide = (bookings.data ?? []).filter((b) => b.can_decide);
  const proposals = changes.data ?? [];
  const nothing = !toDecide.length && (!admin || !proposals.length);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Approvals"
        lede={
          admin
            ? "Timetable changes and venue bookings waiting for you. The code has already checked every rule; you decide whether it should happen. Nobody approves their own request."
            : `Bookings of ${user.department} labs waiting for you. Your own requests go to the Admin instead.`
        }
      />
      {changes.isLoading || bookings.isLoading ? (
        <Loading rows={5} />
      ) : changes.isError ? (
        <ErrorState error={changes.error} onRetry={() => changes.refetch()} />
      ) : bookings.isError ? (
        <ErrorState error={bookings.error} onRetry={() => bookings.refetch()} />
      ) : nothing ? (
        <Empty icon={<ClipboardCheck />} title="Nothing waiting for you">
          New requests that need your approval appear here, and in the count on the menu.
        </Empty>
      ) : (
        <>
          {admin && proposals.length > 0 && (
            <section>
              <SectionTitle>Timetable changes</SectionTitle>
              <ul className="flex flex-col gap-2">
                {proposals.map((p) => {
                  const s = proposalStatus(p.status);
                  return (
                    <li key={p.id} className="sheet flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Code tone="signal">#{p.id}</Code>
                          <span className="truncate text-[14.5px] font-semibold">{p.title}</span>
                        </div>
                        <p className="mt-1 text-[13px] text-ink-2">
                          {PROPOSAL_KIND[p.kind] ?? p.kind} from {p.requested_by_name}, {fmtDateTime(p.created_at)}. {plural(p.moved, "session")} moved
                          {p.added ? `, ${p.added} added` : ""}, {p.hard_count} hard violations, soft {p.soft_before} → {p.soft_after}.
                        </p>
                      </div>
                      {p.can_approve ? (
                        <Button asChild variant="primary">
                          <Link to={`/changes/${p.id}`}>Review the diff</Link>
                        </Button>
                      ) : (
                        <span className="flex items-center gap-2 text-[12.5px] text-ink-2">
                          {p.stale ? <StatusChip aspect="stop">Out of date</StatusChip> : <><Lock className="size-4" /> Your own request</>}
                          {!p.stale && <StatusChip aspect={s.aspect}>{s.label}</StatusChip>}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          {toDecide.length > 0 && (
            <section>
              <SectionTitle>Venue bookings</SectionTitle>
              <ul className="flex flex-col gap-2">
                {toDecide.map((b) => (
                  <BookingApproval key={b.id} b={b} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
