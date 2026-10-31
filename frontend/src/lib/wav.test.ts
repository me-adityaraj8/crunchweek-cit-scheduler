import { describe, expect, it } from "vitest";
import { downsample, encodeWav, wavBytes } from "./wav";

const text = (v: DataView, at: number, n: number) =>
  String.fromCharCode(...Array.from({ length: n }, (_, i) => v.getUint8(at + i)));

describe("wav", () => {
  it("writes a 16-bit mono PCM header for the given rate", () => {
    expect(encodeWav(new Float32Array([0]), 16000).type).toBe("audio/wav");
    const v = new DataView(wavBytes(new Float32Array([0, 0.5, -0.5, 1]), 16000));
    expect(text(v, 0, 4)).toBe("RIFF");
    expect(text(v, 8, 4)).toBe("WAVE");
    expect(v.getUint16(22, true)).toBe(1); // mono
    expect(v.getUint32(24, true)).toBe(16000); // sample rate
    expect(v.getUint16(34, true)).toBe(16); // bits per sample
    expect(text(v, 36, 4)).toBe("data");
    expect(v.getUint32(40, true)).toBe(8); // 4 samples x 2 bytes
    expect(v.byteLength).toBe(44 + 8);
  });

  it("clips samples outside -1..1 instead of wrapping", () => {
    const v = new DataView(wavBytes(new Float32Array([2, -2]), 16000));
    expect(v.getInt16(44, true)).toBe(32767);
    expect(v.getInt16(46, true)).toBe(-32768);
  });

  it("downsamples by averaging to the target rate", () => {
    const out = downsample(new Float32Array(4800).fill(0.25), 48000, 16000);
    expect(out.length).toBe(1600);
    expect(out[0]).toBeCloseTo(0.25);
    expect(downsample(new Float32Array([1, 2]), 16000, 16000)).toEqual(new Float32Array([1, 2]));
  });
});
