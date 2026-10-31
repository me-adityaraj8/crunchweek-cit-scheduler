import { Mic, MicOff, Square, Volume2, VolumeX, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Phase } from "./voice/machine";

function Round({ label, onClick, children, big, disabled }: { label: string; onClick: () => void; children: React.ReactNode; big?: boolean; disabled?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className={cn(
          "grid place-items-center rounded-full text-white transition-[transform,background-color,box-shadow] duration-150 ease-out active:scale-95 disabled:opacity-40 [&_svg]:shrink-0",
          big
            ? "size-[76px] bg-[radial-gradient(circle_at_35%_30%,#ffb3d8,#ff4fa3_45%,#8b5cf6)] shadow-[0_0_0_1px_rgba(255,255,255,0.25),0_10px_40px_-6px_rgba(255,79,163,0.7)] hover:shadow-[0_0_0_1px_rgba(255,255,255,0.4),0_12px_50px_-4px_rgba(255,79,163,0.85)] [&_svg]:size-7"
            : "size-12 border border-white/15 bg-white/[0.07] hover:bg-white/[0.14] [&_svg]:size-5",
        )}
      >
        {children}
      </button>
      <span className="text-[11.5px] font-semibold text-white/60">{label}</span>
    </div>
  );
}

/** Mute Velo's voice, the main mic button (pause, resume, or interrupt while Velo speaks), and End. */
export function VoiceControls({ phase, muted, onMic, onMute, onEnd }: { phase: Phase; muted: boolean; onMic: () => void; onMute: () => void; onEnd: () => void }) {
  const main = phase === "speaking" ? { label: "Interrupt", icon: <Square /> } : phase === "paused" ? { label: "Resume", icon: <MicOff /> } : { label: "Pause", icon: <Mic /> };
  return (
    <div className="flex items-end justify-center gap-8">
      <Round label={muted ? "Unmute" : "Mute"} onClick={onMute}>
        {muted ? <VolumeX /> : <Volume2 />}
      </Round>
      <Round big label={main.label} onClick={onMic} disabled={phase === "starting" || phase === "processing" || phase === "error"}>
        {main.icon}
      </Round>
      <Round label="End" onClick={onEnd}>
        <X />
      </Round>
    </div>
  );
}
