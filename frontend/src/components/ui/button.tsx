import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-[4px] border-2 border-rule-strong font-bold [font-stretch:96%] disabled:pointer-events-none disabled:border-dashed disabled:opacity-50 disabled:shadow-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "press glow bg-signal text-signal-ink shadow-mount",
        signal: "press glow bg-signal text-signal-ink shadow-mount",
        outline: "press bg-sheet text-ink shadow-mount hover:bg-sheet-2",
        ghost: "border-transparent text-ink-2 transition-colors hover:bg-ink/[0.06] hover:text-ink",
        danger: "press bg-stop text-sheet shadow-mount",
        clear: "press bg-clear text-sheet shadow-mount",
        board: "border-on-anthracite-2 bg-anthracite-2 text-on-anthracite transition-colors hover:bg-anthracite-3",
      },
      size: {
        sm: "h-8 px-3 text-[13px]",
        md: "h-9 px-4 text-[13.5px]",
        lg: "h-11 px-5 text-[15px]",
        icon: "size-9",
        "icon-sm": "size-8",
      },
    },
    defaultVariants: { variant: "outline", size: "md" },
  },
);

export interface ButtonProps extends ComponentProps<"button">, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
