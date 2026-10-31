import { motion, useReducedMotion } from "motion/react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";

/** A status in words on a coloured chip (the boards' badges: ALL, CLEAR, PROVEN OPTIMAL, DECIDED...). */
export function Badge({ children, fill = "bg-white", className }: { children: ReactNode; fill?: string; className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center rounded-[3px] border-2 border-[#111] px-2 py-[3px] text-[11px] font-extrabold uppercase leading-none tracking-[0.06em] text-[#111]", fill, className)}>
      {children}
    </span>
  );
}

/**
 * A headline metric: a caps label with a status badge, one big figure ("190 / 190"), a chart of its
 * own and a note. With `to` the whole card opens that page. `hero` fills it with the accent; give it
 * to at most one card per page.
 */
export function MetricCard({
  label,
  value,
  unit,
  note,
  badge,
  hero,
  to,
  children,
  className,
}: {
  label: string;
  value: ReactNode;
  unit?: ReactNode;
  note?: ReactNode;
  badge?: ReactNode;
  hero?: boolean;
  to?: string;
  children?: ReactNode;
  className?: string;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <h2 className="pt-0.5 text-[12px] font-extrabold uppercase tracking-[0.08em]">{label}</h2>
        {badge}
      </div>
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-[52px] font-black leading-[0.9] tracking-[-0.04em] sm:text-[60px]">{value}</span>
        {unit && <span className={cn("text-[20px] font-bold", hero ? "text-signal-ink/75" : "text-ink-3")}>{unit}</span>}
      </div>
      {children && <div>{children}</div>}
      {note && <p className={cn("mt-auto text-[13px] leading-[1.4]", hero ? "text-signal-ink/80" : "text-ink-2")}>{note}</p>}
    </>
  );
  const cls = cn(
    "flex min-w-0 flex-col gap-3.5 rounded-sheet border-2 border-rule-strong p-[18px] shadow-float",
    hero ? "on-light bg-signal text-signal-ink" : "bg-sheet text-ink",
    to && "lift",
    className,
  );
  return to ? (
    <Link to={to} aria-label={label} className={cls}>
      {body}
    </Link>
  ) : (
    <section aria-label={label} className={cls}>
      {body}
    </section>
  );
}

/** A filled share of a bordered track. */
export function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  return (
    <div className="h-3.5 overflow-hidden rounded-[3px] border-2 border-rule-strong bg-sheet-2" role="img" aria-label={label}>
      <div className="h-full bg-ink" style={{ width: `${max ? Math.min(100, (value / max) * 100) : 0}%` }} />
    </div>
  );
}

/** Counts as small labelled chips: "22 approved", "1 alternative"... */
export function CountChips({ items }: { items: { label: string; value: number; fill: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((i) => (
        <li key={i.label} className={cn("rounded-[3px] border-2 border-[#111] px-2 py-[3px] text-[12px] font-bold text-[#111]", i.fill)}>
          {i.value} {i.label}
        </li>
      ))}
    </ul>
  );
}

/** The line under a chart that reads out what the pointer is on, like a board's message strip. */
function Readout({ text, fallback, hero }: { text: string | null; fallback: string; hero?: boolean }) {
  return (
    <p className={cn("mt-2 truncate text-[11.5px] font-semibold", hero ? "text-signal-ink/75" : "text-ink-3")} aria-live="polite">
      {text ?? fallback}
    </p>
  );
}

export interface Tick {
  key: string;
  label: string;
  ok: boolean;
}

/** One tick per rule: a full-height bar when it holds, a short red stub when it is broken. */
export function RuleTicks({ ticks, hero }: { ticks: Tick[]; hero?: boolean }) {
  const [on, setOn] = useState<Tick | null>(null);
  const broken = ticks.filter((t) => !t.ok).length;
  return (
    <div>
      <ul className="flex gap-[3px]" onMouseLeave={() => setOn(null)}>
        {ticks.map((t) => (
          <li
            key={t.key}
            onMouseEnter={() => setOn(t)}
            title={`${t.key} ${t.label}: ${t.ok ? "holds" : "broken"}`}
            className={cn("h-3.5 flex-1 rounded-[2px] border-2 border-[#111] transition-opacity duration-150", t.ok ? "bg-clear-vivid" : "bg-stop-vivid", on && on.key !== t.key && "opacity-45")}
          />
        ))}
      </ul>
      <span className="sr-only">{broken ? `${broken} of ${ticks.length} rules broken` : `All ${ticks.length} hard rules hold`}</span>
      <Readout hero={hero} text={on ? `${on.key} ${on.label}: ${on.ok ? "holds" : "broken"}` : null} fallback={`${ticks[0]?.key}–${ticks.at(-1)?.key}, ${ticks.length - broken} of ${ticks.length} hold`} />
    </div>
  );
}

export interface Column {
  key: string;
  label: string;
  value: number;
  /** what the readout says for this column */
  detail?: string;
}

