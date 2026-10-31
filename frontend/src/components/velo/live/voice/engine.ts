// The real audio behind voice mode: the microphone and its level, speech recognition (the browser's
// where it exists, otherwise a recording sent to the server), and Velo's voice (the server's Gemini
// voice played through Web Audio, otherwise the browser's own). Nothing here pretends: every level is
// measured, every word comes from a recogniser, and "speaking" means audio is actually playing.
import { ApiError, request, requestAudio } from "@/api/client";
import { downsample, encodeWav, SPEECH_RATE } from "@/lib/wav";
import { speechChunks, speechText } from "./speech";

/** how long to wait for the first piece of the server voice before the browser's speaks instead, and for later pieces */
const FIRST_VOICE_MS = 9000;
const NEXT_VOICE_MS = 25000;
/** a transcription gets this long */
const TRANSCRIBE_TIMEOUT_MS = 25000;

// ---------------------------------------------------------------- audio unlock
// iOS Safari (and other browsers' autoplay rules) only let audio start inside a tap. The audio context is
// made and resumed here, called from the tap that opens voice mode; the mic and Velo's voice then use it.
let unlocked: AudioContext | null = null;

export function unlockAudio() {
  try {
    if (!unlocked || unlocked.state === "closed") unlocked = new AudioContext();
    void unlocked.resume().catch(() => undefined);
    const src = unlocked.createBufferSource(); // a silent sample: what iOS needs to count the context as started
    src.buffer = unlocked.createBuffer(1, 1, unlocked.sampleRate);
    src.connect(unlocked.destination);
    src.start();
  } catch {
    /* no Web Audio: Mic.open reports it */
  }
  const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
  if (synth) {
    // the browser's voice is unlocked the same way: an empty utterance, spoken inside the tap
    const u = new SpeechSynthesisUtterance("");
    u.volume = 0;
    synth.speak(u);
  }
}

function audioContext(): AudioContext {
  const ctx = unlocked && unlocked.state !== "closed" ? unlocked : new AudioContext();
  unlocked = null; // the mic owns it now and closes it when voice mode ends
  return ctx;
}

// ---------------------------------------------------------------- microphone
export class MicError extends Error {}

export class Mic {
  private analyser: AnalyserNode;
  private buf: Uint8Array<ArrayBuffer>;
  private source: MediaStreamAudioSourceNode;
  private proc: ScriptProcessorNode | null = null;
  private constructor(
    readonly ctx: AudioContext,
    private stream: MediaStream,
  ) {
    const src = ctx.createMediaStreamSource(stream);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.buf = new Uint8Array(new ArrayBuffer(this.analyser.fftSize));
    src.connect(this.analyser);
    this.source = src;
  }

  static async open(): Promise<Mic> {
    if (!navigator.mediaDevices?.getUserMedia) throw new MicError("This browser can't use a microphone here. Voice needs a secure (https) page in a current browser.");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (e) {
      const name = (e as DOMException).name;
      if (name === "NotAllowedError" || name === "SecurityError") throw new MicError("Microphone access is blocked. Allow it for this site in the browser's address bar, then try again.");
      if (name === "NotFoundError" || name === "OverconstrainedError") throw new MicError("No microphone was found. Plug one in, or type to Velo instead.");
      throw new MicError("The microphone couldn't be started. Another app may be using it.");
    }
    const ctx = audioContext();
    if (ctx.state === "suspended") await ctx.resume().catch(() => undefined);
    return new Mic(ctx, stream);
  }

  /** Loudness right now, 0 to 1 (RMS of the waveform, scaled for speech). */
  level(): number {
    this.analyser.getByteTimeDomainData(this.buf);
    let sum = 0;
    for (const v of this.buf) {
      const x = (v - 128) / 128;
      sum += x * x;
    }
    return Math.min(1, Math.sqrt(sum / this.buf.length) * 5);
  }

  /** Frequency bins for the waveform, 0 to 255. */
  spectrum(out: Uint8Array<ArrayBuffer>) {
    this.analyser.getByteFrequencyData(out);
  }

  /**
   * Record one utterance for server transcription: waits for speech, then for about a second of quiet
   * (or 15 seconds), and hands back a 16 kHz WAV. The quiet threshold adapts to the room's noise.
   */
  captureUtterance(onDone: (wav: Blob | null) => void) {
    this.stopCapture();
    const rate = this.ctx.sampleRate;
    const parts: Float32Array[] = [];
    let floor = 0.02;
    let started = false;
    let quietFor = 0;
    let total = 0;
    const proc = this.ctx.createScriptProcessor(4096, 1, 1);
    proc.onaudioprocess = (e) => {
      const chunk = new Float32Array(e.inputBuffer.getChannelData(0));
      let sum = 0;
      for (const x of chunk) sum += x * x;
      const lv = Math.sqrt(sum / chunk.length);
      const dt = chunk.length / rate;
      if (!started) {
        floor = floor * 0.95 + lv * 0.05;
        if (lv > Math.max(0.025, floor * 2.6)) started = true;
        else return;
      }
      parts.push(chunk);
      total += dt;
      quietFor = lv < Math.max(0.018, floor * 1.8) ? quietFor + dt : 0;
      if (quietFor > 1 || total > 15) {
        this.stopCapture();
        const all = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
        let at = 0;
        for (const p of parts) {
          all.set(p, at);
          at += p.length;
        }
        onDone(total > 0.4 ? encodeWav(downsample(all, rate, SPEECH_RATE), SPEECH_RATE) : null);
      }
    };
    this.source.connect(proc);
    proc.connect(this.ctx.destination);
    this.proc = proc;
  }

