import { Bot, CalendarX2, FileUp, GitCompareArrows, Loader2, Send, Upload } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { ApiError, errorMessage } from "@/api/client";
import { useChanges, useParseChange, useRequestChange, useSummary, useUnavailability, useUploadChangeFile } from "@/api/hooks";
import type { ChangeIntent, ChangeParse, Proposal } from "@/api/types";
import { StatusChip } from "@/components/board/signals";
import { TrackProgress } from "@/components/board/TrackProgress";
import { GenerateCard } from "@/components/dashboard/GenerateCard";
import { Empty, ErrorState, Loading, PageHeader, SectionTitle } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { Field, Input, Textarea } from "@/components/ui/field";
import { useUser } from "@/lib/auth";
import { PROPOSAL_KIND, proposalStatus } from "@/lib/format";
import { dayShort, periodLabel, periodRange } from "@/lib/time";
import { cn, fmtDateTime, plural } from "@/lib/utils";

/** Upload a change file in the starter-pack format. */
function UploadChangeFile() {
  const upload = useUploadChangeFile();
  const nav = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const send = (file?: File | null) => {
    if (!file) return;
    upload.mutate(file, {
      onSuccess: (p) => {
        toast.success(p.status === "infeasible" ? "No valid fix for this change" : "Repair proposal ready", {
          description: p.status === "infeasible" ? "See which constraints conflict." : `${plural(p.moved, "session")} moved. Review and apply it.`,
        });
        nav(`/changes/${p.id}`);
      },
      onError: (e) => toast.error("Couldn't read that change file", { description: errorMessage(e) }),
    });
  };
  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    send(e.dataTransfer.files?.[0]);
  };
  return (
    <section className="sheet flex flex-col gap-3 p-4 sm:p-5">
      <SectionTitle>Apply a change file</SectionTitle>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={drop}
        disabled={upload.isPending}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-[10px] border-2 border-dashed border-rule-strong px-4 py-8 text-center transition-colors hover:border-ink hover:bg-signal-soft",
          over && "border-ink bg-signal-soft",
        )}
      >
        <span className="grid size-10 place-items-center rounded-[9px] bg-signal text-signal-ink">
          <FileUp className="size-5" />
        </span>
        <span className="text-[14px] font-semibold">Drop a change file here, or choose one</span>
        <span className="text-[12.5px] text-ink-2">JSON in the starter-pack format: faculty away, rooms closed, sessions added or removed</span>
      </button>
      <input ref={input} type="file" accept="application/json,.json" className="sr-only" onChange={(e) => send(e.target.files?.[0])} />
      <TrackProgress running={upload.isPending} label="Repairing with the fewest moves" />
      <p className="text-[12.5px] text-ink-2">Nothing changes until you review the proposal and apply it.</p>
    </section>
  );
}

