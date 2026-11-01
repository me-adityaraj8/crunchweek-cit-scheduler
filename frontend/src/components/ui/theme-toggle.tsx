import { MoonStar, SunMedium } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { ComponentProps, MouseEvent } from "react";
import { flushSync } from "react-dom";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/** The theme button: the new theme grows out of the button in a circle (View Transitions, where the
 * browser has them and motion is allowed), and the icon turns over. Elsewhere it simply switches. */
export function ThemeToggle({ className, onClick: onClickProp, ...props }: ComponentProps<"button">) {
  const { theme, toggle } = useTheme();

  function onClick(e: MouseEvent<HTMLButtonElement>) {
    onClickProp?.(e);
    const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };
    if (!doc.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) return toggle();
    const { left, top, width, height } = e.currentTarget.getBoundingClientRect();
    const x = left + width / 2;
    const y = top + height / 2;
    const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const vt = doc.startViewTransition(() => {
      // switch the class here as well: the provider's effect would land after the snapshot
      document.documentElement.classList.toggle("dark", theme !== "dark");
      flushSync(toggle);
    });
    vt.ready.then(() =>
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
        { duration: 520, easing: "cubic-bezier(.65,0,.35,1)", pseudoElement: "::view-transition-new(root)" },
      ),
    );
  }

  return (
    <button
      {...props}
      onClick={onClick}
      className={cn("press grid size-11 shrink-0 place-items-center overflow-hidden rounded-[4px] border-2 border-rule-strong bg-sheet text-ink shadow-float", className)}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={theme}
          initial={{ rotate: -90, y: 14, opacity: 0 }}
          animate={{ rotate: 0, y: 0, opacity: 1 }}
          exit={{ rotate: 90, y: -14, opacity: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 24 }}
          className="grid place-items-center"
        >
          {theme === "dark" ? <SunMedium className="size-[18px]" /> : <MoonStar className="size-[18px]" />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
