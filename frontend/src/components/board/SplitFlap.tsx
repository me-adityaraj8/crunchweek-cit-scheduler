import { useReducedMotion } from "motion/react";
import { memo, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const CHARSET = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const MAX_STEPS = 7;
const STEP_MS = 66;

export type FlapTone = "board" | "clear" | "stop" | "caution" | "wait" | "ink";

/** The characters a tile shows on its way from `from` to `to`, at most MAX_STEPS of them. */
export function flapPath(from: string, to: string): string[] {
  if (from === to) return [];
  const a = CHARSET.indexOf(from);
  const b = CHARSET.indexOf(to);
  if (a < 0 || b < 0) return [to];
  const dist = (b - a + CHARSET.length) % CHARSET.length;
  const steps = Math.min(dist, MAX_STEPS);
  const out: string[] = [];
  for (let i = steps - 1; i >= 0; i--) out.push(CHARSET[(b - i + CHARSET.length) % CHARSET.length]);
  return out;
}

interface TileState {
  shown: string;
  /** the character the lower half still shows while a flap is falling */
  prev: string;
  step: number;
}

const Tile = memo(function Tile({ char, delay, tone, still }: { char: string; delay: number; tone: FlapTone; still: boolean }) {
  const [st, setSt] = useState<TileState>(() => {
    const c = still ? char : " ";
    return { shown: c, prev: c, step: 0 };
  });
  const shownRef = useRef(st.shown);

  useEffect(() => {
    const settle = () => setSt((s) => (s.prev === s.shown ? s : { ...s, prev: s.shown }));
    if (still) {
      shownRef.current = char;
      setSt((s) => ({ shown: char, prev: char, step: s.step }));
      return;
    }
    const path = flapPath(shownRef.current, char);
    if (!path.length) return;
    const timers = path.map((c, i) =>
      window.setTimeout(() => {
        const from = shownRef.current;
        shownRef.current = c;
        setSt((s) => ({ shown: c, prev: from, step: s.step + 1 }));
      }, delay + i * STEP_MS),
    );
    // timers, not animationend: background tabs skip CSS animations, and a stale lower half would misread
    timers.push(window.setTimeout(settle, delay + path.length * STEP_MS + 30));
    return () => {
      timers.forEach(clearTimeout);
      settle();
    };
  }, [char, delay, still]);

  const flipping = st.prev !== st.shown;
  return (
    <span className="flap" data-tone={tone === "board" ? undefined : tone} aria-hidden>
      <span className="t">
        <i>{st.shown}</i>
      </span>
      <span className="b">
        <i>{st.prev}</i>
      </span>
      {flipping && (
        <>
          <span key={`ft${st.step}`} className="ft">
            <i>{st.prev}</i>
          </span>
          <span key={`fb${st.step}`} className="fb">
            <i>{st.shown}</i>
          </span>
        </>
      )}
    </span>
  );
});

/**
 * Text on split-flap tiles. When `value` changes every tile flips through the alphabet to its new
 * character, left to right. Reduced motion shows the new value at once.
 */
export function SplitFlap({
  value,
  length,
  tone = "board",
  delay = 0,
  className,
  stagger = 22,
  label,
}: {
  value: string;
  /** pad or cut to a fixed number of tiles so columns line up */
  length?: number;
  tone?: FlapTone;
  delay?: number;
  stagger?: number;
  className?: string;
  /** accessible text when the board shows a code */
  label?: string;
}) {
  const reduce = useReducedMotion();
  const text = value.toUpperCase();
  const chars = (length ? text.padEnd(length).slice(0, length) : text).split("");
  return (
    <span className={cn("inline-flex whitespace-pre leading-none", className)} role="img" aria-label={label ?? value}>
      {chars.map((c, i) => (
        <Tile key={i} char={c} delay={delay + i * stagger} tone={tone} still={!!reduce} />
      ))}
    </span>
  );
}