/** Faculty marks periods they can't teach by tapping a grid. */
function Unavailability() {
  const { data: summary } = useSummary();
  const nav = useNavigate();
  const mark = useUnavailability();
  const [cells, setCells] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState("");
  const days = summary?.days ?? [];
  const ps = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const toggle = (k: string) => setCells((c) => {
    const n = new Set(c);
    n.has(k) ? n.delete(k) : n.add(k);
    return n;
  });
  const chosen = [...cells].map((k) => k.split("-")) as [string, string][];
  const daysSel = [...new Set(chosen.map(([d]) => d))];
  const periodsSel = [...new Set(chosen.map(([, p]) => Number(p)))].sort((a, b) => a - b);
  // the API takes days x periods: every chosen period on every chosen day
  const full = daysSel.length * periodsSel.length;
  const submit = () =>
    mark.mutate(
      { days: daysSel, periods: periodsSel, reason },
      {
        onSuccess: (p) => {
          toast.success(p.status === "infeasible" ? "No valid fix" : "Request sent to the Admin", {
            description: p.status === "infeasible" ? "See which constraints conflict." : `${plural(p.moved, "class", "classes")} would move.`,
          });
          nav(`/changes/${p.id}`);
        },
        onError: (e) => toast.error("Couldn't send it", { description: errorMessage(e) }),
      },
    );
  return (
    <section className="sheet flex flex-col gap-4 p-4 sm:p-5">
      <div>
        <SectionTitle>Mark time you can't teach</SectionTitle>
        <p className="-mt-2 text-[13px] text-ink-2">Select the periods. The solver finds the fewest classes to move, and the Admin approves.</p>
      </div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[420px] gap-1" style={{ gridTemplateColumns: `44px repeat(${ps.length}, minmax(0,1fr))` }} role="grid" aria-label="Periods you can't teach">
          <span />
          {ps.map((p) => (
            <span key={p} className="text-center text-[11px] font-bold text-ink-3 [font-stretch:80%]">
              P{p}
              <span className="block font-normal">{periodLabel(p, summary?.periods)}</span>
            </span>
          ))}
          {days.map((d) => (
            <div key={d} className="contents" role="row">
              <button type="button" className="text-left text-[12.5px] font-bold [font-stretch:85%] hover:underline" onClick={() => ps.forEach((p) => !cells.has(`${d}-${p}`) && toggle(`${d}-${p}`))}>
                {dayShort(d)}
              </button>
              {ps.map((p) => {
                const k = `${d}-${p}`;
                const on = cells.has(k);
                return (
                  <button
                    key={p}
                    type="button"
                    role="gridcell"
                    aria-pressed={on}
                    aria-label={`${d} P${p}`}
                    onClick={() => toggle(k)}
                    className={cn("h-8 rounded-[5px] border transition-colors", on ? "hatch-closed border-ink bg-stop-soft" : "border-rule-strong bg-sheet hover:bg-signal-soft")}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      {full > cells.size && (
        <p className="text-[12.5px] text-ink-2">Requests cover every selected period on every selected day ({full} periods in all).</p>
      )}
      <Field label="Reason" htmlFor="u-reason">
        <Input id="u-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Conference travel" maxLength={200} />
      </Field>
      <Button variant="primary" className="self-start" disabled={!cells.size || mark.isPending} onClick={submit}>
        {mark.isPending ? <Loader2 className="animate-spin" /> : <CalendarX2 />} Send to the Admin
      </Button>
      <TrackProgress running={mark.isPending} label="Working out the fewest moves" />
    </section>
  );
}

function intentText(i: ChangeIntent) {
  if (i.type === "faculty_unavailable")
    return `${i.faculty_id ?? "You"} can't teach ${i.days.map(dayShort).join(", ")} ${i.periods.length ? periodRange(Math.min(...i.periods), Math.max(...i.periods)) : ""}`;
  if (i.type === "move_session") return `Move ${i.session_id}${i.target ? ` to ${dayShort(i.target.day)} P${i.target.start} in ${i.target.room}` : ""}`;
  if (i.type === "remove_session") return `Remove ${i.session_id}`;
  return `Add ${(i.session as { id?: string } | null)?.id ?? "a session"}`;
}

/** Plain-language change request: the assistant reads it, the person confirms, the solver proposes. */
function AskForChange() {
  const parse = useParseChange();
  const request = useRequestChange();
  const nav = useNavigate();
  const [text, setText] = useState("");
  const [result, setResult] = useState<ChangeParse | null>(null);
  const read = () =>
    parse.mutate(
      { text },
      {
        onSuccess: setResult,
        onError: (e) => toast.error("Couldn't read that", { description: errorMessage(e) }),
      },
    );
  const confirm = () =>
    result?.intent &&
    request.mutate(result.intent, {
      onSuccess: (p) => {
        toast.success(p.status === "infeasible" ? "No valid fix" : "Proposal ready", { description: `${plural(p.moved, "session")} would move.` });
        nav(`/changes/${p.id}`);
      },
      onError: (e) => toast.error("Couldn't make the proposal", { description: errorMessage(e) }),
    });
  return (
    <section className="sheet flex flex-col gap-3 p-4 sm:p-5">
      <SectionTitle>Ask for a change</SectionTitle>
      <p className="-mt-2 text-[13px] text-ink-2">Say it the way you'd tell a colleague. You'll see what was understood before anything is sent.</p>
      <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="I can't take Monday 8 AM classes from next week, move my first-year lecture" maxLength={2000} />
      <Button className="self-start" variant="primary" disabled={!text.trim() || parse.isPending} onClick={read}>
        {parse.isPending ? <Loader2 className="animate-spin" /> : <Bot />} Read my request
      </Button>
      {result && (
        <div className="rounded-[10px] border border-rule-strong bg-sheet-2 p-3.5" aria-live="polite">
          {result.llm === "unavailable" && <p className="mb-1.5 text-[12px] font-semibold text-ink-2">AI unavailable, so keyword rules read this</p>}
          {result.intent ? (
            <>
              <p className="text-[12px] text-ink-3">Understood as</p>
              <p className="text-[15px] font-bold">{intentText(result.intent)}</p>
              {result.intent.reason && <p className="text-[13px] text-ink-2">Reason: {result.intent.reason}</p>}
            </>
          ) : (
            <p className="text-[13.5px] font-semibold">{result.follow_up ?? "I couldn't tell what to change."}</p>
          )}
          {result.notes.filter((n) => !n.startsWith("Filled in by simple keyword rules")).length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-[12.5px] text-ink-2">
              {result.notes
                .filter((n) => !n.startsWith("Filled in by simple keyword rules"))
                .map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
            </ul>
          )}
          {result.intent && (
            <Button className="mt-3" variant="signal" disabled={request.isPending} onClick={confirm}>
              {request.isPending ? <Loader2 className="animate-spin" /> : <Send />} Make the proposal
            </Button>
          )}
          <TrackProgress running={request.isPending} label="Working out the fewest moves" className="mt-3" />
        </div>
      )}
    </section>
  );
}

function ProposalList({ list }: { list: Proposal[] }) {
  if (!list.length) return <p className="sheet p-4 text-[13.5px] text-ink-2">No proposals here.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {list.map((p) => {
        const s = proposalStatus(p.status);
        return (
          <li key={p.id}>
            <Link to={`/changes/${p.id}`} className={cn("sheet flex flex-wrap items-center gap-x-4 gap-y-2 p-4 transition-shadow hover:shadow-[0_0_0_1px_var(--ink)]", p.status === "pending" && !p.stale && "shadow-[inset_4px_0_0_var(--signal),var(--mount)]")}>
              <span className="w-10 text-[13px] font-bold tabular-nums text-ink-3">#{p.id}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14.5px] font-semibold">{p.title}</span>
                <span className="block truncate text-[12.5px] text-ink-2">
                  {PROPOSAL_KIND[p.kind] ?? p.kind} from {p.requested_by_name}, {fmtDateTime(p.created_at)}
                  {p.status !== "infeasible" && `. ${plural(p.moved, "session")} moved, soft ${p.soft_before} → ${p.soft_after}`}
                </span>
              </span>
              {p.stale && p.status === "pending" && <span className="text-[12px] font-semibold text-stop">Out of date</span>}
              <StatusChip aspect={s.aspect}>{s.label}</StatusChip>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export default function Changes() {
  const user = useUser();
  const [params] = useSearchParams();
  const [tab, setTab] = useState<"pending" | "all">("pending");
  const q = useChanges();
  const noTimetable = q.error instanceof ApiError && q.error.code === "no_timetable";
  const isNew = params.get("new");
  const list = (q.data ?? []).filter((p) => tab === "all" || p.status === "pending");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Changes"
        lede="Disruptions and requests become proposals. The repair solver moves as few sessions as possible, and nothing changes until the Admin applies it."
      />
      {noTimetable ? (
        <GenerateCard />
      ) : (
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <div className="order-2 flex flex-col gap-3 lg:order-1">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[16px] font-bold">{user.role === "admin" ? "Proposals" : "Your requests"}</h2>
              <Segmented aria-label="Filter proposals" size="sm" value={tab} onChange={setTab} items={[{ value: "pending", label: "Waiting" }, { value: "all", label: "All" }]} />
            </div>
            {q.isLoading ? (
              <Loading rows={4} />
            ) : q.isError ? (
              <ErrorState error={q.error} onRetry={() => q.refetch()} />
            ) : !q.data?.length ? (
              <Empty icon={user.role === "admin" ? <Upload /> : <GitCompareArrows />} title="No changes yet">
                {user.role === "admin" ? "Upload a change file to see how the timetable would repair." : "Requests you make appear here with the Admin's decision."}
              </Empty>
            ) : (
              <ProposalList list={list} />
            )}
          </div>
          <div className="order-1 flex flex-col gap-6 lg:order-2">
            {user.role === "admin" && <UploadChangeFile />}
            {user.role === "faculty" && (isNew !== "ask" ? <Unavailability /> : null)}
            {(user.role === "faculty" || user.role === "coordinator" || user.role === "admin") && <AskForChange />}
            {user.role === "faculty" && isNew === "ask" && <Unavailability />}
          </div>
        </div>
      )}
    </div>
  );
}
