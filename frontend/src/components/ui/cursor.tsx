import { motion, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { useEffect, useState } from "react";
import { useMediaQuery } from "@/lib/hooks";

const INTERACTIVE = "a, button, [role='button'], [role='tab'], [role='radio'], [role='option'], input, select, textarea, label, summary";

/** A small ink dot that trails the mouse on a spring (after Skiper UI's "mouse follow with spring").
 * Over something you can press it opens into an outlined ring with a hard cyan shadow, like the
 * buttons. Mouse only, never on touch, off when the system asks for reduced motion, and it never
 * takes clicks. */
export function CursorFollower() {
  const fine = useMediaQuery("(hover: hover) and (pointer: fine)");
  const reduce = useReducedMotion();
  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const sx = useSpring(x, { stiffness: 500, damping: 40, mass: 0.6 });
  const sy = useSpring(y, { stiffness: 500, damping: 40, mass: 0.6 });
  const [shown, setShown] = useState(false);
  const [over, setOver] = useState(false);
  const on = fine && !reduce;

  useEffect(() => {
    if (!on) return;
    const move = (e: PointerEvent) => {
      x.set(e.clientX);
      y.set(e.clientY);
      setShown(true);
      setOver(!!(e.target as Element | null)?.closest?.(INTERACTIVE));
    };
    // the pointer left the window (no element to go to): hide until it comes back
    const out = (e: MouseEvent) => !e.relatedTarget && setShown(false);
    window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("mouseout", out);
    return () => {
      window.removeEventListener("pointermove", move);
      document.removeEventListener("mouseout", out);
    };
  }, [on, x, y]);

  if (!on) return null;
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-[100] rounded-full border-2 border-solid"
      style={{ x: sx, y: sy, translateX: "-50%", translateY: "-50%" }}
      animate={{
        width: over ? 34 : 12,
        height: over ? 34 : 12,
        opacity: shown ? 1 : 0,
        backgroundColor: over ? "color-mix(in oklch, var(--signal) 18%, transparent)" : "color-mix(in oklch, var(--ink) 80%, transparent)",
        borderColor: over ? "var(--rule-strong)" : "transparent",
        boxShadow: over ? "2px 2px 0 var(--signal)" : "0 0 0 transparent",
      }}
      transition={{ type: "spring", stiffness: 420, damping: 32 }}
      initial={false}
    />
  );
}
