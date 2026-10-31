import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import { motion } from "motion/react";
import { useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full border border-rule-strong bg-platform-2 p-[2px] transition-colors data-[state=checked]:border-ink data-[state=checked]:bg-ink",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-4 rounded-full bg-sheet shadow-mount transition-transform duration-150 ease-arrive data-[state=checked]:translate-x-4 data-[state=checked]:bg-signal" />
    </SwitchPrimitive.Root>
  );
}

export interface Segment<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
}

/** Segmented control: one choice of a few. The selected segment slides like a sign plate. */
export function Segmented<T extends string>({
  value,
  onChange,
  items,
  className,
  size = "md",
  "aria-label": ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  items: Segment<T>[];
  className?: string;
  size?: "sm" | "md";
  "aria-label": string;
}) {
  const id = useId();
  return (
    <ToggleGroupPrimitive.Root
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v as T)}
      aria-label={ariaLabel}
      className={cn("inline-flex max-w-full overflow-x-auto rounded-[9px] border border-rule-strong bg-platform-2/60 p-[3px] shadow-mount [scrollbar-width:none]", className)}
    >
      {items.map((it) => {
        const on = it.value === value;
        return (
          <ToggleGroupPrimitive.Item
            key={it.value}
            value={it.value}
            className={cn(
              "relative inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[6px] font-semibold [font-stretch:90%] transition-colors [&_svg]:size-4",
              size === "sm" ? "h-7 px-2.5 text-[12.5px]" : "h-8 px-3 text-[13px]",
              on ? "text-sheet" : "text-ink-2 hover:text-ink",
            )}
          >
            {on && (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 rounded-[6px] bg-ink"
                transition={{ type: "spring", stiffness: 500, damping: 38 }}
              />
            )}
            <span className="relative z-10 inline-flex items-center gap-1.5">
              {it.icon}
              {it.label}
            </span>
          </ToggleGroupPrimitive.Item>
        );
      })}
    </ToggleGroupPrimitive.Root>
  );
}

/** Multi-select chips (needs, days, room types). */
export function ChipToggle<T extends string>({
  values,
  onChange,
  items,
  className,
  "aria-label": ariaLabel,
}: {
  values: T[];
  onChange: (v: T[]) => void;
  items: Segment<T>[];
  className?: string;
  "aria-label": string;
}) {
  return (
    <ToggleGroupPrimitive.Root
      type="multiple"
      value={values}
      onValueChange={(v) => onChange(v as T[])}
      aria-label={ariaLabel}
      className={cn("flex flex-wrap gap-1.5", className)}
    >
      {items.map((it) => (
        <ToggleGroupPrimitive.Item
          key={it.value}
          value={it.value}
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-rule-strong bg-sheet px-3 text-[12.5px] font-semibold text-ink-2 shadow-mount transition-colors [font-stretch:90%] hover:text-ink data-[state=on]:border-ink data-[state=on]:bg-ink data-[state=on]:text-sheet [&_svg]:size-3.5"
        >
          {it.icon}
          {it.label}
        </ToggleGroupPrimitive.Item>
      ))}
    </ToggleGroupPrimitive.Root>
  );
}
