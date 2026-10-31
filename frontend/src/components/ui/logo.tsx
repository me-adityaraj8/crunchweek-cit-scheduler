import { useId } from "react";
import { cn } from "@/lib/utils";

// the four-point star: rounded tips, pinched sides, and a hollow star of the same shape inside
const STAR = "M50 21 C53 21 55 23 56.5 26 L60 33.5 C61.5 36.5 63.5 38.5 66.5 40 L74 43.5 C77 45 79 47 79 50 C79 53 77 55 74 56.5 L66.5 60 C63.5 61.5 61.5 63.5 60 66.5 L56.5 74 C55 77 53 79 50 79 C47 79 45 77 43.5 74 L40 66.5 C38.5 63.5 36.5 61.5 33.5 60 L26 56.5 C23 55 21 53 21 50 C21 47 23 45 26 43.5 L33.5 40 C36.5 38.5 38.5 36.5 40 33.5 L43.5 26 C45 23 47 21 50 21 Z";
const HOLE = "M50 39 C51.5 44.5 55.5 48.5 61 50 C55.5 51.5 51.5 55.5 50 61 C48.5 55.5 44.5 51.5 39 50 C44.5 48.5 48.5 44.5 50 39 Z";

/** The Velora mark: a four-point star on a rounded tile that casts a hard shadow. Colours come from
 * the theme (paper tile, ink outline, the shadow token), so it reads in daylight and Night Shift.
 * `framed={false}` draws the star alone, for places that already sit on a plate. */
export function Logo({ size = 40, framed = true, className, title = "Velora" }: { size?: number; framed?: boolean; className?: string; title?: string }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={title} className={cn("shrink-0", className)}>
      <defs>
        <linearGradient id={`${id}-shade`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0.35" stopColor="var(--sheet)" />
          <stop offset="1" stopColor="var(--sheet-2)" />
        </linearGradient>
      </defs>
      {framed && (
        <>
          <rect x="10" y="10" width="84" height="84" rx="24" fill="var(--shade)" />
          <rect x="4" y="4" width="84" height="84" rx="24" fill="var(--sheet)" stroke="var(--rule-strong)" strokeWidth="4" />
        </>
      )}
      <g transform={framed ? "translate(-4 -4)" : undefined}>
        <path d={`${STAR} ${HOLE}`} fillRule="evenodd" fill={`url(#${id}-shade)`} stroke="var(--rule-strong)" strokeWidth="4" strokeLinejoin="round" />
        <path d="M36 41.5 C42 42 46 46 47 52 M64 58.5 C58 58 54 54 53 48" fill="none" stroke="var(--rule-strong)" strokeWidth="3" strokeLinecap="round" opacity="0.35" />
      </g>
    </svg>
  );
}
