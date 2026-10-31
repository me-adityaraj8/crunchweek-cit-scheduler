import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-[7px] font-semibold [font-stretch:92%] transition-[background-color,color,box-shadow,transform,filter] duration-150 ease-arrive active:translate-y-px disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-ink text-sheet shadow-mount hover:bg-ink/88",
        signal: "bg-signal text-signal-ink shadow-[inset_0_-2px_0_oklch(0_0_0/0.14)] hover:brightness-[0.96]",
        outline: "border border-rule-strong bg-sheet text-ink shadow-mount hover:bg-sheet-2",
        ghost: "text-ink-2 hover:bg-ink/[0.06] hover:text-ink",
        danger: "bg-stop text-sheet hover:bg-stop/90",
        clear: "bg-clear text-sheet hover:bg-clear/90",
        board: "border border-anthracite-3 bg-anthracite-2 text-on-anthracite hover:bg-anthracite-3",
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
