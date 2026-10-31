import { motion, useReducedMotion } from "motion/react";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The departure board as a printed sheet: ruled rows, caps headers, fixed columns. `columns` is a CSS grid
 * template shared by the header and every row, so columns line up like a real board.
 */
export function Board({
  title,
  meta,
  columns,
  headers,
  children,
  className,
  footer,
}: {
  title?: ReactNode;
  meta?: ReactNode;
  columns: string;
  headers: ReactNode[];
  children: ReactNode;
  className?: string;
  footer?: ReactNode;
}) {
  return (
    <section
      className={cn("overflow-hidden rounded-sheet border-2 border-rule-strong bg-sheet text-ink shadow-float", className)}
      style={{ "--board-cols": columns } as CSSProperties}
    >
      {(title || meta) && (
        <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b-2 border-rule-strong bg-sheet-2 px-4 py-3 sm:px-5">
          {title && <h2 className="text-[15px] font-extrabold uppercase tracking-[0.06em]">{title}</h2>}
          {meta && <div className="flex items-center gap-3 text-[12.5px] text-ink-2">{meta}</div>}
        </header>
      )}
      <div role="table" className="text-[13px]">
        <div
          role="row"
          className="label-caps hidden gap-3 border-b-2 border-rule-strong px-4 py-2 text-ink-3 sm:grid sm:px-5"
          style={{ gridTemplateColumns: "var(--board-cols)" }}
        >
          {headers.map((h, i) => (
            <span role="columnheader" key={i}>
              {h}
            </span>
          ))}
        </div>
        <div role="rowgroup">{children}</div>
      </div>
      {footer && <footer className="border-t-2 border-rule px-4 py-3 text-[12.5px] text-ink-2 sm:px-5">{footer}</footer>}
    </section>
  );
}

/** One board row. On phones the cells stack; on wider screens they follow the board's columns. */
export function BoardRow({
  children,
  index = 0,
  onClick,
  active,
  className,
  highlight,
}: {
  children: ReactNode;
  index?: number;
  onClick?: () => void;
  active?: boolean;
  highlight?: boolean;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const Comp = onClick ? motion.button : motion.div;
  return (
    <Comp
      role="row"
      type={onClick ? "button" : undefined}
      onClick={onClick}
      initial={reduce ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, delay: reduce ? 0 : Math.min(index, 14) * 0.028, ease: [0.2, 0.8, 0.2, 1] }}
      className={cn(
        "grid w-full grid-cols-2 items-center gap-x-3 gap-y-1.5 border-b-2 border-rule px-4 py-2.5 text-left last:border-b-0 sm:gap-y-0 sm:px-5 sm:[grid-template-columns:var(--board-cols)]",
        onClick && "transition-colors hover:bg-sheet-2 focus-visible:bg-sheet-2",
        active && "bg-signal-soft shadow-[inset_4px_0_0_var(--signal)]",
        highlight && "shadow-[inset_3px_0_0_var(--signal)]",
        className,
      )}
    >
      {children}
    </Comp>
  );
}

/** Board text: condensed caps like the printed strips on a station board. */
export function BoardText({ children, dim, className }: { children: ReactNode; dim?: boolean; className?: string }) {
  return (
    <span
      role="cell"
      className={cn(
        "min-w-0 truncate font-mono font-medium uppercase tracking-[0.02em]",
        dim && "font-medium text-ink-2",
        className,
      )}
    >
      {children}
    </span>
  );
}
