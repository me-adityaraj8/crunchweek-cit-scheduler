import { KeyRound, Loader2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/api/client";
import { useChangePassword } from "@/api/hooks";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Field, PasswordInput } from "@/components/ui/field";

/** Change your own password. Demo accounts share one password, so they never open this. */
export function PasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const change = useChangePassword();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState<string | null>(null);

  function setOpen(v: boolean) {
    if (!v) {
      setCurrent("");
      setNext("");
      setError(null);
    }
    onOpenChange(v);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    change.mutate(
      { current_password: current, new_password: next },
      {
        onSuccess: () => {
          setOpen(false);
          toast.success("Password changed", { description: "Use the new one next time you log in." });
        },
        onError: (err) => setError(errorMessage(err)),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent title="Change your password" description="You stay logged in on this device.">
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Field label="Current password" htmlFor="pw-current">
            <PasswordInput id="pw-current" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
          </Field>
          <Field label="New password" htmlFor="pw-new" hint="At least 8 characters.">
            <PasswordInput id="pw-new" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={8} />
          </Field>
          {error && (
            <p role="alert" className="text-[13px] font-medium text-stop">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild>
              <Button type="button">Cancel</Button>
            </DialogClose>
            <Button type="submit" variant="primary" disabled={change.isPending}>
              {change.isPending ? <Loader2 className="animate-spin" /> : <KeyRound />} Change password
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
