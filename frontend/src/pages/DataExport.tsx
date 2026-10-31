import { Database, Download, FileJson, Gavel, Loader2, NotebookPen, RotateCcw, ShieldCheck, Upload, Wand2 } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { download, errorMessage, request } from "@/api/client";
import { useDashboard, useDecideAll, useGenerateExams, useGenerateTimetable, useHealth, useResetDemo, useSummary, useUploadDataset } from "@/api/hooks";
import { Lamp, StatusChip } from "@/components/board/signals";
import { TrackProgress } from "@/components/board/TrackProgress";
import { ErrorState, Loading, PageHeader, SectionTitle } from "@/components/states";
import { Button } from "@/components/ui/button";
import { DialogContent, Dialog, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/field";
import { useAuth } from "@/lib/auth";
import { fmtDateTime, plural } from "@/lib/utils";

/** One step of the admin's pipeline. These really are a sequence, so they carry numbers. */
function Step({ n, title, status, children, action, last }: { n: number; title: string; status: ReactNode; children?: ReactNode; action?: ReactNode; last?: boolean }) {
  return (
    <li className="relative flex gap-4 pb-6 last:pb-0">
      {!last && <span aria-hidden className="absolute bottom-0 left-[15px] top-9 w-[2px] bg-rule-strong" />}
      <span className="relative z-10 grid size-8 shrink-0 place-items-center rounded-full bg-anthracite text-[13px] font-bold text-on-anthracite">{n}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-2 pt-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3 className="text-[15px] font-bold">{title}</h3>
          {status}
        </div>
        {children}
        {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
      </div>
    </li>
  );
}

function Pipeline() {
  const dash = useDashboard();
  const gen = useGenerateTimetable();
  const exams = useGenerateExams();
  const fest = useDecideAll();
  const [limit, setLimit] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [report, setReport] = useState<{ after: boolean; hard: number; soft: number } | null>(null);
  const d = dash.data;

  const check = async (after: boolean) => {
    setBusy(after ? "check-after" : "check");
    try {
      const r = await request<{ report: { hard_violation_count: number; soft_total: number } }>("/export/schedule.json", { query: { after: after ? 1 : 0, report: 1 } });
      setReport({ after, hard: r.report.hard_violation_count, soft: r.report.soft_total });
    } catch (e) {
      toast.error("Couldn't check the export", { description: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  };
  const get = async (after: boolean) => {
    setBusy(after ? "dl-after" : "dl");
    try {
      await download("/export/schedule.json", { after: after ? 1 : 0 }, after ? "schedule_after.json" : "schedule.json");
    } catch (e) {
      toast.error("Couldn't download", { description: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  };

  if (dash.isLoading) return <Loading rows={5} />;
  if (dash.isError) return <ErrorState error={dash.error} onRetry={() => dash.refetch()} />;
  return (
    <section className="sheet p-4 sm:p-6">
      <SectionTitle>From dataset to export</SectionTitle>
      <ol className="mt-2 flex flex-col">
        <Step
          n={1}
          title="Generate the timetable"
          status={d?.has_timetable ? <StatusChip aspect="clear">{d.placed} of {d.total} placed, soft {d.soft_total}</StatusChip> : <StatusChip aspect="wait">Not run</StatusChip>}
          action={
            <>
              <label className="flex items-center gap-2 text-[12.5px] text-ink-2">
                Time limit
                <Input value={limit} onChange={(e) => setLimit(e.target.value.replace(/\D/g, ""))} placeholder="default" className="h-8 w-20" inputMode="numeric" aria-label="Time limit in seconds" />
                s
              </label>
              <Button
                variant="signal"
                disabled={gen.isPending}
                onClick={() =>
                  gen.mutate(limit ? Number(limit) : undefined, {
                    onSuccess: (r) => toast.success("Timetable generated", { description: `${r.placed} of ${r.total} placed, ${plural(r.hard_count, "hard violation")}, soft ${r.soft_total}, ${(r.solve_ms / 1000).toFixed(1)} s (${r.status}).` }),
                    onError: (e) => toast.error("Couldn't generate", { description: errorMessage(e) }),
                  })
                }
              >
                {gen.isPending ? <Loader2 className="animate-spin" /> : <Wand2 />} {d?.has_timetable ? "Generate again" : "Generate"}
              </Button>
            </>
          }
        >
          <p className="text-[13px] text-ink-2">Places every session with zero hard violations, then decides Spectra week on top. Generating again replaces the live timetable.</p>
          <TrackProgress running={gen.isPending} label="Solving the week" limit={limit ? Number(limit) : undefined} />
        </Step>
        <Step
          n={2}
          title="Schedule the midsem exams"
          status={d?.exams_scheduled ? <StatusChip aspect="clear">{d.exams_scheduled} of {d.exams_total} placed</StatusChip> : <StatusChip aspect="wait">Not run</StatusChip>}
          action={
            <Button
              disabled={exams.isPending}
              onClick={() =>
                exams.mutate(undefined, {
                  onSuccess: (r) => toast.success("Exams scheduled", { description: `${r.exams.length} of ${r.total} placed, penalty ${r.penalty}.` }),
                  onError: (e) => toast.error("Couldn't schedule exams", { description: errorMessage(e) }),
                })
              }
            >
              {exams.isPending ? <Loader2 className="animate-spin" /> : <NotebookPen />} Schedule exams
            </Button>
          }
        >
          <TrackProgress running={exams.isPending} label="Placing exams" />
        </Step>
        <Step
          n={3}
          title="Decide Spectra week"
          status={d?.fest ? <StatusChip aspect="clear">Score {d.fest.booking_score} of {d.fest.booking_score_max}</StatusChip> : <StatusChip aspect="wait">Not run</StatusChip>}
          action={
            <>
              <Button
                disabled={fest.isPending || !d?.has_timetable}
                onClick={() =>
                  fest.mutate(undefined, {
                    onSuccess: (s) => toast.success("Spectra week decided", { description: `${s.approved} approved, ${s.alternatives} alternatives, ${s.rejected} rejected.` }),
                    onError: (e) => toast.error("Couldn't decide", { description: errorMessage(e) }),
                  })
                }
              >
                {fest.isPending ? <Loader2 className="animate-spin" /> : <Gavel />} Decide all
              </Button>
              <Button asChild variant="ghost">
                <Link to="/spectra">Open the board</Link>
              </Button>
            </>
          }
        />
        <Step n={4} title="Apply a change file" status={null} action={<Button asChild><Link to="/changes"><Upload /> Go to changes</Link></Button>}>
          <p className="text-[13px] text-ink-2">Upload a disruption, review the repair, apply it. The export after a change is schedule_after.json.</p>
        </Step>
        <Step
          n={5}
          last
          title="Export"
          status={null}
          action={
            <>
              <Button variant="primary" disabled={!!busy || !d?.has_timetable} onClick={() => get(false)}>
                {busy === "dl" ? <Loader2 className="animate-spin" /> : <Download />} schedule.json
              </Button>
              <Button disabled={!!busy || !d?.has_timetable} onClick={() => get(true)}>
                {busy === "dl-after" ? <Loader2 className="animate-spin" /> : <Download />} schedule_after.json
              </Button>
              <Button variant="ghost" disabled={!!busy || !d?.has_timetable} onClick={() => check(false)}>
                {busy === "check" ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Check the export
              </Button>
            </>
          }
        >
          <p className="text-[13px] text-ink-2">In the starter-pack format, ready for the official validator.</p>
          {report && (
            <p className="flex items-center gap-2 text-[13.5px]" aria-live="polite">
              <Lamp aspect={report.hard ? "stop" : "clear"} />
              {report.after ? "schedule_after.json" : "schedule.json"}: {plural(report.hard, "hard violation")}, soft penalty {report.soft}, by our checker (it mirrors the validator).
            </p>
          )}
        </Step>
      </ol>
    </section>
  );
}

function DatasetCard() {
  const { data, isLoading, isError, error, refetch } = useSummary();
  const upload = useUploadDataset();
  const reset = useResetDemo();
  const { logout } = useAuth();
  const input = useRef<HTMLInputElement>(null);
  const [confirm, setConfirm] = useState(false);
  if (isLoading) return <Loading rows={4} />;
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;
  const c = data!.counts;
  const rows: [string, number][] = [
    ["Rooms", c.rooms],
    ["Faculty", c.faculty],
    ["Student groups", c.groups],
    ["Courses", c.courses],
    ["Sessions", c.sessions],
    ["Venue requests", c.booking_requests],
    ["Exams", c.exams],
  ];
  return (
    <section className="sheet flex flex-col gap-4 p-4 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-[9px] bg-anthracite text-on-anthracite">
          <Database className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-[16px] font-bold">{data!.dataset_id}</h2>
          <p className="text-[12.5px] text-ink-2">
            {data!.institute ? `${data!.institute}. ` : ""}Loaded {fmtDateTime(data!.loaded_at)}
            {data!.applied_changes ? `, ${plural(data!.applied_changes, "change")} applied since` : ""}.
          </p>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt className="text-[12px] text-ink-3">{k}</dt>
            <dd className="text-[17px] font-bold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap gap-2 border-t border-rule pt-4">
        <Button onClick={() => input.current?.click()} disabled={upload.isPending}>
          {upload.isPending ? <Loader2 className="animate-spin" /> : <FileJson />} Load another dataset
        </Button>
        <input
          ref={input}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f)
              upload.mutate(f, {
                onSuccess: (r) => toast.success(`Loaded ${r.dataset_id}`, { description: `${r.counts.sessions} sessions, ${r.counts.rooms} rooms. Generate a timetable for it next.` }),
                onError: (err) => toast.error("That dataset wasn't loaded", { description: errorMessage(err) }),
              });
            e.target.value = "";
          }}
        />
        <Button variant="ghost" className="text-stop hover:text-stop" onClick={() => setConfirm(true)}>
          <RotateCcw /> Reset demo data
        </Button>
      </div>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent title="Reset the demo data?" description="This reloads the starter dataset and removes every timetable, exam schedule, venue request and change proposal. Demo accounts stay, but everyone is logged out.">
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button>Keep everything</Button>
            </DialogClose>
            <Button
              variant="danger"
              disabled={reset.isPending}
              onClick={() =>
                reset.mutate(undefined, {
                  onSuccess: () => {
                    setConfirm(false);
                    toast.success("Demo data reset", { description: "Log in again to carry on." });
                    logout("Demo data was reset. Log in again to carry on.");
                  },
                  onError: (e) => toast.error("Couldn't reset", { description: errorMessage(e) }),
                })
              }
            >
              {reset.isPending ? <Loader2 className="animate-spin" /> : <RotateCcw />} Reset everything
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function HealthCard() {
  const { data, isLoading, isError } = useHealth();
  return (
    <section className="sheet p-4 sm:p-6">
      <SectionTitle>System</SectionTitle>
      {isLoading ? (
        <Loading rows={3} />
      ) : isError || !data ? (
        <p className="text-[13.5px] text-stop">The API isn't answering.</p>
      ) : (
        <ul className="flex flex-col gap-2.5 text-[13.5px]">
          <li className="flex items-start gap-2.5">
            <Lamp aspect={data.ok ? "clear" : "stop"} className="mt-1.5" />
            <span>
              Solver: OR-Tools {data.ortools}, test solve in {data.solve_ms} ms
            </span>
          </li>
          <li className="flex items-start gap-2.5">
            <Lamp aspect={data.db.startsWith("ok") ? "clear" : "stop"} className="mt-1.5" />
            <span>Database: {data.db}</span>
          </li>
          <li className="flex items-start gap-2.5">
            <Lamp aspect={data.llm.startsWith("error") ? "stop" : data.llm === "configured" || data.llm === "ok" ? "clear" : "caution"} className="mt-1.5" />
            <span>Assistant: {data.llm}</span>
          </li>
        </ul>
      )}
    </section>
  );
}

export default function DataExport() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Data and export" lede="Load the dataset, run each solver, and export schedule.json for the validator." />
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Pipeline />
        <div className="flex flex-col gap-6">
          <DatasetCard />
          <HealthCard />
        </div>
      </div>
    </div>
  );
}
