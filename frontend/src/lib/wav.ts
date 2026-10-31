// Microphone capture for the assistant: record with Web Audio, then hand the server a small 16 kHz
// mono WAV. WAV works in every browser (MediaRecorder formats differ by browser) and Gemini reads it.
import { useCallback, useEffect, useRef, useState } from "react";

export const SPEECH_RATE = 16000;
const MAX_SECONDS = 60;

/** Average neighbouring samples down to the target rate (speech needs nothing above 8 kHz). */
export function downsample(input: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return input;
  const ratio = from / to;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    out[i] = sum / Math.max(1, end - start);
  }
  return out;
}

/** 16-bit PCM mono WAV bytes. */
export function wavBytes(samples: Float32Array, rate: number): ArrayBuffer {
  const view = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const str = (at: number, s: string) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  str(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  str(36, "data");
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((x, i) => {
    const c = Math.max(-1, Math.min(1, x));
    view.setInt16(44 + i * 2, c < 0 ? c * 0x8000 : c * 0x7fff, true);
  });
  return view.buffer;
}

export const encodeWav = (samples: Float32Array, rate: number) =>
  new Blob([wavBytes(samples, rate)], { type: "audio/wav" });

export const canRecord = () => typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

/** start() asks for the mic and records; stop() returns the WAV. Stops by itself after a minute. */
export function useRecorder(onAutoStop?: (wav: Blob) => void) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const parts = useRef<Float32Array[]>([]);
  const ctx = useRef<AudioContext | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<number | null>(null);
  const autoStop = useRef(onAutoStop);
  autoStop.current = onAutoStop;

  const release = useCallback(() => {
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    void ctx.current?.close();
    setRecording(false);
  }, []);

  const stop = useCallback((): Blob | null => {
    const audio = ctx.current;
    if (!audio) return null;
    const rate = audio.sampleRate;
    release();
    ctx.current = null;
    const total = parts.current.reduce((n, p) => n + p.length, 0);
    const all = new Float32Array(total);
    let at = 0;
    for (const p of parts.current) {
      all.set(p, at);
      at += p.length;
    }
    parts.current = [];
    return total ? encodeWav(downsample(all, rate, SPEECH_RATE), SPEECH_RATE) : null;
  }, [release]);

  const start = useCallback(async () => {
    const media = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    const audio = new AudioContext();
    const source = audio.createMediaStreamSource(media);
    // ScriptProcessor is old but runs everywhere without a separate worklet file
    const proc = audio.createScriptProcessor(4096, 1, 1);
    proc.onaudioprocess = (e) => parts.current.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    source.connect(proc);
    proc.connect(audio.destination);
    parts.current = [];
    stream.current = media;
    ctx.current = audio;
    setSeconds(0);
    setRecording(true);
    const began = Date.now();
    timer.current = window.setInterval(() => {
      const s = Math.floor((Date.now() - began) / 1000);
      setSeconds(s);
      if (s >= MAX_SECONDS) {
        const wav = stop();
        if (wav) autoStop.current?.(wav);
      }
    }, 250);
  }, [stop]);

  useEffect(() => release, [release]); // leaving the page stops the mic

  return { recording, seconds, start, stop };
}
