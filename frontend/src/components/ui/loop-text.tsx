import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useLoop } from "@/lib/hooks";
import { cn } from "@/lib/utils";

/** Words that take turns in one spot, each sliding up as the next arrives. The box is sized by an
 * invisible copy of the longest word, so the layout never jumps; screen readers hear `label` once
 * instead of a changing word. Reduced motion shows the first word and stays put. */
export function LoopText({ words, label, every = 2400, className }: { words: string[]; label: string; every?: number; className?: string }) {
  const reduce = useReducedMotion();
  const key = useLoop(every, !!reduce);
  const word = words[key % words.length];
  const longest = words.reduce((a, b) => (b.length > a.length ? b : a), "");
  return (
    <span className={cn("relative inline-grid overflow-hidden align-bottom", className)} aria-label={label} role="text">
      <span className="invisible col-start-1 row-start-1" aria-hidden>
        {longest}
      </span>
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={word}
          aria-hidden
          className="col-start-1 row-start-1"
          initial={{ y: "70%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "-70%", opacity: 0 }}
          transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
        >
          {word}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
