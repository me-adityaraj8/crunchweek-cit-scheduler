import * as LabelPrimitive from "@radix-ui/react-label";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

const control =
  "w-full rounded-[7px] border border-rule-strong bg-sheet px-3 text-[14px] text-ink shadow-mount placeholder:text-ink-3 transition-[border-color,box-shadow] duration-150 focus-visible:border-ink focus-visible:shadow-[0_0_0_3px_var(--signal)] focus-visible:outline-none aria-[invalid=true]:border-stop disabled:opacity-50";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input data-slot="input" className={cn(control, "h-9", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea data-slot="textarea" className={cn(control, "min-h-20 resize-y py-2 leading-5", className)} {...props} />;
}

export function Label({ className, ...props }: ComponentProps<typeof LabelPrimitive.Root>) {
  return <LabelPrimitive.Root className={cn("text-[13px] font-semibold text-ink [font-stretch:92%]", className)} {...props} />;
}

/** Label, control and an optional hint/error under it. `guessed` marks a value the assistant inferred. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  guessed,
  children,
  className,
  aside,
}: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: ReactNode;
  guessed?: boolean;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)} data-guessed={guessed || undefined}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={htmlFor} className="flex items-center gap-2">
          {label}
          {guessed && (
            <span className="rounded-[4px] bg-signal px-1.5 py-px text-[11px] font-bold text-signal-ink [font-stretch:85%]">
              guessed, check it
            </span>
          )}
        </Label>
        {aside}
      </div>
      <div className={cn(guessed && "rounded-[8px] ring-2 ring-signal ring-offset-2 ring-offset-sheet")}>{children}</div>
      {error ? (
        <p className="text-[12.5px] font-medium text-stop">{error}</p>
      ) : hint ? (
        <p className="text-[12.5px] text-ink-3">{hint}</p>
      ) : null}
    </div>
  );
}
