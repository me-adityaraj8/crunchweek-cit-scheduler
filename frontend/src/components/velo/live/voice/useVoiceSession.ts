import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { errorMessage } from "@/api/client";
import type { VeloOut } from "@/api/types";
import { useVelo } from "../../VeloProvider";
import { moodFor, type Mood } from "../expression";
import { browserRecognizer, listenOnce, Mic, MicError, Speaker, transcribe, unlockAudio, type VoiceKind } from "./engine";
import { initial, voice } from "./machine";

export type Hearing = "browser" | "server";

/**
 * Runs voice mode: mic → words → Velo → voice → listen again, through the state machine. The orb, the
 * waveform and the transcript read from here; nothing is shown that the audio didn't produce.
 */
export function useVoiceSession(active: boolean) {
  const velo = useVelo();
  const [state, dispatch] = useReducer(voice, initial);
  const [hearing, setHearing] = useState<Hearing>(() => (browserRecognizer() ? "browser" : "server"));
  const [voiceKind, setVoiceKind] = useState<VoiceKind | null>(null);
  // "speaking" starts when the reply arrives; sound starts once the voice is ready. Until then it's still thinking.
  const [audible, setAudible] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [last, setLast] = useState<VeloOut | null>(null);
  const [moment, setMoment] = useState<Mood | null>(null);
  const mic = useRef<Mic | null>(null);
  const speaker = useRef<Speaker | null>(null);
  const phase = useRef(state.phase);
  phase.current = state.phase;

  const stopAll = useCallback(() => {
    speaker.current?.stop();
    speaker.current = null;
    mic.current?.close();
    mic.current = null;
  }, []);

  // open: ask for the mic; close: release everything
  useEffect(() => {
    if (!active) {
      dispatch({ type: "CLOSE" });
      stopAll();
      return;
    }
    dispatch({ type: "OPEN" });
  }, [active, stopAll]);

  useEffect(() => {
    if (state.phase !== "starting") return;
    let cancelled = false;
    stopAll(); // a retry starts from a clean mic
    Mic.open().then(
      (m) => {
        if (cancelled) return m.close();
        mic.current = m;
        speaker.current = new Speaker(m.ctx);
        dispatch({ type: "READY" });
      },
      (e) => !cancelled && dispatch({ type: "FAIL", message: e instanceof MicError ? e.message : errorMessage(e) }),
    );
    return () => {
      cancelled = true;
    };
  }, [state.phase, stopAll]);

  useEffect(() => () => stopAll(), [stopAll]);

  // listening: one turn of recognition at a time, started again after silence
  const [round, setRound] = useState(0);
  useEffect(() => {
    if (state.phase !== "listening" || !mic.current) return;
    const m = mic.current;
    const viaServer = (wav: Blob) => {
      setTranscribing(true);
      transcribe(wav).then(
        (text) => {
          setTranscribing(false);
          if (phase.current !== "listening") return;
          if (text.trim()) dispatch({ type: "FINAL", text });
          else setRound((n) => n + 1);
        },
        (e) => {
          setTranscribing(false);
          if (phase.current === "listening") dispatch({ type: "FAIL", message: `${errorMessage(e)} You can type to Velo instead.` });
        },
      );
    };
    const Ctor = browserRecognizer();
    if (hearing === "browser" && Ctor) {
      let words = false;
      let backup = 0;
      let stopRec: (() => void) | null = listenOnce(Ctor, {
        interim: (t) => {
          words = true;
          dispatch({ type: "HEARD", text: t });
        },
        final: (t) => {
          words = true;
          dispatch({ type: "FINAL", text: t });
        },
        ended: () => window.setTimeout(() => phase.current === "listening" && setRound((n) => n + 1), 200),
        failed: (kind, message) => {
          // the browser's recogniser needs its own online service; the server can transcribe instead
          if (kind === "network") setHearing("server");
          else dispatch({ type: "FAIL", message });
        },
      });
      // the recording is a backup: some browsers' recognisers give no words and no error (no speech service,
      // or iOS sharing the mic). If the mic heard someone speak and the recogniser didn't, the server transcribes it.
      m.captureUtterance((wav) => {
        if (!wav) return;
        backup = window.setTimeout(() => {
          if (words || phase.current !== "listening") return;
          stopRec?.();
          stopRec = null;
          setHearing("server");
          viaServer(wav);
        }, 1500);
      });
      return () => {
        window.clearTimeout(backup);
        stopRec?.();
        m.stopCapture();
      };
    }
    m.captureUtterance((wav) => (wav ? viaServer(wav) : setRound((n) => n + 1)));
    return () => m.stopCapture();
  }, [state.phase, hearing, round]);

  // processing: the words go to Velo exactly like typed text, and land in the chat thread
  useEffect(() => {
    if (state.phase !== "processing") return;
    let live = true;
    velo.ask(state.said).then(
      (out) => {
        if (!live) return;
        setLast(out);
        dispatch({ type: "REPLY", text: out.reply });
      },
      (e) => live && dispatch({ type: "FAIL", message: errorMessage(e) }),
    );
    return () => {
      live = false;
    };
    // velo.ask changes identity with the thread; this runs once per turn
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.said]);

  // speaking: real audio; the machine moves on when it actually ends
  useEffect(() => {
    if (state.phase !== "speaking" || !state.reply || !speaker.current) return;
    const s = speaker.current;
    let live = true;
    setAudible(false);
    s.say(state.reply, () => dispatch({ type: "SPOKEN" })).then((k) => {
      if (!live) return;
      setVoiceKind(k);
      setAudible(k !== "none");
    });
    return () => {
      live = false;
      s.stop();
    };
  }, [state.phase, state.reply]);

  // after a reply: a moment of the reply's mood (happy when something was found, confused when Velo asks)
  useEffect(() => {
    if (state.phase !== "listening" || !last) return;
    const m = moodFor({ last });
    if (m === "idle") return;
    setMoment(m);
    const id = window.setTimeout(() => setMoment(null), 1500);
    return () => clearTimeout(id);
  }, [state.phase, last]);

  const mood: Mood =
    state.phase === "error" ? "error" : state.phase === "processing" || state.phase === "starting" || (state.phase === "speaking" && !audible) ? "thinking" : state.phase === "speaking" ? "speaking" : state.phase === "listening" ? (moment ?? "listening") : "idle";

  const level = useCallback(() => {
    if (phase.current === "speaking") return speaker.current?.level() ?? 0;
    if (phase.current === "listening") return mic.current?.level() ?? 0;
    return 0;
  }, []);

  const spectrum = useCallback((out: Uint8Array<ArrayBuffer>) => {
    if (phase.current === "speaking") return speaker.current?.spectrum(out) ?? false;
    if (phase.current === "listening" && mic.current) {
      mic.current.spectrum(out);
      return true;
    }
    return false;
  }, []);

  return {
    state,
    mood,
    level,
    spectrum,
    last,
    audible,
    hearing,
    voiceKind,
    transcribing,
    toggleMic: () => {
      if (state.phase === "speaking") {
        speaker.current?.stop();
        dispatch({ type: "INTERRUPT" });
      } else if (state.phase === "listening") dispatch({ type: "PAUSE" });
      else if (state.phase === "paused") dispatch({ type: "RESUME" });
    },
    toggleMute: () => {
      if (state.muted) dispatch({ type: "UNMUTE" });
      else {
        dispatch({ type: "MUTE" });
        if (state.phase === "speaking") {
          speaker.current?.stop();
          dispatch({ type: "INTERRUPT" });
        }
      }
    },
    retry: () => {
      unlockAudio(); // the retry tap opens a new mic, so its audio needs unlocking too
      dispatch({ type: "RETRY" });
    },
  };
}
