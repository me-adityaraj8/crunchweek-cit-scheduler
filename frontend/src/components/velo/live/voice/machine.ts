// Voice mode as one reducer. The hook feeds it events from the mic, the recogniser, Velo and the
// speaker; the screen and the orb read only its state. Pure, so every rule is testable.

export type Phase = "off" | "starting" | "listening" | "paused" | "processing" | "speaking" | "error";

export interface VoiceState {
  phase: Phase;
  /** words still being recognised, then the final words of the current turn */
  interim: string;
  said: string;
  reply: string | null;
  error: string | null;
  muted: boolean;
}

export type VoiceEvent =
  | { type: "OPEN" }
  | { type: "READY" }
  | { type: "HEARD"; text: string }
  | { type: "FINAL"; text: string }
  | { type: "REPLY"; text: string }
  | { type: "SPOKEN" }
  | { type: "INTERRUPT" }
  | { type: "PAUSE" }
  | { type: "RESUME" }
  | { type: "MUTE" }
  | { type: "UNMUTE" }
  | { type: "FAIL"; message: string }
  | { type: "RETRY" }
  | { type: "CLOSE" };

export const initial: VoiceState = { phase: "off", interim: "", said: "", reply: null, error: null, muted: false };

export function voice(s: VoiceState, e: VoiceEvent): VoiceState {
  if (e.type === "CLOSE") return { ...initial, muted: s.muted };
  if (e.type === "MUTE") return { ...s, muted: true };
  if (e.type === "UNMUTE") return { ...s, muted: false };
  if (s.phase === "off") return e.type === "OPEN" ? { ...initial, muted: s.muted, phase: "starting" } : s;
  if (e.type === "FAIL") return { ...s, phase: "error", error: e.message, interim: "" };

  switch (s.phase) {
    case "starting":
      return e.type === "READY" ? { ...s, phase: "listening" } : s;
    case "listening":
      if (e.type === "HEARD") return { ...s, interim: e.text };
      if (e.type === "FINAL") return e.text.trim() ? { ...s, phase: "processing", said: e.text.trim(), interim: "", reply: null } : { ...s, interim: "" };
      if (e.type === "PAUSE") return { ...s, phase: "paused", interim: "" };
      return s;
    case "paused":
      return e.type === "RESUME" ? { ...s, phase: "listening" } : s;
    case "processing":
      if (e.type === "REPLY") return { ...s, phase: s.muted ? "listening" : "speaking", reply: e.text };
      return s;
    case "speaking":
      if (e.type === "SPOKEN" || e.type === "INTERRUPT") return { ...s, phase: "listening" };
      if (e.type === "PAUSE") return { ...s, phase: "paused" };
      return s;
    case "error":
      return e.type === "RETRY" ? { ...s, phase: "starting", error: null } : s;
    default:
      return s;
  }
}

export const PHASE_LABEL: Record<Phase, string> = {
  off: "",
  starting: "Starting",
  listening: "Listening",
  paused: "Paused",
  processing: "Thinking",
  speaking: "Speaking",
  error: "Stopped",
};
