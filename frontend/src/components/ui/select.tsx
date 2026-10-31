import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface Option {
  value: string;
  label: ReactNode;
  hint?: ReactNode;
  group?: string;
}

/** A labelled native-feeling select. Options can be grouped by `group`. */
export function Select({
  value,
  onValueChange,
  options,
  placeholder = "Choose",
  className,
  id,
  disabled,
  "aria-label": ariaLabel,
}: {
  value: string | undefined;
  onValueChange: (v: string) => void;
  options: Option[];
  placeholder?: string;
  className?: string;
  id?: string;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  const groups = [...new Set(options.map((o) => o.group ?? ""))];
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectPrimitive.Trigger
        id={id}
        aria-label={ariaLabel}
        className={cn(
          "inline-flex h-9 w-full items-center justify-between gap-2 rounded-[7px] border border-rule-strong bg-sheet px-3 text-left text-[14px] text-ink shadow-mount transition-[border-color,box-shadow] focus-visible:border-ink focus-visible:shadow-[0_0_0_3px_var(--signal)] focus-visible:outline-none data-[placeholder]:text-ink-3 disabled:opacity-50",
          className,
        )}
      >
        <span className="truncate">
          <SelectPrimitive.Value placeholder={placeholder} />
        </span>
        <SelectPrimitive.Icon>
          <ChevronDown className="size-4 text-ink-3" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          className="z-50 max-h-[min(380px,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-[10px] bg-sheet shadow-float data-[state=closed]:animate-pop-out data-[state=open]:animate-pop-in"
        >
          <SelectPrimitive.Viewport className="p-1">
            {groups.map((g) => (
              <SelectPrimitive.Group key={g}>
                {g && (
                  <SelectPrimitive.Label className="px-2.5 pb-1 pt-2 text-[11.5px] font-semibold text-ink-3 [font-stretch:88%]">
                    {g}
                  </SelectPrimitive.Label>
                )}
                {options
                  .filter((o) => (o.group ?? "") === g)
                  .map((o) => (
                    <SelectItem key={o.value} value={o.value} hint={o.hint}>
                      {o.label}
                    </SelectItem>
                  ))}
              </SelectPrimitive.Group>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

function SelectItem({ children, hint, className, ...props }: ComponentProps<typeof SelectPrimitive.Item> & { hint?: ReactNode }) {
  return (
    <SelectPrimitive.Item
      className={cn(
        "relative flex cursor-default select-none items-center gap-2 rounded-[6px] py-1.5 pl-2.5 pr-8 text-[13.5px] text-ink outline-none data-[highlighted]:bg-signal-soft data-[disabled]:opacity-40",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      {hint && <span className="ml-auto text-[12px] text-ink-3">{hint}</span>}
      <SelectPrimitive.ItemIndicator className="absolute right-2">
        <Check className="size-4" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}
