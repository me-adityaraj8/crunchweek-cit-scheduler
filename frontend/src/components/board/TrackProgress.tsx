import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Solver progress as a stretch of track: a yellow block runs along the sleepers while the request is
 * in flight, with the seconds elapsed. `limit` (seconds) shows how much of the time budget is used.
 */
export function TrackProgress({ running, label, limit, className }: { running: boolean; label: string; limit?: number; className?: string }) {
  const reduce = useReducedMotion();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!running) return;
    setElapsed(0);
    const t0 = performance.now();
    const id = window.setInterval(() => setElapsed((performance.now() - t0) / 1000), 200);
    return () => clearInterval(id);
  }, [running]);

  if (!running) return null;
  const used = limit ? Math.min(elapsed / limit, 1) : null;
  return (
    <div className={cn("inset-tile flex flex-col gap-2.5 p-3", className)} role="status" aria-live="polite">
      <div className="flex items-baseline justify-between gap-3">
        <span className="eyebrow">{label}</span>
        <span className="text-[13px] text-ink-2">
          <b className="text-[20px] font-black text-ink">{Math.floor(elapsed)}</b> s{limit ? ` of up to ${limit} s` : ""}
        </span>
      </div>
      <div className="relative h-5 overflow-hidden rounded-[4px] border-2 border-rule-strong bg-sheet">
        {/* sleepers */}
        <div
          className="absolute inset-0 opacity-40"
          style={{ backgroundImage: "repeating-linear-gradient(90deg, var(--rule-strong) 0 2px, transparent 2px 12px)" }}
        />
        {used != null && <div className="absolute inset-y-0 left-0 bg-signal-soft" style={{ width: `${used * 100}%` }} />}
        {reduce ? (
          <div className="absolute inset-y-[2px] left-[2px] w-1/3 rounded-[2px] bg-signal" />
        ) : (
          <motion.div
            className="absolute inset-y-[2px] w-16 rounded-[2px] border-2 border-rule-strong bg-signal"
            initial={{ left: "-20%" }}
            animate={{ left: "105%" }}
            transition={{ duration: 1.6, ease: [0.65, 0, 0.35, 1], repeat: Infinity, repeatDelay: 0.15 }}
          />
        )}
      </div>
    </div>
  );
}
