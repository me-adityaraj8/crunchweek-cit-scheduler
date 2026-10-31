import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

function Overlay() {
  return (
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/45 data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in" />
  );
}

export function DialogContent({
  className,
  children,
  title,
  description,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & { title: ReactNode; description?: ReactNode }) {
  return (
    <DialogPrimitive.Portal>
      <Overlay />
      <DialogPrimitive.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 w-[min(520px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-[6px] border-2 border-rule-strong bg-sheet p-6 shadow-[8px_8px_0_var(--shade)] data-[state=closed]:animate-pop-out data-[state=open]:animate-pop-in",
          className,
        )}
        {...props}
      >
        <DialogPrimitive.Title className="pr-8 text-[19px] font-black leading-6 [font-stretch:106%]">{title}</DialogPrimitive.Title>
        {description ? (
          <DialogPrimitive.Description className="mt-1.5 text-[13.5px] text-ink-2">{description}</DialogPrimitive.Description>
        ) : (
          <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
        )}
        <div className="mt-5">{children}</div>
        <DialogPrimitive.Close className="absolute right-4 top-4 grid size-8 place-items-center rounded-[4px] border-2 border-transparent text-ink-2 transition-colors hover:border-rule-strong hover:bg-signal hover:text-signal-ink">
          <X className="size-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/** Side drawer on desktop, bottom sheet on phones. */
export function Drawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  wide,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  wide?: boolean;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <Overlay />
        <DialogPrimitive.Content
          className={cn(
            "fixed z-50 flex flex-col border-2 border-rule-strong bg-sheet shadow-float",
            "inset-x-0 bottom-0 max-h-[88dvh] rounded-t-[6px] data-[state=closed]:animate-sheet-down data-[state=open]:animate-sheet-up",
            "md:inset-y-2 md:left-auto md:right-2 md:max-h-none md:rounded-[6px] md:shadow-[8px_8px_0_var(--shade)] md:data-[state=closed]:animate-drawer-out md:data-[state=open]:animate-drawer-in",
            wide ? "md:w-[min(640px,calc(100vw-16px))]" : "md:w-[min(460px,calc(100vw-16px))]",
            className,
          )}
        >
          <div className="flex items-start gap-3 border-b-2 border-rule-strong px-5 pb-4 pt-5">
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="text-[18px] font-black leading-6 [font-stretch:106%]">{title}</DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description asChild>
                  <div className="mt-1 text-[13px] text-ink-2">{description}</div>
                </DialogPrimitive.Description>
              ) : (
                <DialogPrimitive.Description className="sr-only">Details</DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close className="grid size-8 shrink-0 place-items-center rounded-[4px] border-2 border-transparent text-ink-2 transition-colors hover:border-rule-strong hover:bg-signal hover:text-signal-ink">
              <X className="size-4" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
