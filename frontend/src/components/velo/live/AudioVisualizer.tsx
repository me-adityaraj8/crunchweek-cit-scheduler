import { useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

const BARS = 36;

/**
 * The live audio as mirrored bars: the mic's spectrum while listening, Velo's voice while speaking.
 * When there is no spectrum (the browser's voice, or nothing playing) it draws a single line whose
 * height follows the measured level, so it never shows a waveform that isn't there.
 */
export function AudioVisualizer({ spectrum, level, className }: { spectrum: (out: Uint8Array<ArrayBuffer>) => boolean; level: () => number; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const reduce = useReducedMotion();
  useEffect(() => {
    const c = canvas.current;
    const g = c?.getContext("2d");
    if (!c || !g) return;
    const bins = new Uint8Array(new ArrayBuffer(512));
    const smooth = new Float32Array(BARS);
    let raf = 0;
    const draw = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = c.clientWidth;
      const h = c.clientHeight;
      if (c.width !== w * dpr) {
        c.width = w * dpr;
        c.height = h * dpr;
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const grad = g.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, "#8b5cf6");
      grad.addColorStop(0.5, "#ff4fa3");
      grad.addColorStop(1, "#ffad5c");
      g.fillStyle = grad;
      const has = spectrum(bins);
      const gap = 3;
      const bw = (w - gap * (BARS - 1)) / BARS;
      for (let i = 0; i < BARS; i++) {
        // speech lives in the low half of the spectrum; fold it so the middle bars are the strongest
        const d = Math.abs(i - (BARS - 1) / 2) / (BARS / 2);
        const v = has ? bins[Math.floor(d * 90) + 2] / 255 : level() * (1 - d * 0.85);
        smooth[i] += (v - smooth[i]) * (reduce ? 1 : 0.35);
        const bh = Math.max(2, smooth[i] * h * 0.95);
        g.globalAlpha = 0.45 + smooth[i] * 0.55;
        g.beginPath();
        g.roundRect(i * (bw + gap), (h - bh) / 2, bw, bh, Math.min(bw / 2, 3));
        g.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [spectrum, level, reduce]);
  return <canvas ref={canvas} aria-hidden className={cn("block", className)} />;
}
