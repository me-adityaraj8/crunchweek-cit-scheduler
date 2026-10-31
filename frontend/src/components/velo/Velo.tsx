import { AudioLines, CornerDownLeft, Loader2, Maximize2, Minimize2, RotateCcw, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useLocation } from "react-router";
import type { VeloOut } from "@/api/types";
import { useUser } from "@/lib/auth";
import { useMediaQuery } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { VeloCards } from "./cards";
import { contextChips, contextLabel, starters } from "./context";
import { OrbView, StillOrb } from "./live/OrbView";
import { useVelo, type Msg } from "./VeloProvider";

const EASE = [0.23, 1, 0.32, 1] as const;

/** A message avatar: the orb, still, so a long thread costs nothing. */
function Avatar({ className }: { className?: string }) {
  return <StillOrb mood="idle" className={cn("size-7 shrink-0 text-[7px]", className)} />;
}

/** The floating launcher on every signed-in page. */
export function VeloLauncher() {
  const { open, setOpen, unread, pending, mood, voiceOpen } = useVelo();
  const reduce = useReducedMotion();
  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  return (
    <AnimatePresence>
      {!open && !voiceOpen && (
        <motion.button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Ask Velo"
          initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.16, ease: EASE }}
          className="press fixed bottom-7 right-7 z-50 hidden items-center gap-2.5 rounded-[6px] border-2 border-rule-strong bg-sheet p-1.5 pr-3.5 text-ink shadow-float md:flex"
        >
          <OrbView mood={mood} size="mini" className="size-10" />
          <span className="text-[14px] font-black [font-stretch:104%]">Ask Velo</span>
          <kbd className="hidden rounded-[3px] border-2 border-rule-strong px-1 text-[10.5px] font-bold text-ink-2 lg:inline">{mac ? "⌘J" : "Ctrl J"}</kbd>
          {(unread || pending) && (
            <span className="absolute -right-1.5 -top-1.5 grid size-4 place-items-center rounded-[3px] border-2 border-rule-strong bg-mark" aria-label={pending ? "Velo is working" : "New answer"}>
              {pending && <Loader2 className="size-2.5 animate-spin" />}
            </span>
          )}
        </motion.button>
      )}
    </AnimatePresence>
  );
}

/** On phones Velo lives in the top bar, so it never covers a page's own buttons. */
export function VeloPhoneButton({ className }: { className?: string }) {
  const { setOpen, unread, pending, open, voiceOpen, mood } = useVelo();
  return (
    <button type="button" onClick={() => setOpen(true)} aria-label="Ask Velo" className={cn("press relative flex h-10 items-center gap-1.5 rounded-[4px] border-2 border-rule-strong bg-sheet pl-1 pr-2.5 text-[13px] font-black text-ink shadow-mount md:hidden", className)}>
      {open || voiceOpen ? <StillOrb mood="idle" className="size-7 text-[7px]" /> : <OrbView mood={mood} size="mini" className="size-7" />}
      Velo
      {(unread || pending) && <span className="absolute -right-1.5 -top-1.5 size-3 rounded-[2px] border-2 border-rule-strong bg-mark" aria-hidden />}
    </button>
  );
}

function Understood({ out }: { out: VeloOut }) {
  if (!out.understood.length) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="eyebrow">Understood{out.mode === "model" ? "" : " · keywords"}</p>
      <ul className="flex flex-wrap gap-1">
        {out.understood.map((c, i) => (
          <li
            key={`${c.label}-${i}`}
            title={c.guessed ? "Guessed: check it" : undefined}
            className={cn(
              "rounded-[3px] border-2 px-1.5 py-px text-[11.5px] font-bold",
              i === 0 ? "border-rule-strong bg-ink text-sheet" : "border-rule-strong bg-sheet",
              c.guessed && "border-dashed text-ink-2",
            )}
          >
            {c.label}
            {c.guessed ? " ?" : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Chips({ items, onPick, className }: { items: string[]; onPick: (s: string) => void; className?: string }) {
  if (!items.length) return null;
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {items.map((s) => (
        <button key={s} type="button" onClick={() => onPick(s)} className="press max-w-full truncate rounded-[4px] border-2 border-rule-strong bg-sheet px-2.5 py-1 text-[12.5px] font-bold shadow-mount">
          {s}
        </button>
      ))}
    </div>
  );
}

function Typing() {
  const reduce = useReducedMotion();
  const [late, setLate] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setLate(true), 1400);
    return () => clearTimeout(id);
  }, []);
  return (
    <div className="flex items-center gap-2.5" role="status" aria-live="polite">
      <Avatar />
      <span className="flex items-end gap-[3px]" aria-hidden>
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="block h-2.5 w-1.5 rounded-[1px] bg-ink"
            animate={reduce ? { opacity: [0.35, 1, 0.35] } : { y: [0, -4, 0] }}
            transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.12, ease: "easeInOut" }}
          />
        ))}
      </span>
      <span className="text-[12.5px] font-semibold text-ink-3">{late ? "Checking it against the timetable…" : "Reading your message…"}</span>
    </div>
  );
}

