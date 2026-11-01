import type { ReactNode } from "react";
import { Link } from "react-router";
import { dayShort } from "@/lib/time";
import { cn } from "@/lib/utils";

/** Grid columns for a dot table: a name, one column per day, a figure at the end. */
export const dotCols = (days: number, name = 120, tail = 52) => `${name}px repeat(${days}, minmax(0,1fr)) ${tail}px`;

/** One period: filled when in use, hollow when free, a red ring for a free period between classes. */
export function Dot({ on, gap, lunch }: { on: boolean; gap?: boolean; lunch?: boolean }) {
  return (
    <span className={cn("grid h-4 flex-1 place-items-center", lunch && "mr-1.5")}>
      <span className={cn("size-[7px] rounded-full", on ? "bg-ink" : gap ? "ring-2 ring-inset ring-stop" : "ring-1 ring-inset ring-rule-strong")} />
    </span>
  );
}

/** The scrolling frame: a day header and the rows under it. Wide enough to read on a phone by scrolling. */
export function DotTable({ days, name, tail, cols, minWidth = 680, children }: { days: string[]; name: string; tail: string; cols: string; minWidth?: number; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <div className="px-3 py-3 sm:px-[18px]" style={{ minWidth }}>
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
export function HourBox({ tone }: { tone: "taught" | "full" | "over" | "free" }) {
  return (
    <span
      className={cn(
        "size-[9px] shrink-0 rounded-[2px]",
        tone === "taught" && "bg-ink",
        tone === "full" && "bg-k-lab",
        tone === "over" && "bg-stop",
        tone === "free" && "ring-1 ring-inset ring-rule-strong",
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

/** A single dot for a legend. */
export function KeyDot({ on, gap }: { on?: boolean; gap?: boolean }) {
  return <span className={cn("size-[7px] rounded-full", on ? "bg-ink" : gap ? "ring-2 ring-inset ring-stop" : "ring-1 ring-inset ring-rule-strong")} />;
}
