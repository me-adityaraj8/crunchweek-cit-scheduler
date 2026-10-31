// The real audio behind voice mode: the microphone and its level, speech recognition (the browser's
// where it exists, otherwise a recording sent to the server), and Velo's voice (the server's Gemini
// voice played through Web Audio, otherwise the browser's own). Nothing here pretends: every level is
// measured, every word comes from a recogniser, and "speaking" means audio is actually playing.
import { ApiError, request, requestAudio } from "@/api/client";
import { downsample, encodeWav, SPEECH_RATE } from "@/lib/wav";

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
    const ctx = new AudioContext();
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
    return (await request<{ text: string }>("/assistant/transcribe", { form })).text;
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
  private serverVoice: "unknown" | "yes" | "no" = "unknown";
  private wordAt = 0;
  private playing: VoiceKind | null = null;
  private abort: AbortController | null = null;
  private utter: SpeechSynthesisUtterance | null = null;

  constructor(private ctx: AudioContext) {
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.buf = new Uint8Array(new ArrayBuffer(this.analyser.fftSize));
    this.analyser.connect(ctx.destination);
  }

  /** Speak `text`. Resolves with the voice used once playback has started, and calls `ended` when it stops. */
  async say(text: string, ended: () => void): Promise<VoiceKind> {
    this.stop();
    if (this.serverVoice !== "no") {
      try {
        this.abort = new AbortController();
        const bytes = await requestAudio("/assistant/speak", { text: text.slice(0, 1200) }, this.abort.signal);
        const audio = await this.ctx.decodeAudioData(bytes);
        if (this.ctx.state === "suspended") await this.ctx.resume();
        const src = this.ctx.createBufferSource();
        src.buffer = audio;
        src.connect(this.analyser);
        src.onended = () => {
          if (this.source === src) {
            this.source = null;
            this.playing = null;
            ended();
          }
        };
        this.source = src;
        this.playing = "gemini";
        this.serverVoice = "yes";
        src.start();
        return "gemini";
      } catch (e) {
        if ((e as Error).name === "AbortError") return "none";
        // the server voice isn't available (no key, model down, network): use the browser's for this session
        this.serverVoice = "no";
      }
    }
    const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
    if (synth) {
      return new Promise<VoiceKind>((resolve) => {
        const u = new SpeechSynthesisUtterance(text);
        const voices = synth.getVoices();
        u.voice = voices.find((v) => v.lang === "en-IN") ?? voices.find((v) => v.lang.startsWith("en-GB")) ?? voices.find((v) => v.lang.startsWith("en")) ?? null;
        u.rate = 1.02;
        u.onstart = () => {
          this.playing = "browser";
          this.wordAt = performance.now();
          resolve("browser");
        };
        u.onboundary = () => {
          this.wordAt = performance.now();
        };
        // ended either way, so voice mode never stays on "Speaking"; resolve("none") only if it never started
        const finish = () => {
          const started = this.playing === "browser";
          this.playing = null;
          this.utter = null;
          ended();
          if (!started) resolve("none");
        };
        u.onend = finish;
        u.onerror = finish;
        this.utter = u;
        synth.speak(u);
      });
    }
    ended();
    return "none";
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
