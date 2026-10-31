import { useReducedMotion } from "motion/react";
import { Component, lazy, Suspense, useMemo, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Mood } from "./expression";
import type { OrbSize } from "./VeloOrb";

const VeloOrb = lazy(() => import("./VeloOrb"));

function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}

/** The still orb: used while three.js loads, and instead of it where WebGL isn't available. Same eyes and moods, no motion. */
export function StillOrb({ mood, className }: { mood: Mood; className?: string }) {
  const eye = mood === "happy" ? "h-[16%] w-[17%] rounded-t-full border-[0.11em] border-b-0 border-white bg-transparent" : mood === "error" ? "h-[6%] w-[20%] rounded-full bg-white" : "h-[30%] w-[14%] rounded-full bg-white";
  return (
    <span
      aria-hidden
      className={cn("relative grid place-items-center rounded-full", mood === "error" && "saturate-50", className)}
      style={{ background: "radial-gradient(circle at 34% 30%, #ffd6ec 0%, #ff4fa3 26%, #8b5cf6 62%, #6d1c9c 82%), radial-gradient(circle at 75% 80%, #ffad5c, transparent 55%)", backgroundBlendMode: "screen" }}
    >
      <span className="absolute left-1/2 top-[42%] flex w-[56%] -translate-x-1/2 -translate-y-1/2 justify-between" style={{ fontSize: "inherit" }}>
        <span className={cn("block", eye, mood === "confused" && "scale-y-50")} />
        <span className={cn("block", eye)} />
      </span>
    </span>
  );
}

class Fallback extends Component<{ still: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.still : this.props.children;
  }
}

/**
 * Velo's orb wherever it appears. Three.js is loaded on first use; without WebGL (or if the GPU context
 * fails) the still orb stands in. Reduced motion: the orb holds still and moods change colour and eyes only.
 */
export function OrbView({ mood, size, level, className }: { mood: Mood; size: OrbSize; level?: () => number; className?: string }) {
  const reduce = useReducedMotion() ?? false;
  const gl = useMemo(hasWebGL, []);
  const still = <StillOrb mood={mood} className="size-full" />;
  return (
    <span className={cn("relative block shrink-0", className)}>
      {gl ? (
        <Fallback still={still}>
          <Suspense fallback={still}>
            <VeloOrb mood={mood} size={size} level={level} reduced={reduce} className="!absolute inset-0" />
          </Suspense>
        </Fallback>
      ) : (
        still
      )}
    </span>
  );
}
