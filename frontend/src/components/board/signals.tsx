import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import type { Kind } from "@/api/types";
import { KIND, type Aspect } from "@/lib/format";
import { cn } from "@/lib/utils";

const LAMP: Record<Aspect, string> = {
  clear: "bg-clear",
  caution: "bg-caution ring-1 ring-inset ring-ink/30",
  stop: "bg-stop",
  wait: "bg-transparent ring-[1.5px] ring-inset ring-wait",
  off: "bg-wait/40",
};

/** A signal lamp: the one place status colour appears, always next to a word. */
export function Lamp({ aspect, className }: { aspect: Aspect; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2.5 shrink-0 rounded-full", LAMP[aspect], className)} />;
}

export function StatusChip({ aspect, children, className }: { aspect: Aspect; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-[3px] border-2 px-2 text-[12px] font-bold [font-stretch:94%]",
        aspect === "clear" && "border-rule-strong bg-clear-soft text-ink",
        aspect === "caution" && "border-rule-strong bg-caution-soft text-ink",
        aspect === "stop" && "border-rule-strong bg-stop-soft text-ink",
        aspect === "wait" && "border-rule-strong bg-wait-soft text-ink-2",
        aspect === "off" && "border-rule bg-transparent text-ink-3 line-through decoration-ink-3/60",
        className,
      )}
    >
      <Lamp aspect={aspect} className="size-2" />
      {children}
    </span>
  );
}

const BULLET: Record<Kind, string> = {
  lecture: "bg-k-lecture text-k-on",
  tutorial: "bg-k-tutorial text-k-on",
  lab: "bg-k-lab text-k-on",
  exam: "bg-k-exam text-k-on",
  event: "bg-k-event text-k-on",
};

/** Route-bullet for a session kind: the letter carries it, the colour reinforces it. */
export function KindBullet({ kind, size = "md", className }: { kind: Kind; size?: "sm" | "md" | "lg"; className?: string }) {
  return (
    <span
      title={KIND[kind].label}
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-full font-bold leading-none [font-stretch:80%]",
        size === "sm" && "size-4 text-[9.5px]",
        size === "md" && "size-[18px] text-[10.5px]",
        size === "lg" && "size-6 text-[13px]",
        BULLET[kind],
        className,
      )}
    >
      {KIND[kind].letter}
      <span className="sr-only"> {KIND[kind].label}</span>
    </span>
  );
}

/** Ticket-validation stamp for approvals and rejections. */
export function Stamp({ tone, children, className }: { tone: "clear" | "stop"; children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.7, rotate: -14 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, rotate: -6 }}
      transition={reduce ? { duration: 0.12 } : { type: "spring", stiffness: 520, damping: 22, mass: 0.7 }}
      className={cn(
        "pointer-events-none inline-flex flex-col items-center rounded-[6px] border-[2.5px] px-3 py-1 text-center font-black uppercase leading-tight tracking-[0.08em] [font-stretch:80%]",
        tone === "clear" ? "border-clear text-clear" : "border-stop text-stop",
        className,
      )}
      style={{ maskImage: "radial-gradient(circle at 30% 40%, black 60%, rgb(0 0 0 / 0.82) 100%)" }}
    >
      {children}
    </motion.div>
  );
}

/** Small key/value in a sign plate. */
export function Plate({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-0.5", className)}>
      <span className="text-[11.5px] font-medium text-ink-3 [font-stretch:90%]">{label}</span>
      <span className="truncate text-[14px] font-semibold tabular-nums">{children}</span>
    </div>
  );
}

/** A code shown the way signage shows platform numbers: condensed, bold, boxed. */
export function Code({ children, className, tone = "plain" }: { children: ReactNode; className?: string; tone?: "plain" | "signal" | "board" }) {
  return (
    <span
      className={cn(
        "inline-flex h-[20px] items-center whitespace-nowrap rounded-[4px] px-1.5 text-[12px] font-bold tabular-nums leading-none [font-stretch:78%]",
        tone === "plain" && "bg-ink/[0.07] text-ink",
        tone === "signal" && "bg-signal text-signal-ink",
        tone === "board" && "bg-anthracite-3 text-on-anthracite",
        className,
      )}
    >
      {children}
    </span>
  );
}
