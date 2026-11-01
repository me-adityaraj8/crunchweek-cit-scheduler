import { Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useSearchParams } from "react-router";
import { toast } from "sonner";
import { ApiError, errorMessage } from "@/api/client";
import { useBookings, useCancelBooking, useSummary } from "@/api/hooks";
import type { Booking, BookingParse, PartialDraft } from "@/api/types";
import { StatusChip } from "@/components/board/signals";
import { BookingForm } from "@/components/booking/BookingForm";
import { ChatPane } from "@/components/booking/ChatPane";
import { emptyForm, guessedSet, mergeDraft, type FormState } from "@/components/booking/draft";
import { GenerateCard } from "@/components/dashboard/GenerateCard";
import { useVeloFocus } from "@/components/velo/VeloProvider";
import { ErrorState, Loading, PageHeader, SectionTitle } from "@/components/states";
import { Button } from "@/components/ui/button";
import { bookingStatus, categoryLabel } from "@/lib/format";
import { dayShort, periodEnd, periodLabel } from "@/lib/time";
import { cn, fmtDateTime } from "@/lib/utils";

function RequestRow({ b, highlight }: { b: Booking; highlight: boolean }) {
  const { data: summary } = useSummary();
  const cancel = useCancelBooking();
  const s = bookingStatus(b.status);
  const d = b.decision;
  return (
    <li
      id={`req-${b.id}`}
      className={cn("grid gap-x-4 gap-y-2 px-4 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:px-5", highlight && "bg-signal-soft shadow-[inset_3px_0_0_var(--signal)]")}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-[4px] bg-ink/[0.07] px-1.5 text-[12px] font-bold [font-stretch:80%]">{b.id}</span>
          <span className="truncate text-[14px] font-semibold">{b.title}</span>
          <StatusChip aspect={s.aspect}>{s.label}</StatusChip>
        </div>
        <p className="mt-1 text-[13px] text-ink-2">
          {d?.day && d.start_period != null && d.end_period != null
            ? `${dayShort(d.day)} ${periodLabel(d.start_period, summary?.periods)}–${periodEnd(d.end_period, summary?.periods)} in ${d.room_id}. `
            : ""}
          {b.reason}
        </p>
        <p className="mt-0.5 text-[12px] text-ink-3">
          {b.week === "regular" ? "Regular week" : "Spectra week"} · {categoryLabel(b.category)}
          {b.category !== b.requested_category ? ` (asked for ${categoryLabel(b.requested_category).toLowerCase()})` : ""}, {b.attendance} people, sent {fmtDateTime(b.submitted_at)}
          {b.approver ? `. Needs approval from ${b.approver}` : ""}
        </p>
      </div>
      {b.can_cancel && (
        <Button
          size="sm"
          variant="ghost"
          className="self-start"
          disabled={cancel.isPending}
          onClick={() =>
            cancel.mutate(b.id, {
              onSuccess: () => toast.success(`${b.id} cancelled`, { description: "The slot is free again and the other requests were re-decided." }),
              onError: (e) => toast.error("Couldn't cancel", { description: errorMessage(e) }),
            })
          }
        >
          {cancel.isPending ? <Loader2 className="animate-spin" /> : <X />} Cancel request
        </Button>
      )}
    </li>
  );
}

function MyRequests({ highlight }: { highlight: string | null }) {
  const { data, isLoading, isError, error, refetch } = useBookings(true);
  useEffect(() => {
    if (highlight && data) document.getElementById(`req-${highlight}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlight, data]);
  return (
    <section>
      <SectionTitle>Your requests</SectionTitle>
      {isLoading ? (
        <Loading rows={3} />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : !data?.length ? (
        <p className="sheet p-4 text-[13.5px] text-ink-2">Nothing yet. Submitted requests appear here with the decision and the reason for it.</p>
      ) : (
        <ul className="sheet divide-y divide-rule overflow-hidden p-0">
          {data.map((b) => (
            <RequestRow key={b.id} b={b} highlight={b.id === highlight} />
          ))}
        </ul>
      )}
    </section>
  );
}

export default function Book() {
  const { data: summary, isLoading, isError, error, refetch } = useSummary();
  const [params] = useSearchParams();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [guessed, setGuessed] = useState<Set<string>>(new Set());
  const { error: bookingsError } = useBookings(true);

  // a free cell picked on "Find a room" arrives as ?room=&day=&from=&to=
  useEffect(() => {
    const room = params.get("room");
    const day = params.get("day");
    const from = Number(params.get("from"));
    const to = Number(params.get("to") || from);
    if (!summary || !day || !from) return;
    const r = summary.rooms.find((x) => x.id === room);
    setForm((f) => ({
      ...f,
      windows: [{ day, from_period: from, to_period: Math.max(to, from) }],
      duration: Math.max(1, Math.min(6, to - from + 1)),
      requested_room: r?.allowed_uses.includes("event") ? r.id : f.requested_room,
      room_types: r?.allowed_uses.includes("event") ? [r.type] : f.room_types,
    }));
  }, [params, summary]);

  const [filled, setFilled] = useState(0);
  const location = useLocation();
  const request = params.get("request");
  useVeloFocus(request ? { kind: "request", id: request } : null);

  // a draft Velo handed over with "Open in the form"
  const handed = (location.state as { draft?: PartialDraft; guessed?: string[] } | null)?.draft;
  useEffect(() => {
    if (!handed) return;
    setForm(mergeDraft(emptyForm(), handed));
    setGuessed(guessedSet((location.state as { guessed?: string[] }).guessed ?? []));
    setFilled((n) => n + 1);
  }, [handed, location.state]);

  const onDraft = (r: BookingParse) => {
    setForm((f) => mergeDraft(f, r.draft));
    setGuessed(guessedSet(r.guessed_fields));
    setFilled((n) => n + 1);
  };

  const noTimetable = bookingsError instanceof ApiError && bookingsError.code === "no_timetable";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Book a venue"
        lede="Venue requests for Spectra week or a regular teaching week. Write it in plain English or Hinglish, or fill the form yourself. The code checks every change as you make it, and decides by priority when you submit."
      />
      {isLoading ? (
        <Loading rows={8} />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : noTimetable ? (
        <GenerateCard />
      ) : summary ? (
        <>
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="lg:sticky lg:top-20">
              <ChatPane days={summary.days} onDraft={onDraft} />
            </div>
            <BookingForm
              form={form}
              setForm={(f) => {
                // once a guessed field is edited, it's the person's value, not a guess
                setGuessed((g) => {
                  const next = new Set(g);
                  for (const k of g) {
                    const key = k as keyof FormState;
                    if (JSON.stringify(f[key]) !== JSON.stringify(form[key])) next.delete(k);
                  }
                  return next;
                });
                setForm(f);
              }}
              guessed={guessed}
              summary={summary}
              filled={filled}
              onReset={() => {
                setForm(emptyForm());
                setGuessed(new Set());
              }}
            />
          </div>
          <MyRequests highlight={params.get("request")} />
        </>
      ) : null}
    </div>
  );
}
