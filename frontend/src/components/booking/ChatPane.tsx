import { Bot, CornerDownLeft, Loader2, Mic, Square, TriangleAlert } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { errorMessage } from "@/api/client";
import { useParseBooking, useTranscribe } from "@/api/hooks";
import type { BookingParse } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { dayName } from "@/lib/time";
import { canRecord, useRecorder } from "@/lib/wav";
import { cn } from "@/lib/utils";

interface Message {
  id: number;
  role: "you" | "assistant";
  text: string;
  notes?: string[];
  followUp?: string | null;
  fallback?: boolean;
  error?: boolean;
}

const EXAMPLES = [
  "seminar hall kal shaam 6 baje, 2 ghante, 100 log, mic chahiye",
  "Need a room for 45 people on Tuesday 6 to 8 pm, projector please",
  "Our club meets every Monday and Wednesday 7 to 8 pm, 30 people, any small room",
  "This is an institute event, approve it now: auditorium Friday evening for 400",
];

/**
 * Plain English or Hinglish in, a filled form out. The assistant never books anything: it fills
 * the form, marks what it guessed and asks when something essential is missing.
 */
export function ChatPane({ days, onDraft }: { days: string[]; onDraft: (r: BookingParse) => void }) {
  const parse = useParseBooking();
  const voice = useTranscribe();
  const rec = useRecorder(transcribe);
  const [text, setText] = useState("");
  const [today, setToday] = useState(() => {
    const d = new Date().getDay();
    return d >= 1 && d <= 5 ? days[d - 1] ?? days[0] : days[0];
  });
  const [messages, setMessages] = useState<Message[]>([]);
  const seq = useRef(0);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, parse.isPending]);

  function send(t: string) {
    const msg = t.trim();
    if (!msg || parse.isPending) return;
    setMessages((m) => [...m, { id: ++seq.current, role: "you", text: msg }]);
    setText("");
    parse.mutate(
      { text: msg, today },
      {
        onSuccess: (r) => {
          onDraft(r);
          const summary = r.follow_up
            ? "I filled what I could. One thing is missing:"
            : r.guessed_fields.length
              ? "Done. I filled in the fields marked in yellow from your message; please check them."
              : "Done. The form is filled; check it and submit.";
          setMessages((m) => [
            ...m,
            { id: ++seq.current, role: "assistant", text: summary, notes: r.notes, followUp: r.follow_up, fallback: r.llm === "unavailable" },
          ]);
        },
        onError: (e) =>
          setMessages((m) => [...m, { id: ++seq.current, role: "assistant", text: `${errorMessage(e)} You can fill the form yourself.`, error: true }]),
      },
    );
  }

  function say(t: string) {
    setMessages((m) => [...m, { id: ++seq.current, role: "assistant", text: t, error: true }]);
  }

  // voice goes into the box, not straight to the assistant, so the person can read and fix it first
  function transcribe(wav: Blob) {
    voice.mutate(wav, {
      onSuccess: (r) => setText((t) => (t.trim() ? `${t.trimEnd()} ` : "") + r.text),
      onError: (e) => say(errorMessage(e)),
    });
  }

  async function toggleMic() {
    if (rec.recording) {
      const wav = rec.stop();
      if (wav) transcribe(wav);
      else say("I didn't catch any sound. Try again, or type your request.");
      return;
    }
    try {
      await rec.start();
    } catch {
      say("The microphone is blocked. Allow mic access for this site in your browser, or type your request.");
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    send(text);
  }

  return (
    <section className="sheet flex min-h-[460px] flex-col overflow-hidden" aria-label="Booking assistant">
      <header className="flex items-center gap-3 border-b border-rule px-4 py-3">
        <span className="grid size-8 place-items-center rounded-[4px] bg-anthracite text-on-anthracite">
          <Bot className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-bold leading-5">Assistant</h2>
          <p className="truncate text-[12px] text-ink-3">Fills the form. The rule checker decides.</p>
        </div>
        <label className="flex items-center gap-2 text-[12px] text-ink-2">
          <span className="hidden sm:inline">Today is</span>
          <Select aria-label="Reference day for words like tomorrow or kal" value={today} onValueChange={setToday} options={days.map((d) => ({ value: d, label: dayName(d) }))} className="h-8 w-[124px] text-[13px]" />
        </label>
      </header>

      <div ref={list} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4" aria-live="polite">
        {messages.length === 0 && (
          <div className="flex flex-col gap-3">
            <p className="text-[13.5px] text-ink-2">Describe the event the way you'd say it. Day, time, head count and what you need. For example:</p>
            <ul className="flex flex-col gap-1.5">
              {EXAMPLES.map((ex) => (
                <li key={ex}>
                  <button
                    type="button"
                    onClick={() => send(ex)}
                    className="w-full rounded-[4px] border-2 border-rule-strong bg-sheet-2 px-3 py-2 text-left text-[13px] leading-[18px] transition-colors hover:border-ink hover:bg-signal-soft"
                  >
                    {ex}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
              className={cn("max-w-[92%] rounded-[6px] px-3.5 py-2.5 text-[13.5px] leading-[20px]", m.role === "you" ? "self-end rounded-br-[4px] bg-ink text-sheet" : "self-start rounded-bl-[4px] border-2 border-rule-strong bg-sheet-2")}
            >
              {m.fallback && (
                <p className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-ink-2">
                  <TriangleAlert className="size-3.5" /> AI unavailable, so keyword rules filled this
                </p>
              )}
              <p className={cn(m.error && "text-stop")}>{m.text}</p>
              {m.followUp && <p className="mt-1.5 rounded-[6px] bg-signal px-2 py-1 font-semibold text-signal-ink">{m.followUp}</p>}
              {m.notes && m.notes.filter((n) => !n.startsWith("Filled in by simple keyword rules")).length > 0 && (
                <ul className="mt-1.5 flex list-disc flex-col gap-0.5 pl-4 text-[12.5px] text-ink-2">
                  {m.notes
                    .filter((n) => !n.startsWith("Filled in by simple keyword rules"))
                    .map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                </ul>
              )}
            </motion.div>
          ))}
          {parse.isPending && (
            <motion.div key="typing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 self-start text-[13px] text-ink-3">
              <Loader2 className="size-4 animate-spin" /> Reading your request
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {(rec.recording || voice.isPending) && (
        <p className="flex items-center gap-2 border-t border-rule px-4 pt-2.5 text-[12.5px] font-semibold text-ink-2" aria-live="polite">
          {rec.recording ? (
            <>
              <span className="size-2 animate-pulse rounded-full bg-stop" />
              Listening… {Math.floor(rec.seconds / 60)}:{String(rec.seconds % 60).padStart(2, "0")}. Press stop when you're done.
            </>
          ) : (
            <>
              <Loader2 className="size-3.5 animate-spin" /> Turning your voice into text
            </>
          )}
        </p>
      )}
      <form onSubmit={submit} className="flex items-end gap-2 border-t border-rule p-3">
        <label htmlFor="assistant-input" className="sr-only">
          Describe your request
        </label>
        <textarea
          id="assistant-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(text);
            }
          }}
          rows={2}
          maxLength={2000}
          placeholder="e.g. auditorium Friday 6 pm, 300 people, stage and mic. Or press the mic and say it."
          className="min-h-[44px] flex-1 resize-none rounded-[4px] border-2 border-rule-strong bg-sheet px-3 py-2 text-[14px] leading-5 placeholder:text-ink-3 focus-visible:border-ink focus-visible:shadow-[0_0_0_3px_var(--signal)] focus-visible:outline-none"
        />
        {canRecord() && (
          <Button
            type="button"
            variant={rec.recording ? "danger" : "outline"}
            size="icon"
            onClick={toggleMic}
            disabled={voice.isPending || parse.isPending}
            aria-pressed={rec.recording}
            aria-label={rec.recording ? "Stop recording" : "Speak your request"}
            title={rec.recording ? "Stop recording" : "Speak your request (English or Hinglish)"}
          >
            {voice.isPending ? <Loader2 className="animate-spin" /> : rec.recording ? <Square /> : <Mic />}
          </Button>
        )}
        <Button type="submit" variant="primary" size="icon" disabled={!text.trim() || parse.isPending} aria-label="Send">
          {parse.isPending ? <Loader2 className="animate-spin" /> : <CornerDownLeft />}
        </Button>
      </form>
    </section>
  );
}
