import type { ReactNode } from "react";
import { Link } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import { dayShort } from "@/lib/time";
import { cn } from "@/lib/utils";

/** Grid columns for a dot table: a name, one column per day, a figure at the end. */
export const dotCols = (days: number, name = 120, tail = 52) => `${name}px repeat(${days}, minmax(0,1fr)) ${tail}px`;

/** What the readout shows for the mark under the pointer. */
export interface Reading {
  key: string;
  tag: string;
  when: string;
  what: ReactNode;
  state: string;
  tone: "busy" | "free" | "warn";
}

/**
 * The strip under a panel's title that reads out the dot or box under the pointer. Each new reading
 * rolls in from below, like a flap on a departures board.
 */
export function Readout({ reading, hint }: { reading: Reading | null; hint: string }) {
  return (
    <div className="relative h-11 overflow-hidden border-b-2 border-rule-strong bg-anthracite text-[13px] text-on-anthracite" aria-hidden>
      <AnimatePresence initial={false} mode="popLayout">
        <motion.div
          key={reading?.key ?? "hint"}
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -16, opacity: 0 }}
          transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
          className="absolute inset-0 flex items-center gap-2.5 px-3 sm:px-[18px]"
        >
          {reading ? (
            <>
              <span className="max-w-[40%] shrink-0 truncate rounded-[3px] bg-anthracite-3 px-1.5 py-0.5 font-bold">{reading.tag}</span>
              <span className="shrink-0 font-mono text-[12px] font-medium uppercase tracking-[0.03em]">{reading.when}</span>
              <span className="min-w-0 flex-1 truncate text-on-anthracite-2">{reading.what}</span>
              <span
                className={cn(
                  "shrink-0 font-mono text-[12px] font-bold uppercase tracking-[0.04em]",
                  reading.tone === "free" && "text-signal",
                  reading.tone === "warn" && "text-stop-vivid",
                )}
              >
                {reading.state}
              </span>
            </>
          ) : (
            <span className="truncate text-on-anthracite-2">{hint}</span>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/** One period: filled when in use, hollow when free, a red ring for a free period between classes. */
export function Dot({ on, gap, lunch, active, onEnter }: { on: boolean; gap?: boolean; lunch?: boolean; active?: boolean; onEnter?: () => void }) {
  return (
    <span onPointerEnter={onEnter} className={cn("grid h-4 flex-1 place-items-center", lunch && "mr-1.5")}>
      <KeyDot on={on} gap={gap} active={active} />
    </span>
  );
}

/** The scrolling frame: a day header and the rows under it. Wide enough to read on a phone by scrolling. */
export function DotTable({
  days,
  name,
  tail,
  cols,
  minWidth = 680,
  onLeave,
  children,
}: {
  days: string[];
  name: string;
  tail: string;
  cols: string;
  minWidth?: number;
  onLeave?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <div className="px-3 py-3 sm:px-[18px]" style={{ minWidth }} onPointerLeave={onLeave}>
        <div className="grid items-end gap-x-3 pb-2 text-[11.5px] font-bold uppercase tracking-[0.06em] text-ink-3" style={{ gridTemplateColumns: cols }}>
          <span className="pl-1">{name}</span>
          {days.map((d) => (
            <span key={d}>{dayShort(d)}</span>
          ))}
          <span className="pr-1 text-right">{tail}</span>
        </div>
        <ul className="flex flex-col">{children}</ul>
      </div>
    </div>
  );
}

/** A row that opens that timetable. */
export function DotRow({ to, label, cols, children }: { to: string; label: string; cols: string; children: ReactNode }) {
  return (
    <li>
      <Link to={to} aria-label={label} className="grid items-center gap-x-3 rounded-[4px] py-[5px] transition-colors hover:bg-signal-soft focus-visible:bg-signal-soft" style={{ gridTemplateColumns: cols }}>
        {children}
      </Link>
    </li>
  );
}

/** "Show all 42" under a list cut short. */
export function ShowAll({ shown, total, open, onToggle }: { shown: number; total: number; open: boolean; onToggle: () => void }) {
  if (total <= shown) return null;
  return (
    <button type="button" onClick={onToggle} className="w-full border-t-2 border-dashed border-rule-strong px-[18px] py-2.5 text-left text-[13px] font-bold text-ink underline-offset-2 hover:underline">
      {open ? "Show fewer" : `Show all ${total}`}
    </button>
  );
}

/** A box for one hour of a teaching day. */
export function HourBox({ tone, active }: { tone: "taught" | "full" | "over" | "free"; active?: boolean }) {
  return (
    <span
      className={cn(
        "size-[9px] shrink-0 rounded-[2px] transition-transform duration-100",
        tone === "taught" && "bg-ink",
        tone === "full" && "bg-k-lab",
        tone === "over" && "bg-stop",
        tone === "free" && "ring-1 ring-inset ring-rule-strong",
        active && "scale-125 outline-2 outline-offset-1 outline-signal",
      )}
    />
  );
}

/** The key under a dot table: what one mark stands for, then each kind of mark shown as drawn. */
export function Legend({ unit, items }: { unit: string; items: [ReactNode, string][] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t-2 border-dashed border-rule-strong px-[18px] py-3 text-[13px] text-ink-2">
      <span className="font-bold text-ink">{unit}</span>
      {items.map(([mark, label]) => (
        <span key={label} className="inline-flex items-center gap-1.5">
          <span className="inline-flex w-4 items-center justify-center" aria-hidden>
            {mark}
          </span>
          {label}
        </span>
      ))}
    </div>
  );
}

/** A single dot, in a table or a legend. */
export function KeyDot({ on, gap, active }: { on?: boolean; gap?: boolean; active?: boolean }) {
  return (
    <span
      className={cn(
        "size-[7px] rounded-full transition-transform duration-100",
        active ? "scale-150 bg-signal" : on ? "bg-ink" : gap ? "ring-2 ring-inset ring-stop" : "ring-1 ring-inset ring-rule-strong",
      )}
    />
  );
}
