import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import type { Period } from "@/api/types";
import { SplitFlap, type FlapTone } from "@/components/board/SplitFlap";
import { Stamp } from "@/components/board/signals";
import { bookingStatus, categoryLabel } from "@/lib/format";
import { dayName, periodEnd, periodLabel } from "@/lib/time";
import { cn } from "@/lib/utils";

export interface TicketData {
  title: string;
  attendance: number | null;
  status: string | null;
  day?: string | null;
  start?: number | null;
  end?: number | null;
  room?: string | null;
  reason?: string;
  category?: string;
  categoryNote?: string | null;
}

function Cell({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="text-[11px] font-semibold text-ink-3 [font-stretch:88%]">{label}</div>
      <div className="truncate text-[15px] font-bold tabular-nums [font-stretch:88%]">{children}</div>
    </div>
  );
}

/**
 * What the code would book right now, printed as a ticket. The stub carries the venue like a
 * platform number; once submitted, the ticket is stamped with the decision.
 */
export function Ticket({ data, periods, stamped, checking }: { data: TicketData; periods?: Period[]; stamped?: string | null; checking?: boolean }) {
  const s = data.status ? bookingStatus(data.status) : null;
  const tone: FlapTone = !s ? "wait" : s.aspect === "clear" ? "clear" : s.aspect === "stop" ? "stop" : s.aspect === "caution" ? "caution" : "wait";
  const placed = data.day && data.start != null && data.end != null;
  const stamp = stamped ? bookingStatus(stamped) : null;
  return (
    <div className="relative" aria-live="polite">
      <div className="flex overflow-hidden rounded-[12px] bg-sheet shadow-[0_0_0_1px_var(--rule-strong),var(--mount)]">
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3 bg-anthracite px-4 py-2.5 text-on-anthracite">
            <span className="text-[12px] font-semibold text-on-anthracite-2">Spectra week request</span>
            <span className="text-[13px]">
              <SplitFlap value={checking ? "CHECKING" : s ? s.board : "DRAFT"} length={11} tone={checking ? "wait" : tone} label={s?.label ?? "Draft"} />
            </span>
          </div>
          <div className="flex flex-col gap-3 px-4 py-3.5">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-ink-3 [font-stretch:88%]">Event</div>
              <div className="truncate text-[17px] font-bold leading-6">{data.title || "Untitled request"}</div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Cell label="Day">{placed ? dayName(data.day!) : "—"}</Cell>
              <Cell label="Time">{placed ? `${periodLabel(data.start!, periods)}–${periodEnd(data.end!, periods)}` : "—"}</Cell>
              <Cell label="People">{data.attendance ?? "—"}</Cell>
            </div>
            {data.category && (
              <p className="text-[12.5px] text-ink-2">
                Counts as <b className="font-semibold text-ink">{categoryLabel(data.category)}</b>
                {data.categoryNote ? `. ${data.categoryNote}` : "."}
              </p>
            )}
            {data.reason && <p className="border-t border-dashed border-rule-strong pt-2.5 text-[13px] leading-[19px]">{data.reason}</p>}
          </div>
        </div>
        {/* perforation and stub */}
        <div className="relative w-[92px] shrink-0 border-l-2 border-dashed border-rule-strong bg-signal text-signal-ink sm:w-[110px]">
          <span className="absolute -left-[9px] -top-[9px] size-4 rounded-full bg-platform shadow-[inset_0_-1px_0_var(--rule-strong)]" />
          <span className="absolute -bottom-[9px] -left-[9px] size-4 rounded-full bg-platform shadow-[inset_0_1px_0_var(--rule-strong)]" />
          <div className="flex h-full flex-col items-center justify-center gap-1 px-2 py-4 text-center">
            <span className="text-[11px] font-bold">Venue</span>
            <span className="w-full break-words text-[22px] font-black leading-[24px] [font-stretch:72%] sm:text-[26px] sm:leading-[28px]">{data.room ?? "?"}</span>
          </div>
        </div>
      </div>
      <AnimatePresence>
        {stamp && (
          <motion.div key={stamped} className="absolute right-[120px] top-12 sm:right-[136px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Stamp tone={stamp.aspect === "stop" ? "stop" : "clear"} className="bg-sheet/70 text-[15px]">
              {stamp.label}
              <span className="text-[10px] tracking-[0.12em]">submitted</span>
            </Stamp>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
