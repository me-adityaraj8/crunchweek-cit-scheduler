import * as DropdownPrimitive from "@radix-ui/react-dropdown-menu";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

const floating =
  "z-50 rounded-[10px] bg-sheet text-ink shadow-float data-[state=closed]:animate-pop-out data-[state=open]:animate-pop-in";

// ---------------------------------------------------------------- tooltip
export const TooltipProvider = TooltipPrimitive.Provider;

export function Tip({ label, children, side = "top" }: { label: ReactNode; children: ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className="z-50 max-w-72 rounded-[7px] bg-anthracite px-2.5 py-1.5 text-[12.5px] leading-[17px] text-on-anthracite data-[state=closed]:animate-fade-out data-[state=delayed-open]:animate-fade-in"
        >
          {label}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

// ---------------------------------------------------------------- popover
export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;

export function PopoverContent({ className, align = "start", ...props }: ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content align={align} sideOffset={6} className={cn(floating, "p-3", className)} {...props} />
    </PopoverPrimitive.Portal>
  );
}

// ---------------------------------------------------------------- dropdown menu
export const Menu = DropdownPrimitive.Root;
export const MenuTrigger = DropdownPrimitive.Trigger;

export function MenuContent({ className, align = "end", ...props }: ComponentProps<typeof DropdownPrimitive.Content>) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.Content align={align} sideOffset={6} className={cn(floating, "min-w-52 p-1", className)} {...props} />
    </DropdownPrimitive.Portal>
  );
}

export function MenuItem({ className, ...props }: ComponentProps<typeof DropdownPrimitive.Item>) {
  return (
    <DropdownPrimitive.Item
      className={cn(
        "flex cursor-default select-none items-center gap-2.5 rounded-[6px] px-2.5 py-2 text-[13.5px] outline-none data-[highlighted]:bg-signal-soft data-[disabled]:opacity-40 [&_svg]:size-4 [&_svg]:text-ink-3",
        className,
      )}
      {...props}
    />
  );
}

export function MenuLabel({ className, ...props }: ComponentProps<typeof DropdownPrimitive.Label>) {
  return <DropdownPrimitive.Label className={cn("px-2.5 py-2 text-[12.5px] text-ink-3", className)} {...props} />;
}

export function MenuSeparator() {
  return <DropdownPrimitive.Separator className="my-1 h-px bg-rule" />;
}
