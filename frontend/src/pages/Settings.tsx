import { ArrowDown, ArrowUp, GripVertical, Loader2, Save } from "lucide-react";
import { Reorder, useDragControls } from "motion/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/api/client";
import { usePutSettings, useSettings, useSummary } from "@/api/hooks";
import { People } from "@/components/account/People";
import { Code } from "@/components/board/signals";
import { ErrorState, Loading, PageHeader, SectionTitle } from "@/components/states";
import { Button } from "@/components/ui/button";
import { ChipToggle } from "@/components/ui/controls";
import { categoryLabel } from "@/lib/format";

const PRIORITY_LABEL: Record<string, string> = { exam: "Exams", regular_session: "Regular classes" };
const label = (k: string) => PRIORITY_LABEL[k] ?? categoryLabel(k);

function PriorityItem({ id, i, n, move }: { id: string; i: number; n: number; move: (from: number, to: number) => void }) {
  const drag = useDragControls();
  return (
    <Reorder.Item
      value={id}
      dragListener={false}
      dragControls={drag}
      className="flex items-center gap-3 rounded-[9px] border border-rule-strong bg-sheet px-2 py-2 shadow-mount"
      whileDrag={{ scale: 1.02, boxShadow: "0 0 0 2px var(--ink), 0 10px 24px -12px rgb(0 0 0 / 0.4)" }}
    >
      <button
        type="button"
        aria-label={`Drag ${label(id)}`}
        onPointerDown={(e) => drag.start(e)}
        className="grid size-8 cursor-grab touch-none place-items-center rounded-[6px] text-ink-3 hover:bg-ink/[0.06] active:cursor-grabbing"
      >
        <GripVertical className="size-4" />
      </button>
      <span className="grid size-7 place-items-center rounded-full bg-anthracite text-[12px] font-bold tabular-nums text-on-anthracite">{i + 1}</span>
      <span className="flex-1 text-[14px] font-semibold">{label(id)}</span>
      <Button size="icon-sm" variant="ghost" aria-label={`Move ${label(id)} up`} disabled={i === 0} onClick={() => move(i, i - 1)}>
        <ArrowUp />
      </Button>
      <Button size="icon-sm" variant="ghost" aria-label={`Move ${label(id)} down`} disabled={i === n - 1} onClick={() => move(i, i + 1)}>
        <ArrowDown />
      </Button>
    </Reorder.Item>
  );
}

export default function Settings() {
  const q = useSettings();
  const { data: summary } = useSummary();
  const save = usePutSettings();
  const [order, setOrder] = useState<string[]>([]);
  const [owners, setOwners] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (q.data) {
      setOrder(q.data.priority_order);
      setOwners(q.data.lab_owners);
    }
  }, [q.data]);

  if (q.isLoading) return <Loading rows={6} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;

  const move = (from: number, to: number) => {
    const next = [...order];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    setOrder(next);
  };
  const dirty = JSON.stringify(order) !== JSON.stringify(q.data!.priority_order) || JSON.stringify(owners) !== JSON.stringify(q.data!.lab_owners);
  const labs = summary?.rooms.filter((r) => r.id in owners || r.type.startsWith("lab") || r.type === "workshop") ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Settings"
        lede="Rules the code follows when it decides. Changes apply to the next decision; run Spectra week again to re-decide with them."
        actions={
          <Button
            variant="primary"
            disabled={!dirty || save.isPending}
            onClick={() =>
              save.mutate(
                { priority_order: order, lab_owners: owners },
                {
                  onSuccess: () => toast.success("Settings saved", { description: "Decide Spectra week again to apply the new order." }),
                  onError: (e) => toast.error("Couldn't save", { description: errorMessage(e) }),
                },
              )
            }
          >
            {save.isPending ? <Loader2 className="animate-spin" /> : <Save />} Save changes
          </Button>
        }
      />
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <section className="sheet p-4 sm:p-5">
          <SectionTitle>Priority order</SectionTitle>
          <p className="-mt-2 mb-4 text-[13px] text-ink-2">Higher wins a clash. Ties go to whoever asked first. Drag a row or use the arrows.</p>
          <Reorder.Group axis="y" values={order} onReorder={setOrder} className="flex flex-col gap-2">
            {order.map((id, i) => (
              <PriorityItem key={id} id={id} i={i} n={order.length} move={move} />
            ))}
          </Reorder.Group>
        </section>
        <section className="sheet p-4 sm:p-5">
          <SectionTitle>Who approves lab bookings</SectionTitle>
          <p className="-mt-2 mb-4 text-[13px] text-ink-2">A booking of one of these labs waits for a coordinator of the departments chosen. If that coordinator made the booking, it goes to the Admin.</p>
          <ul className="flex flex-col divide-y divide-rule">
            {labs.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
                <div className="flex w-44 shrink-0 items-center gap-2">
                  <Code>{r.id}</Code>
                  <span className="truncate text-[12.5px] text-ink-2">{r.name}</span>
                </div>
                <ChipToggle
                  aria-label={`Departments that approve ${r.id}`}
                  values={owners[r.id] ?? []}
                  onChange={(v) => setOwners({ ...owners, [r.id]: v })}
                  items={(summary?.departments ?? []).filter((d) => d !== "COMMON" && d !== "ADMIN").map((d) => ({ value: d, label: d }))}
                />
              </li>
            ))}
          </ul>
        </section>
      </div>
      <People />
    </div>
  );
}
