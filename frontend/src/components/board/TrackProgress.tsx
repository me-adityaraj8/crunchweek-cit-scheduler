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
    <div className={cn("flex flex-col gap-2", className)} role="status" aria-live="polite">
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="font-semibold">{label}</span>
        <span className="tabular-nums text-ink-2">
          {Math.floor(elapsed)} s{limit ? ` of up to ${limit} s` : ""}
        </span>
      </div>
      <div className="relative h-4 overflow-hidden rounded-[4px] bg-platform-2">
        {/* sleepers */}
        <div
          className="absolute inset-0 opacity-70"
          style={{ backgroundImage: "repeating-linear-gradient(90deg, var(--rule-strong) 0 3px, transparent 3px 14px)" }}
        />
        {/* rails */}
        <div className="absolute inset-x-0 top-[4px] h-px bg-ink-3/60" />
        <div className="absolute inset-x-0 bottom-[4px] h-px bg-ink-3/60" />
        {used != null && <div className="absolute inset-y-0 left-0 bg-signal-soft" style={{ width: `${used * 100}%` }} />}
        {reduce ? (
          <div className="absolute inset-y-[3px] left-0 w-full rounded-[3px] bg-signal/50" />
        ) : (
          <motion.div
            className="absolute inset-y-[2px] w-16 rounded-[3px] bg-signal shadow-[inset_0_-2px_0_oklch(0_0_0/0.15)]"
            initial={{ left: "-20%" }}
            animate={{ left: "105%" }}
            transition={{ duration: 1.6, ease: "easeInOut", repeat: Infinity, repeatDelay: 0.15 }}
          />
        )}
      </div>
    </div>
  );
}
