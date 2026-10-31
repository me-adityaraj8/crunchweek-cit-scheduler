import { Wand2 } from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "@/api/client";
import { useGenerateTimetable } from "@/api/hooks";
import { TrackProgress } from "@/components/board/TrackProgress";
import { Empty } from "@/components/states";
import { Button } from "@/components/ui/button";
import { useUser } from "@/lib/auth";
import { plural } from "@/lib/utils";

/** Shown wherever a page needs a timetable that doesn't exist yet. Only the Admin can generate. */
export function GenerateCard() {
  const user = useUser();
  const gen = useGenerateTimetable();
  const admin = user.role === "admin";
  return (
    <Empty
      icon={<Wand2 />}
      title="No timetable yet"
      action={
        admin && (
          <div className="flex w-full max-w-md flex-col gap-3">
            <Button
              variant="signal"
              size="lg"
              className="self-start"
              disabled={gen.isPending}
              onClick={() =>
                gen.mutate(undefined, {
                  onSuccess: (r) =>
                    toast.success("Timetable generated", {
                      description: `${r.placed} of ${r.total} sessions placed, ${plural(r.hard_count, "hard violation")}, soft penalty ${r.soft_total}.`,
                    }),
                  onError: (e) => toast.error("Couldn't generate the timetable", { description: errorMessage(e) }),
                })
              }
            >
              <Wand2 /> Generate timetable
            </Button>
            <TrackProgress running={gen.isPending} label="Solving the week" />
          </div>
        )
      }
    >
      {admin
        ? "Generate one from the loaded dataset. The solver places every session without breaking a hard rule, then decides Spectra week on top of it. It takes about half a minute."
        : "The Admin hasn't generated this week's timetable yet. Check back once they have."}
    </Empty>
  );
}