/** Small columns with their labels underneath. With `mark`, the tallest columns (all of them, on a tie) take the accent. */
export function MiniColumns({ columns, max, mark, unit = "", hero }: { columns: Column[]; max?: number; mark?: boolean; unit?: string; hero?: boolean }) {
  const [on, setOn] = useState<Column | null>(null);
  const top = Math.max(1, max ?? 0, ...columns.map((c) => c.value));
  const peak = mark ? Math.max(0, ...columns.map((c) => c.value)) : 0;
  return (
    <div>
      <ul className="flex h-14 items-end gap-1.5" onMouseLeave={() => setOn(null)}>
        {columns.map((c) => (
          <li key={c.key} className="flex h-full flex-1 flex-col justify-end" onMouseEnter={() => setOn(c)} title={c.detail ?? `${c.label}: ${c.value}${unit}`}>
            <span
              className={cn(
                "block w-full rounded-t-[3px] transition-opacity duration-150",
                c.value === 0 ? "h-1 rounded-none bg-ink" : hero ? "bg-signal-ink" : peak > 0 && c.value === peak ? "border-2 border-rule-strong bg-mark" : "bg-ink",
                on && on.key !== c.key && "opacity-45",
              )}
              style={c.value ? { height: `${Math.max(8, (c.value / top) * 100)}%` } : undefined}
            />
          </li>
        ))}
      </ul>
      <ul className="mt-1.5 flex gap-1.5" aria-hidden>
        {columns.map((c) => (
          <li key={c.key} className={cn("flex-1 text-center text-[10.5px] font-bold", hero ? "text-signal-ink/70" : "text-ink-3")}>
            {c.label}
          </li>
        ))}
      </ul>
      <span className="sr-only">{columns.map((c) => `${c.label} ${c.value}${unit}`).join(", ")}</span>
      <Readout hero={hero} text={on ? (on.detail ?? `${on.label}: ${on.value}${unit}`) : null} fallback={peak > 0 ? `Highest: ${columns.filter((c) => c.value === peak).map((c) => c.label).join(", ")} (${peak}${unit})` : "Point at a column to read it"} />
    </div>
  );
}

/** A ratio against its limit as a ring: the filled arc is the share, the figure in the middle is the percent. */
export function RingMeter({ value, max, size = 92, caption }: { value: number; max: number; size?: number; caption?: string }) {
  const reduce = useReducedMotion();
  const share = max > 0 ? Math.min(value / max, 1) : 0;
  const stroke = 11;
  const r = (size - stroke) / 2 - 2;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--sheet-2)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--ink)"
          strokeWidth={stroke}
          initial={reduce ? false : { pathLength: 0 }}
          animate={{ pathLength: share }}
          transition={{ duration: 0.7, ease: [0.23, 1, 0.32, 1], delay: 0.15 }}
        />
        <circle cx={size / 2} cy={size / 2} r={r + stroke / 2} fill="none" stroke="var(--rule-strong)" strokeWidth={2} />
        <circle cx={size / 2} cy={size / 2} r={r - stroke / 2} fill="none" stroke="var(--rule-strong)" strokeWidth={2} />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-center">
        <span>
          <span className="block text-[18px] font-black leading-none">{Math.round(share * 100)}%</span>
          {caption && <span className="mt-0.5 block font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-ink-3">{caption}</span>}
        </span>
      </span>
    </div>
  );
}

/** One square per item, filled when it is done. Good for counts up to about 60. */
export function DotRow({ done, total, label }: { done: number; total: number; label: string }) {
  return (
    <div>
      <ul className="flex flex-wrap gap-[3px]" aria-label={`${done} of ${total} ${label}`}>
        {Array.from({ length: total }, (_, i) => (
          <li key={i} className={cn("size-[9px] rounded-[2px]", i < done ? "bg-ink" : "border-2 border-rule")} />
        ))}
      </ul>
      <Readout text={null} fallback={done === total ? `All ${total} ${label}` : `${total - done} of ${total} ${label} still to place`} />
    </div>
  );
}

export interface Part {
  key: string;
  label: string;
  value: number;
  /** a status fill class, e.g. bg-clear */
  fill: string;
}

/** Part-to-whole as one bar split by status, with a 2px gap between parts and a legend that names each. */
export function StackBar({ parts, total }: { parts: Part[]; total?: number }) {
  const [on, setOn] = useState<Part | null>(null);
  const sum = total ?? parts.reduce((s, p) => s + p.value, 0);
  const shown = parts.filter((p) => p.value > 0);
  return (
    <div>
      <div className="flex h-4 gap-[2px]" onMouseLeave={() => setOn(null)} aria-hidden>
        {sum === 0 ? (
          <span className="flex-1 rounded-[3px] bg-sheet-2" />
        ) : (
          shown.map((p) => (
            <span
              key={p.key}
              onMouseEnter={() => setOn(p)}
              title={`${p.label}: ${p.value}`}
              className={cn("rounded-[3px] transition-opacity duration-150", p.fill, on && on.key !== p.key && "opacity-40")}
              style={{ flexGrow: p.value, flexBasis: 0 }}
            />
          ))
        )}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
        {parts.map((p) => (
          <div key={p.key} className="flex items-center gap-2 text-[12.5px]">
            <span className={cn("size-2.5 shrink-0 rounded-[2px]", p.fill)} aria-hidden />
            <dt className="min-w-0 flex-1 truncate text-ink-2">{p.label}</dt>
            <dd className="font-bold tabular-nums">{p.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Before and after as two bars on one scale, so a repair's cost reads at a glance. Lower is better. */
export function CompareBars({ before, after, unit }: { before: number; after: number; unit: string }) {
  const top = Math.max(1, before, after);
  const rows: [string, number, string][] = [
    ["Before", before, "bg-ink/35"],
    ["After", after, after > before ? "bg-stop" : "bg-ink"],
  ];
  return (
    <div className="flex flex-col gap-2">
      {rows.map(([label, v, fill]) => (
        <div key={label} className="grid grid-cols-[48px_minmax(0,1fr)_32px] items-center gap-2 text-[12px]">
          <span className="font-bold text-ink-3">{label}</span>
          <span className="h-3.5 rounded-[3px] bg-sheet-2">
            <span className={cn("block h-full rounded-[3px]", v === 0 && "w-[3px]", fill)} style={v ? { width: `${(v / top) * 100}%` } : undefined} />
          </span>
          <span className="text-right font-bold tabular-nums">{v}</span>
        </div>
      ))}
      <span className="sr-only">
        {unit} {before} before, {after} after
      </span>
    </div>
  );
}
