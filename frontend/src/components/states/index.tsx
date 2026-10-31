import { AlertTriangle, RotateCw } from "lucide-react";
import type { ReactNode } from "react";
import { ApiError, errorMessage } from "@/api/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function PageHeader({ title, lede, actions, className }: { title: ReactNode; lede?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-3", className)}>
      <div className="min-w-0 max-w-[68ch]">
        <h1 className="text-[24px] font-bold leading-[30px] tracking-[-0.01em] sm:text-[26px]">{title}</h1>
        {lede && <p className="mt-1 text-[14px] leading-[21px] text-ink-2">{lede}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function SectionTitle({ children, aside, className }: { children: ReactNode; aside?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-3 flex items-center justify-between gap-3", className)}>
      <h2 className="text-[16px] font-bold leading-[22px]">{children}</h2>
      {aside}
    </div>
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
      {icon && <div className="grid size-11 place-items-center rounded-[10px] bg-signal text-signal-ink [&_svg]:size-5">{icon}</div>}
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
