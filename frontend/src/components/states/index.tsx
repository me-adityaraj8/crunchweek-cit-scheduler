import { AlertTriangle, RotateCw } from "lucide-react";
import type { ReactNode } from "react";
import { ApiError, errorMessage } from "@/api/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** The page's name in heavy caps, a plain-language line under it, and its main actions on the right.
 * `eyebrow` is a small mono line above the title (kept for pages that name a context, like a group). */
export function PageHeader({ title, lede, eyebrow, actions, className }: { title: ReactNode; lede?: ReactNode; eyebrow?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="min-w-0 max-w-[720px]">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="text-[32px] font-black uppercase leading-none tracking-[-0.035em] sm:text-[44px] xl:text-[52px]">{title}</h1>
        {lede && <p className="mt-2.5 text-[15px] leading-[1.45] text-ink-2 sm:text-[16px]">{lede}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </header>
  );
}

export function SectionTitle({ children, aside, className }: { children: ReactNode; aside?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-3 flex items-center justify-between gap-3", className)}>
      <h2 className="text-[15px] font-extrabold uppercase leading-[22px] tracking-[0.06em]">{children}</h2>
      {aside}
    </div>
  );
}

/** A card with an optional coloured header strip (the boards' section pattern). `tint` is any
 * background class, e.g. "bg-k-event-tint"; without it the header is a plain ruled row. */
export function Panel({
  title,
  aside,
  tint,
  children,
  className,
  bodyClassName,
  shadow = "float",
}: {
  title?: ReactNode;
  aside?: ReactNode;
  tint?: string;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  shadow?: "float" | "panel" | "none";
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-sheet border-2 border-rule-strong bg-sheet",
        shadow === "float" && "shadow-float",
        shadow === "panel" && "shadow-panel",
        className,
      )}
    >
      {title && (
        <div className={cn("flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b-2 border-rule-strong px-[18px] py-3.5", tint ?? "bg-sheet")}>
          <h2 className="text-[15px] font-extrabold uppercase tracking-[0.06em] text-ink">{title}</h2>
          {aside && <div className="text-[13px] font-bold text-ink">{aside}</div>}
        </div>
      )}
      <div className={cn("p-[18px]", bodyClassName)}>{children}</div>
    </section>
  );
}

/** Skeleton rows shaped like the content that is loading. */
export function Loading({ rows = 6, className, label = "Loading" }: { rows?: number; className?: string; label?: string }) {
  return (
    <div className={cn("flex flex-col gap-2", className)} role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton h-10" style={{ animationDelay: `${i * 60}ms`, opacity: 1 - i * 0.08 }} />
      ))}
    </div>
  );
}

export function GridSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("sheet grid grid-cols-[48px_repeat(5,1fr)] gap-1.5 p-3", className)} role="status" aria-label="Loading timetable">
      {Array.from({ length: 6 * 9 }, (_, i) => (
        <div key={i} className={cn("skeleton h-12", i % 6 === 0 && "w-10 opacity-60")} style={{ animationDelay: `${(i % 6) * 70}ms` }} />
      ))}
    </div>
  );
}

/** An empty state is an invitation to act: say what's missing and what to do. */
export function Empty({ icon, title, children, action, className }: { icon?: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("sheet flex flex-col items-start gap-3 p-6 sm:p-8", className)}>
      {icon && <div className="grid size-11 place-items-center rounded-[6px] bg-signal text-signal-ink [&_svg]:size-5">{icon}</div>}
      <div className="max-w-[60ch]">
        <h2 className="text-[17px] font-bold">{title}</h2>
        {children && <div className="mt-1 text-[14px] leading-[21px] text-ink-2">{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  const msg = errorMessage(error);
  const code = error instanceof ApiError ? error.status : undefined;
  return (
    <div className={cn("sheet flex flex-col items-start gap-3 border-stop/40 p-6", className)} role="alert">
      <div className="flex items-center gap-2 font-semibold text-stop">
        <AlertTriangle className="size-4" />
        {code === 403 ? "Not available for your account" : code === 0 ? "Server unreachable" : "Couldn't load this"}
      </div>
      <p className="max-w-[60ch] text-[14px] text-ink-2">{msg}</p>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          <RotateCw /> Try again
        </Button>
      )}
    </div>
  );
}

/** Inline problem list: rule code plus its text, used under forms and in proposals. */
export function RuleList({ items, className }: { items: { rule?: string; code?: string; text?: string; detail?: string }[]; className?: string }) {
  return (
    <ul className={cn("flex flex-col gap-1.5", className)}>
      {items.map((v, i) => (
        <li key={i} className="flex items-start gap-2 text-[13px] leading-[19px]">
          <span className="mt-[1px] inline-flex h-[18px] shrink-0 items-center rounded-[4px] bg-stop px-1.5 text-[11px] font-bold text-sheet [font-stretch:80%]">
            {v.rule ?? v.code}
          </span>
          <span className="text-ink">{v.detail ?? v.text}</span>
        </li>
      ))}
    </ul>
  );
}