function Message({ m, last }: { m: Msg; last: boolean }) {
  const { send, pending } = useVelo();
  const reduce = useReducedMotion();
  const enter = { initial: reduce ? { opacity: 0 } : { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.16, ease: EASE } };
  if (m.from === "you")
    return (
      <motion.div {...enter} className="ml-auto max-w-[86%] rounded-[6px] border-2 border-rule-strong bg-anthracite px-3 py-2 text-[13.5px] leading-[19px] text-on-anthracite">
        {m.text}
      </motion.div>
    );
  if (m.from === "error")
    return (
      <motion.div {...enter} className="flex flex-col items-start gap-2 rounded-[6px] border-2 border-rule-strong bg-stop-soft px-3 py-2.5 text-[13px]">
        <span>{m.text}</span>
        <button type="button" disabled={pending} onClick={() => send(m.retry)} className="text-[12.5px] font-bold underline underline-offset-2">
          Try again
        </button>
      </motion.div>
    );
  return (
    <motion.div {...enter} className="flex gap-2.5">
      <Avatar className="mt-0.5" />
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <Understood out={m.out} />
        <p className="text-[14px] leading-[21px]">{m.out.reply}</p>
        <VeloCards cards={m.out.cards} msgId={m.id} action={m.action} />
        {last && <Chips items={m.out.suggestions} onPick={(s) => send(s)} />}
      </div>
    </motion.div>
  );
}

function Empty() {
  const user = useUser();
  const { send } = useVelo();
  // a first name only where the account is a person; "Dean's Office" or a club gets a plain hello
  const first = user.role === "faculty" ? ` ${user.name.replace(/^(Dr\.|Prof\.)\s+/, "").split(" ")[0]}` : "";
  const { mood, voiceOpen } = useVelo();
  return (
    <div className="flex flex-col gap-4 py-2">
      <div className="relative mx-auto mt-1 size-[132px]">
        {voiceOpen ? <StillOrb mood="idle" className="size-full text-[26px]" /> : <OrbView mood={mood} size="panel" className="size-full" />}
        <span className="absolute -left-10 top-2 rounded-[6px] border-2 border-rule-strong bg-sheet px-2.5 py-1 text-[13px] font-black shadow-mount">Hello!</span>
      </div>
      <div className="text-center">
        <h2 className="text-[22px] font-black leading-7 [font-stretch:106%]">Hi{first}. What do you need?</h2>
        <p className="mx-auto mt-1 max-w-[42ch] text-[13px] leading-[19px] text-ink-2">Ask in English or Hinglish, or tap the voice button and talk. I find rooms, draft bookings and explain the timetable. Nothing changes until you confirm it.</p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {starters(user.role).map((s) => (
          <button key={s.title} type="button" onClick={() => send(s.prompt)} className="press rounded-[6px] border-2 border-rule-strong bg-sheet px-3 py-2.5 text-left shadow-mount">
            <span className="block text-[13.5px] font-black">{s.title}</span>
            <span className="mt-0.5 block text-[12px] leading-[16px] text-ink-2">“{s.prompt}”</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Composer({ chips }: { chips: string[] }) {
  const { send, pending, open, setVoiceOpen } = useVelo();
  const [text, setText] = useState("");
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) box.current?.focus();
  }, [open]);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }, [text]);

  function go(e?: FormEvent) {
    e?.preventDefault();
    if (!text.trim() || pending) return;
    send(text);
    setText("");
  }
  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      go();
    }
  }

  return (
    <form onSubmit={go} className="flex flex-col gap-2 border-t-2 border-rule-strong bg-sheet px-3 pb-[calc(12px+env(safe-area-inset-bottom))] pt-2.5 md:pb-3">
      <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-0.5 [scrollbar-width:none]">
        {chips.map((c) => (
          <button key={c} type="button" disabled={pending} onClick={() => send(c)} className="shrink-0 rounded-[4px] border-2 border-rule-strong bg-sheet-2 px-2 py-0.5 text-[12px] font-bold text-ink-2 transition-colors hover:bg-signal-soft hover:text-ink disabled:opacity-50">
            {c}
          </button>
        ))}
      </div>
      <div className="flex items-end gap-2">
        <label className="sr-only" htmlFor="velo-input">
          Message Velo
        </label>
        <textarea
          id="velo-input"
          ref={box}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          placeholder="Ask Velo anything about rooms, bookings or the timetable"
          className="min-h-11 flex-1 resize-none rounded-[4px] border-2 border-rule-strong bg-sheet px-3 py-2.5 text-[14px] leading-5 text-ink placeholder:text-ink-3 focus-visible:outline-offset-0"
        />
        <button
          type="button"
          onClick={() => setVoiceOpen(true)}
          aria-label="Talk to Velo"
          title="Talk to Velo"
          className="press grid size-11 shrink-0 place-items-center rounded-[4px] border-2 border-rule-strong bg-[radial-gradient(circle_at_35%_30%,#ffb3d8,#ff4fa3_45%,#8b5cf6)] text-white shadow-mount"
        >
          <AudioLines className="size-4" />
        </button>
        <button type="submit" disabled={!text.trim() || pending} aria-label="Send" className="press glow grid size-11 shrink-0 place-items-center rounded-[4px] border-2 border-rule-strong bg-signal text-signal-ink shadow-mount disabled:opacity-50">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <CornerDownLeft className="size-4" />}
        </button>
      </div>
    </form>
  );
}

