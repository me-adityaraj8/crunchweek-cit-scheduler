import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import type { VoiceState } from "./voice/machine";

/** What you said (grey while still being heard, white once final) and what Velo said back. */
export function LiveTranscript({ state, transcribing, className }: { state: VoiceState; transcribing: boolean; className?: string }) {
  const reduce = useReducedMotion();
  const yours = state.interim || state.said;
  const fade = { initial: reduce ? { opacity: 0 } : { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0 }, transition: { duration: 0.2 } };
  return (
    <div className={cn("flex min-h-[112px] flex-col items-center gap-3 text-center", className)} aria-live="polite">
      <AnimatePresence mode="popLayout">
        {transcribing ? (
          <motion.p key="tx" {...fade} className="text-[15px] font-semibold text-white/55">
            Transcribing what you said…
          </motion.p>
        ) : yours ? (
          <motion.p key={`you-${state.said}`} {...fade} className={cn("max-w-[34ch] text-[19px] font-semibold leading-[26px] sm:text-[21px] sm:leading-[29px]", state.interim ? "text-white/55" : "text-white")}>
            {yours}
          </motion.p>
        ) : null}
      </AnimatePresence>
      <AnimatePresence mode="popLayout">
        {state.reply && state.phase !== "processing" && (
          <motion.p
            key={`velo-${state.reply}`}
            {...fade}
            className="max-w-[40ch] text-[15px] font-semibold leading-[22px] text-[#ffc6e4] sm:text-[16px]"
          >
            {state.reply}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
