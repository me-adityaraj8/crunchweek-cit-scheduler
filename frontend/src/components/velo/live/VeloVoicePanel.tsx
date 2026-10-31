import { MessageSquareText } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect } from "react";
import { useMediaQuery } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { useVelo } from "../VeloProvider";
import { AudioVisualizer } from "./AudioVisualizer";
import { LiveTranscript } from "./LiveTranscript";
import { OrbView } from "./OrbView";
import { PHASE_LABEL } from "./voice/machine";
import { useVoiceSession } from "./voice/useVoiceSession";
import { VoiceControls } from "./VoiceControls";

const EASE = [0.23, 1, 0.32, 1] as const;
const DOT: Record<string, string> = {
  listening: "bg-[#ff4fa3]",
  speaking: "bg-[#c8a8ff]",
  processing: "bg-[#ffad5c]",
  paused: "bg-white/40",
  starting: "bg-white/40",
  error: "bg-[#ff6b5e]",
};

function Stage({ onEnd, onChat }: { onEnd: () => void; onChat: () => void }) {
  const v = useVoiceSession(true);
  const reduce = useReducedMotion();
  const wide = useMediaQuery("(min-width: 768px)");
  const { phase } = v.state;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEnd();
      const typing = (e.target as HTMLElement | null)?.closest("input, textarea, [contenteditable]");
      if (e.code === "Space" && !typing) {
        e.preventDefault();
        v.toggleMic();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onEnd, v]);

  const hearing = v.hearing === "browser" ? "Browser speech recognition" : "Server transcription";
  const speaking = v.state.muted ? "Voice muted" : v.voiceKind === "gemini" ? "Gemini voice" : v.voiceKind === "browser" ? "Browser voice" : v.voiceKind === "none" ? "No voice on this browser: replies are shown" : "";

  return (
    <motion.div
      role="dialog"
      aria-modal
      aria-label="Velo voice mode"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.18 } }}
      transition={{ duration: 0.24, ease: EASE }}
      className={cn(
        "fixed inset-0 z-[80] flex flex-col items-center overflow-clip text-white",
        wide ? "bg-[#07040d]/85 backdrop-blur-md" : "bg-[#07040d]",
      )}
      style={{ backgroundImage: "radial-gradient(60% 50% at 50% 42%, rgba(139,92,246,0.28), transparent 70%), radial-gradient(40% 30% at 62% 62%, rgba(255,79,163,0.16), transparent 70%)" }}
    >
      <header className="flex w-full max-w-[1100px] items-center gap-3 px-5 pb-2 pt-[calc(16px+env(safe-area-inset-top))]">
        <span className="text-[12px] font-black tracking-[0.18em] text-white/80">VELO</span>
        <span className="flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1 text-[12.5px] font-semibold" aria-live="polite">
          <span className={cn("size-2 rounded-full", DOT[phase] ?? "bg-white/40", (phase === "listening" || phase === "processing") && !reduce && "animate-pulse")} />
          {PHASE_LABEL[phase]}
        </span>
        <span className="ml-auto hidden text-right text-[11.5px] leading-4 text-white/45 sm:block">
          {hearing}
          <br />
          {speaking}
        </span>
      </header>

      <motion.div
        initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.86, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.92 }}
        transition={{ type: "spring", stiffness: 160, damping: 22 }}
        className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-4 px-5"
      >
        <OrbView mood={v.mood} size="stage" level={v.level} className="aspect-square w-[min(88vw,52vh,560px)]" />
        <AudioVisualizer spectrum={v.spectrum} level={v.level} className="h-12 w-[min(78vw,340px)]" />
        {phase === "error" ? (
          <div className="flex max-w-[44ch] flex-col items-center gap-3 rounded-2xl border border-white/12 bg-white/[0.06] px-5 py-4 text-center" role="alert">
            <p className="text-[14.5px] leading-[21px] text-white/85">{v.state.error}</p>
            <div className="flex gap-2">
              <button type="button" onClick={v.retry} className="rounded-full bg-white px-4 py-1.5 text-[13px] font-bold text-[#140a1f]">
                Try again
              </button>
              <button type="button" onClick={onChat} className="rounded-full border border-white/25 px-4 py-1.5 text-[13px] font-bold">
                Type instead
              </button>
            </div>
          </div>
        ) : (
          <LiveTranscript state={v.state} transcribing={v.transcribing} />
        )}
        {v.last && v.last.cards.length > 0 && phase !== "processing" && (
          <button type="button" onClick={onChat} className="flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3.5 py-1.5 text-[12.5px] font-semibold text-white/80 transition-colors hover:bg-white/[0.12]">
            <MessageSquareText className="size-4" /> Details{v.last.cards.some((c) => ["preview", "confirm_cancel", "alternatives"].includes(c.kind)) ? " and the confirm step" : ""} are in the chat
          </button>
        )}
      </motion.div>

      <div className="w-full pb-[calc(24px+env(safe-area-inset-bottom))] pt-3">
        <VoiceControls phase={phase} muted={v.state.muted} onMic={v.toggleMic} onMute={v.toggleMute} onEnd={onEnd} />
        <p className="mt-3 hidden text-center text-[11.5px] text-white/35 md:block">Space to pause or interrupt · Esc to end</p>
      </div>
    </motion.div>
  );
}

/** Voice mode: the orb takes the stage. Opened by the mic button in Velo's composer. */
export function VeloVoicePanel() {
  const { voiceOpen, setVoiceOpen, setOpen } = useVelo();
  return (
    <AnimatePresence>
      {voiceOpen && (
        <Stage
          onEnd={() => setVoiceOpen(false)}
          onChat={() => {
            setVoiceOpen(false);
            setOpen(true);
          }}
        />
      )}
    </AnimatePresence>
  );
}
