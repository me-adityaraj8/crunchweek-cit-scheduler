import * as LabelPrimitive from "@radix-ui/react-label";
import { Eye, EyeOff } from "lucide-react";
import { useState, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const control =
  "w-full rounded-[4px] border-2 border-rule-strong bg-sheet px-3 text-[15px] font-medium text-ink placeholder:font-normal placeholder:text-ink-3 transition-[background-color,box-shadow] duration-150 focus-visible:bg-signal-faint focus-visible:shadow-lift focus-visible:outline-none aria-[invalid=true]:bg-stop-input aria-[invalid=true]:shadow-[3px_3px_0_var(--stop-vivid)] disabled:opacity-50";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input data-slot="input" className={cn(control, "h-11", className)} {...props} />;
}

/** Password box with a show/hide button, so people can check what they typed (on a phone especially). */
export function PasswordInput({ className, ...props }: Omit<ComponentProps<"input">, "type">) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <Input type={shown ? "text" : "password"} className={cn("pr-10", className)} {...props} />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        className="absolute inset-y-[2px] right-[2px] grid w-9 place-items-center rounded-r-[2px] text-ink-2 transition-colors hover:bg-signal-soft hover:text-ink focus-visible:bg-signal-soft focus-visible:text-ink focus-visible:outline-none"
      >
        {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea data-slot="textarea" className={cn(control, "min-h-20 resize-y py-2.5 leading-[1.4]", className)} {...props} />;
}

export function Label({ className, ...props }: ComponentProps<typeof LabelPrimitive.Root>) {
  return <LabelPrimitive.Root className={cn("text-[12px] font-extrabold uppercase tracking-[0.06em] text-ink", className)} {...props} />;
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
            <span className="rounded-[3px] border-2 border-rule-strong bg-signal px-1.5 py-px text-[10px] font-extrabold tracking-[0.06em] text-signal-ink">
              AUTO-FILLED · CHECK
            </span>
          )}
        </Label>
        {aside}
      </div>
      <div>{children}</div>
      {error ? (
        <p className="text-[12.5px] font-medium text-stop">{error}</p>
      ) : hint ? (
        <p className="text-[12.5px] text-ink-3">{hint}</p>
      ) : null}
    </div>
  );
}