  stopCapture() {
    if (!this.proc) return;
    this.proc.onaudioprocess = null;
    this.proc.disconnect();
    this.proc = null;
  }

  close() {
    this.stopCapture();
    this.stream.getTracks().forEach((t) => t.stop());
    void this.ctx.close();
  }
}

// ---------------------------------------------------------------- browser speech recognition
interface RecResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecEvent {
  resultIndex: number;
  results: ArrayLike<RecResult>;
}
interface Rec {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: RecEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecCtor = new () => Rec;

export function browserRecognizer(): RecCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface HearHandlers {
  interim: (text: string) => void;
  final: (text: string) => void;
  /** recognition ended without a final result (silence, a pause): the caller decides whether to listen again */
  ended: () => void;
  failed: (kind: "blocked" | "network" | "no-mic" | "other", message: string) => void;
}

/** One turn of browser recognition, with live words. Indian English handles Hinglish best. */
export function listenOnce(Ctor: RecCtor, on: HearHandlers): () => void {
  const rec = new Ctor();
  rec.lang = "en-IN";
  rec.continuous = false;
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  let done = false;
  rec.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) {
        done = true;
        on.final(r[0].transcript);
      } else interim += r[0].transcript;
    }
    if (!done && interim) on.interim(interim);
  };
  rec.onerror = (e) => {
    if (e.error === "no-speech" || e.error === "aborted") return;
    done = true;
    if (e.error === "not-allowed" || e.error === "service-not-allowed") on.failed("blocked", "Speech recognition is blocked in this browser. Allow the microphone for this site, then try again.");
    else if (e.error === "network") on.failed("network", "The browser's speech recognition couldn't reach its service.");
    else if (e.error === "audio-capture") on.failed("no-mic", "No microphone was found. Plug one in, or type to Velo instead.");
    else on.failed("other", `Speech recognition stopped (${e.error}).`);
  };
  rec.onend = () => {
    if (!done) on.ended();
  };
  rec.start();
  return () => {
    done = true;
    rec.onresult = rec.onerror = rec.onend = null;
    rec.abort();
  };
}

/** Server transcription of a recorded utterance. "" when no words were heard. */
export async function transcribe(wav: Blob): Promise<string> {
  const form = new FormData();
  form.append("audio", wav, "voice.wav");
  try {
    return (await request<{ text: string }>("/assistant/transcribe", { form, timeoutMs: TRANSCRIBE_TIMEOUT_MS })).text;
  } catch (e) {
    if (e instanceof ApiError && e.code === "no_speech") return "";
    throw e;
  }
}

// ---------------------------------------------------------------- Velo's voice
export type VoiceKind = "gemini" | "browser" | "none";

/** Velo's spoken replies. Its level() is the real output: the audio's loudness, or the browser voice's word timings. */
export class Speaker {
  private analyser: AnalyserNode;
  private buf: Uint8Array<ArrayBuffer>;
  private source: AudioBufferSourceNode | null = null;
  /** after the server voice fails, the browser's is used until then (ms since epoch) */
  private serverVoiceAfter = 0;
  private wordAt = 0;
  private playing: VoiceKind | null = null;
  private abort: AbortController | null = null;
  private utter: SpeechSynthesisUtterance | null = null;
  private watchdog = 0;
  /** bumped by stop(): async work from an older reply sees it changed and does nothing */
  private turn = 0;

  constructor(private ctx: AudioContext) {
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.buf = new Uint8Array(new ArrayBuffer(this.analyser.fftSize));
    this.analyser.connect(ctx.destination);
  }