/** The panel: docked bottom right on a computer (with a wider focus mode), a full-height sheet on a phone. */
export function VeloPanel() {
  const { open, setOpen, expanded, setExpanded, messages, pending, reset, focus, mood, voiceOpen } = useVelo();
  const user = useUser();
  const location = useLocation();
  const wide = useMediaQuery("(min-width: 768px)");
  const reduce = useReducedMotion();
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) list.current?.scrollTo({ top: list.current.scrollHeight, behavior: reduce ? "auto" : "smooth" });
  }, [open, messages.length, pending, reduce]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  return (
    <AnimatePresence>
      {open && (
        <motion.section
          role="dialog"
          aria-modal={!wide}
          aria-label="Velo assistant"
          initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: wide ? 8 : 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: wide ? 6 : 24 }}
          transition={{ duration: 0.2, ease: EASE }}
          style={{ transformOrigin: "bottom right" }}
          className={cn(
            "fixed z-[60] flex flex-col overflow-clip bg-platform text-ink",
            "inset-0 md:inset-auto md:bottom-6 md:right-6 md:rounded-[6px] md:border-2 md:border-rule-strong md:shadow-[8px_8px_0_var(--shade)]",
            expanded ? "md:h-[calc(100dvh-48px)] md:w-[min(780px,calc(100vw-48px))]" : "md:h-[min(680px,calc(100dvh-48px))] md:w-[420px]",
          )}
        >
          <header className="flex items-center gap-2.5 border-b-2 border-rule-strong bg-sheet px-3 pb-2.5 pt-[calc(10px+env(safe-area-inset-top))] md:pt-2.5">
            {voiceOpen ? <StillOrb mood="idle" className="size-9 text-[9px]" /> : <OrbView mood={mood} size="mini" className="size-9" />}
            <div className="min-w-0 flex-1">
              <p className="text-[16px] font-black leading-5 [font-stretch:106%]">Velo</p>
              <p className="truncate text-[11.5px] font-semibold text-ink-3">{contextLabel(location.pathname, focus)}</p>
            </div>
            {messages.length > 0 && (
              <button type="button" onClick={reset} aria-label="New chat" title="New chat" className="grid size-9 place-items-center rounded-[4px] border-2 border-transparent text-ink-2 transition-colors hover:border-rule-strong hover:bg-sheet-2 hover:text-ink">
                <RotateCcw className="size-4" />
              </button>
            )}
            {wide && (
              <button type="button" onClick={() => setExpanded(!expanded)} aria-label={expanded ? "Make smaller" : "Make larger"} title={expanded ? "Make smaller" : "Make larger"} className="grid size-9 place-items-center rounded-[4px] border-2 border-transparent text-ink-2 transition-colors hover:border-rule-strong hover:bg-sheet-2 hover:text-ink">
                {expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
              </button>
            )}
            <button type="button" onClick={() => setOpen(false)} aria-label="Close Velo" className="grid size-9 place-items-center rounded-[4px] border-2 border-rule-strong bg-sheet text-ink transition-colors hover:bg-signal hover:text-signal-ink">
              <X className="size-4" />
            </button>
          </header>

          <div ref={list} className="platform-bg flex-1 overflow-y-auto px-3 py-4 sm:px-4" aria-live="polite">
            <div className={cn("mx-auto flex flex-col gap-5", expanded && "max-w-[640px]")}>
              {messages.length === 0 && <Empty />}
              {messages.map((m, i) => (
                <Message key={m.id} m={m} last={i === messages.length - 1 && !pending} />
              ))}
              {pending && <Typing />}
            </div>
          </div>

          <Composer chips={contextChips(user.role, location.pathname, focus)} />
        </motion.section>
      )}
    </AnimatePresence>
  );
}