  /**
   * Speak `text`. Resolves with the voice used once sound has actually started ("none" if none could), and
   * calls `ended` exactly once when it stops on its own. The server voice is fetched a piece at a time, the
   * next while the current one plays; if it is slow or fails, the browser's voice says the rest.
   */
  async say(text: string, ended: () => void): Promise<VoiceKind> {
    this.stop();
    const turn = this.turn;
    const parts = speechChunks(speechText(text));
    if (!parts.length) {
      ended();
      return "none";
    }
    let started: VoiceKind = "none";
    let resolveStart!: (k: VoiceKind) => void;
    const firstSound = new Promise<VoiceKind>((r) => (resolveStart = r));
    const begin = (k: VoiceKind) => {
      if (started === "none") {
        started = k;
        resolveStart(k);
      }
    };
    void (async () => {
      // the server voice: a short first piece so sound starts soon, then the rest, both asked for at once
      // (two calls per reply at most: the voice model's quota is small)
      const pieces = [parts[0], parts.slice(1).join(" ")].filter(Boolean);
      let i = 0;
      if (Date.now() >= this.serverVoiceAfter) {
        this.abort = new AbortController();
        const signal = this.abort.signal;
        const fetched = pieces.map((t, n) =>
          requestAudio("/assistant/speak", { text: t }, signal, n === 0 ? FIRST_VOICE_MS : NEXT_VOICE_MS).then((b) => this.ctx.decodeAudioData(b)),
        );
        fetched.forEach((f) => f.catch(() => undefined));
        try {
          for (; i < pieces.length; i++) {
            const audio = await fetched[i];
            if (turn !== this.turn) return;
            if (this.ctx.state === "suspended") await this.ctx.resume();
            await this.play(audio, () => begin("gemini"));
            if (turn !== this.turn) return;
          }
        } catch (e) {
          if (turn !== this.turn || (e as Error).name === "AbortError") return;
          // the server voice is unavailable or too slow (no key, quota, network): the browser's says the rest
          this.abort.abort();
          this.serverVoiceAfter = Date.now() + 60_000;
        }
      }
      // the browser's voice, a sentence or so at a time (Chrome cuts long utterances off)
      for (const part of speechChunks(pieces.slice(i).join(" "))) {
        const ok = await this.browserSay(part, () => begin("browser"));
        if (turn !== this.turn) return;
        if (!ok) break;
      }
      this.playing = null;
      begin("none");
      ended();
    })();
    return firstSound;
  }

  /** Play one decoded piece; resolves when it ends or is stopped. */
  private play(audio: AudioBuffer, onStart: () => void): Promise<void> {
    return new Promise((resolve) => {
      const src = this.ctx.createBufferSource();
      src.buffer = audio;
      src.connect(this.analyser);
      src.onended = () => {
        if (this.source === src) this.source = null;
        resolve();
      };
      this.source = src;
      this.playing = "gemini";
      src.start();
      onStart();
    });
  }

  /**
   * One piece in the browser's voice. Resolves true when it was spoken, false when it couldn't be. A watchdog
   * ends it if the browser never reports start or end (Chrome sometimes drops both), so voice mode never hangs.
   */
  private browserSay(text: string, onStart: () => void): Promise<boolean> {
    const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
    if (!synth) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      const voices = synth.getVoices();
      u.voice = voices.find((v) => v.lang === "en-IN") ?? voices.find((v) => v.lang.startsWith("en-GB")) ?? voices.find((v) => v.lang.startsWith("en")) ?? null;
      u.rate = 1.02;
      let began = false;
      const finish = (ok: boolean) => {
        window.clearTimeout(this.watchdog);
        if (this.utter !== u) return;
        this.utter = null;
        this.playing = null;
        resolve(ok);
      };
      const arm = (ms: number, ok: boolean) => {
        window.clearTimeout(this.watchdog);
        this.watchdog = window.setTimeout(() => {
          synth.cancel();
          finish(ok);
        }, ms);
      };
      u.onstart = () => {
        began = true;
        this.playing = "browser";
        this.wordAt = performance.now();
        onStart();
        arm(3000 + text.split(/\s+/).length * 600, true);
      };
      u.onboundary = () => {
        this.wordAt = performance.now();
      };
      u.onend = () => finish(began);
      u.onerror = () => finish(began);
      this.utter = u;
      synth.cancel(); // a stuck queue would hold this one back forever
      synth.speak(u);
      arm(4000, false);
    });
  }

  /** Output loudness 0..1: measured from the audio for the server voice, from real word boundaries for the browser's. */
  level(): number {
    if (this.playing === "gemini") {
      this.analyser.getByteTimeDomainData(this.buf);
      let sum = 0;
      for (const v of this.buf) {
        const x = (v - 128) / 128;
        sum += x * x;
      }
      return Math.min(1, Math.sqrt(sum / this.buf.length) * 4);
    }
    if (this.playing === "browser") return 0.25 + 0.6 * Math.exp(-(performance.now() - this.wordAt) / 160);
    return 0;
  }

  spectrum(out: Uint8Array<ArrayBuffer>): boolean {
    if (this.playing !== "gemini") return false;
    this.analyser.getByteFrequencyData(out);
    return true;
  }

  get speaking() {
    return this.playing !== null;
  }

  stop() {
    this.turn++;
    window.clearTimeout(this.watchdog);
    this.abort?.abort();
    this.abort = null;
    if (this.source) {
      const s = this.source;
      this.source = null;
      s.onended = null;
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    if (this.utter) {
      this.utter.onstart = this.utter.onend = this.utter.onerror = this.utter.onboundary = null;
      this.utter = null;
      window.speechSynthesis.cancel();
    }
    this.playing = null;
  }
}
