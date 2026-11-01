import { ArrowRight, Bot, Building2, CalendarClock, ClipboardCheck, Database, GraduationCap, PartyPopper, ScrollText, ShieldCheck, Sparkles, UsersRound, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { useHealth } from "@/api/hooks";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import type { Mood } from "@/components/velo/live/expression";
import { OrbView, StillOrb } from "@/components/velo/live/OrbView";
import { cn } from "@/lib/utils";
import { finePointer, gsap, ScrollTrigger, splitWords, useGsap } from "./motion";
import { ProductPreview } from "./ProductPreview";
import "./landing.css";

export type DemoId = "admin" | "coordinator" | "faculty" | "club";
type Tone = "clear" | "caution" | "stop" | "wait";

/** Live status in words, from GET /api/health. */
export function useStatuses() {
  const { data: health, isError } = useHealth();
  const solver: [string, Tone] = isError ? ["Offline", "stop"] : health ? (health.ok ? ["Ready", "clear"] : ["Check", "stop"]) : ["Checking", "wait"];
  const llm = health?.llm ?? "";
  const assistant: [string, Tone] = isError
    ? ["Offline", "stop"]
    : !health
      ? ["Checking", "wait"]
      : llm.startsWith("error")
        ? ["Fallback", "caution"]
        : llm.startsWith("not configured")
          ? ["Keywords", "caution"]
          : ["Ready", "clear"];
  return { solver, assistant };
}

export function StatusDot({ tone, label }: { tone: Tone; label: string }) {
  return (
    <span className="lx-status inline-flex items-center gap-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em]" data-tone={tone}>
      <span className="lx-status-dot relative size-2 rounded-full" />
      {label}
    </span>
  );
}

/** The bar on top: brand, section links, theme and a jump to the log-in card. It gains an edge once
 * the page scrolls, and a cyan line along its foot shows how far down the page you are. */
export function LandingHeader({ onLogin }: { onLogin: () => void }) {
  const links: [string, string][] = [
    ["Product", "#product"],
    ["Services", "#services"],
    ["How it works", "#how"],
    ["Velo AI", "#velo"],
    ["Roles", "#roles"],
  ];
  return (
    <header className="lx-header sticky top-0 z-30 border-b-2 border-transparent transition-[background-color,border-color] duration-200">
      <div className="mx-auto flex h-[68px] max-w-[1240px] items-center justify-between gap-3 px-4 sm:px-6">
        <a href="#top" className="flex min-w-0 items-center gap-2.5 rounded-[4px]" aria-label="Velora, back to top">
          <Logo size={36} title="" />
          <span className="min-w-0 leading-tight">
            <span className="block text-[15px] font-black tracking-[0.04em]">VELORA</span>
            <span className="hidden truncate text-[11.5px] font-medium text-ink-3 sm:block">Chilika Institute of Technology</span>
          </span>
        </a>
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Sections">
          {links.map(([label, href]) => (
            <a key={href} href={href} className="lx-navlink relative rounded-[4px] px-3 py-2 text-[14px] font-semibold text-ink-2 hover:text-ink">
              {label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2.5">
          <ThemeToggle />
          <button type="button" onClick={onLogin} className="press h-11 rounded-[4px] border-2 border-rule-strong bg-ink px-4 text-[14px] font-extrabold text-platform shadow-float sm:px-5">
            Log in
          </button>
        </div>
      </div>
      <span className="lx-progress absolute inset-x-0 -bottom-[2px] h-[3px] origin-left scale-x-0 bg-signal" aria-hidden />
    </header>
  );
}

/** One heading block the same way everywhere: mono eyebrow, heavy title whose words rise into place,
 * lede. */
function Heading({ eyebrow, title, id, lede, className }: { eyebrow: string; title: string; id: string; lede?: string; className?: string }) {
  return (
    <div className={cn("lx-heading flex max-w-[720px] flex-col gap-3", className)}>
      <span className="lx-eyebrow eyebrow">{eyebrow}</span>
      <h2 id={id} aria-label={title} className="lx-h text-[32px] font-black uppercase leading-[0.98] tracking-[-0.035em] sm:text-[48px]">
        {splitWords(title)}
      </h2>
      {lede && <p className="lx-lede text-[16px] leading-relaxed text-ink-2 sm:text-[17px]">{lede}</p>}
    </div>
  );
}

/** A card with a soft accent spot that follows the pointer (a hover nicety, off on touch). The outer
 * box takes the scroll entrance, the card itself keeps its CSS hover lift, so the two never fight. */
function SpotCard({ className, children }: { className?: string; children: ReactNode }) {
  const move = (e: PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
  };
  return (
    <div className="lx-enter h-full">
      <article onPointerMove={move} className={cn("lx-spot lift relative h-full overflow-hidden rounded-[6px] border-2 border-rule-strong bg-sheet shadow-float", className)}>
        {children}
      </article>
    </div>
  );
}

/** Two bands of words that slide in opposite directions as the page scrolls, and lean with its speed. */
function Marquee() {
  const rows = [
    ["Timetables", "Midsem exams", "Spectra week", "Disruptions", "Venue bookings", "Change requests"],
    ["No hard clashes", "Every decision explained", "One rulebook", "Approved by the owner", "Typed or spoken"],
  ];
  return (
    <section className="lx-marquee overflow-hidden border-y-2 border-rule-strong bg-sheet py-6 sm:py-8" aria-hidden>
      {rows.map((words, r) => (
        <div key={r} className={cn("lx-row flex w-max gap-8 whitespace-nowrap py-1.5 text-[38px] font-black uppercase leading-none tracking-[-0.03em] sm:text-[64px]", r === 1 && "lx-row-outline")}>
          {[...words, ...words, ...words].map((w, i) => (
            <span key={i} className="flex items-center gap-8">
              {w}
              <span className="lx-star inline-block size-3 rotate-45 bg-signal sm:size-4" />
            </span>
          ))}
        </div>
      ))}
    </section>
  );
}

function Services() {
  const { solver, assistant } = useStatuses();
  const items: [LucideIcon, string, string, [string, Tone], string][] = [
    [CalendarClock, "Timetable", "Every group, teacher and room for the semester, with no hard clashes. Click any class to see why it sits there.", solver, "bg-k-lecture-tint"],
    [ScrollText, "Midsem exams", "Exam slots per course that keep a student to one paper at a time and rooms within capacity.", solver, "bg-k-exam-tint"],
    [PartyPopper, "Spectra week", "Club event requests decided together, with the nearest free option offered when the first choice is taken.", solver, "bg-k-event-tint"],
    [Bot, "Velo assistant", "Book a venue by typing or speaking, in English or Hinglish. Velo fills the form; the rules still decide.", assistant, "bg-k-lab-tint"],
  ];
  return (
    <section id="services" className="scroll-mt-20 py-20 sm:py-28" aria-labelledby="services-title">
      <div className="mx-auto max-w-[1240px] px-4 sm:px-6">
        <Heading id="services-title" eyebrow="02 · Services" title="Four jobs, one rulebook." lede="The same solver and the same hard rules sit under every screen, so a booking can never undo the timetable." />
        <div className="lx-cards lx-rise mt-10 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {items.map(([Icon, title, body, [status, tone], fill]) => (
            <SpotCard key={title} className="group flex flex-col gap-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <span className={cn("grid size-11 place-items-center rounded-[4px] border-2 border-[#111] text-[#111] shadow-mount transition-transform duration-300 group-hover:-rotate-6", fill)}>
                  <Icon className="size-5" strokeWidth={2.2} />
                </span>
                <StatusDot tone={tone} label={status} />
              </div>
              <div>
                <h3 className="text-[18px] font-extrabold">{title}</h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-ink-2">{body}</p>
              </div>
            </SpotCard>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const root = useRef<HTMLElement>(null);
  const steps: [LucideIcon, string, string][] = [
    [Database, "Load the dataset", "Courses, groups, faculty, rooms and the week's shape come in as one JSON file the Admin can swap."],
    [ShieldCheck, "Solve with hard rules", "OR-Tools CP-SAT places every session. Hard rules never bend; soft preferences are weighed and scored."],
    [ClipboardCheck, "Approve and explain", "Changes go to the people who own them. Every decision keeps its reason, and the audit log keeps the rest."],
  ];

  // the rail fills as the section scrolls past; each step rises in and lights up as the fill reaches it
  useGsap(root, ({ reduce }) => {
    const el = root.current!;
    const items = gsap.utils.toArray<HTMLElement>(".hw-step", el);
    if (reduce) {
      el.style.setProperty("--p", "1");
      items.forEach((d) => d.classList.add("is-on"));
      return;
    }
    const track = el.querySelector(".hw-track");
    ScrollTrigger.create({
      trigger: track,
      start: "top 80%",
      end: "bottom 68%",
      scrub: 0.35,
      onUpdate: ({ progress }) => {
        el.style.setProperty("--p", progress.toFixed(3));
        items.forEach((d, i) => d.classList.toggle("is-on", progress > i / steps.length + 0.01));
      },
    });
    gsap.from(".hw-copy", { y: 24, autoAlpha: 0.1, stagger: 0.25, ease: "none", scrollTrigger: { trigger: track, start: "top 88%", end: "bottom 72%", scrub: 0.35 } });
    gsap.from(".hw-node", { scale: 0.4, rotate: -90, stagger: 0.25, ease: "none", scrollTrigger: { trigger: track, start: "top 88%", end: "bottom 72%", scrub: 0.35 } });
  });

  return (
    <section ref={root} id="how" className="scroll-mt-20 border-y-2 border-rule-strong bg-sheet py-20 sm:py-28" aria-labelledby="how-title">
      <div className="mx-auto max-w-[1240px] px-4 sm:px-6">
        <Heading id="how-title" eyebrow="03 · How it works" title="Data in. Decisions out." />
        <ol className="hw-track relative mt-12 grid gap-8 lg:grid-cols-3 lg:gap-6">
          <span className="hw-rail pointer-events-none absolute" aria-hidden>
            <span className="hw-fill absolute inset-0" />
          </span>
          {steps.map(([Icon, title, body], i) => (
            <li key={title} className="hw-step relative flex gap-4 pl-0 lg:flex-col lg:gap-5">
              <span className="hw-node relative z-[1] grid size-12 shrink-0 place-items-center rounded-full border-2 border-rule-strong bg-sheet text-ink transition-[background-color,color,box-shadow] duration-300">
                <Icon className="size-5" strokeWidth={2.2} />
              </span>
              <div className="hw-copy pt-1 lg:pt-0">
                <span className="font-mono text-[11px] font-semibold tracking-[0.08em] text-ink-3">STEP {i + 1}</span>
                <h3 className="mt-1 text-[19px] font-extrabold">{title}</h3>
                <p className="mt-1.5 max-w-[360px] text-[14.5px] leading-relaxed text-ink-2">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** Velo, Velora's assistant: its real orb, and a short exchange that plays when the section arrives.
 * The orb's mood follows the conversation (listening, thinking, speaking, happy). Three.js loads only
 * once the section is near; until then, and without WebGL, the still orb stands in. */
function VeloSection() {
  const root = useRef<HTMLElement>(null);
  const [mood, setMood] = useState<Mood>("idle");
  const [near, setNear] = useState(false);
  const tl = useRef<gsap.core.Timeline | null>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setNear(true), { rootMargin: "600px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useGsap(root, ({ reduce }) => {
    if (reduce) {
      setMood("happy");
      return;
    }
    const t = gsap
      .timeline({ paused: true, defaults: { ease: "power3.out", duration: 0.45 } })
      .call(() => setMood("listening"))
      .from(".vx-user", { autoAlpha: 0, x: 40 })
      .call(() => setMood("thinking"), [], "+=0.15")
      .from(".vx-chip", { autoAlpha: 0, scale: 0.7, stagger: 0.06, duration: 0.3, ease: "back.out(2.4)" })
      .call(() => setMood("speaking"), [], "+=0.2")
      .from(".vx-reply", { autoAlpha: 0, y: 12 })
      .from(".vx-room", { autoAlpha: 0, y: 18, stagger: 0.1 }, "-=0.15")
      .from(".vx-next", { autoAlpha: 0, y: 8, stagger: 0.06, duration: 0.3 }, "-=0.1")
      .call(() => setMood("happy"));
    tl.current = t;
    ScrollTrigger.create({ trigger: root.current!.querySelector(".vx-chat"), start: "top 75%", once: true, onEnter: () => void t.play(0) });
    gsap.from(".vx-orb", { scale: 0.6, autoAlpha: 0, rotate: -20, duration: 0.9, ease: "expo.out", scrollTrigger: { trigger: root.current, start: "top 70%", once: true } });
    gsap.from(".vx-point", { autoAlpha: 0, x: -16, stagger: 0.07, duration: 0.5, ease: "power3.out", scrollTrigger: { trigger: root.current, start: "top 60%", once: true } });
    return () => void (tl.current = null);
  });

  const points: [string, string][] = [
    ["Typed or spoken", "English or Hinglish, from a text box or the mic."],
    ["Knows where you are", "Your role, the page you're on and what you asked a minute ago."],
    ["Finds, explains, drafts", "The rule checker decides. Anything that changes data is a card you confirm once."],
    ["Role-checked tools", "23 typed tools over the same services as the app, with a keyword fallback when offline."],
  ];

  return (
    <section ref={root} id="velo" className="lx-velo scroll-mt-20 overflow-hidden border-y-2 border-rule-strong py-20 sm:py-28" aria-labelledby="velo-title">
      <div className="mx-auto grid max-w-[1240px] items-center gap-12 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-16">
        <div className="flex min-w-0 flex-col gap-7">
          <div className="flex items-center gap-5">
            {near ? (
              <OrbView mood={mood} size="panel" className="vx-orb size-[92px] sm:size-[112px]" />
            ) : (
              <StillOrb mood="idle" className="vx-orb size-[92px] text-[100px] sm:size-[112px]" />
            )}
            <span className="vx-mood font-mono text-[11px] font-semibold uppercase tracking-[0.1em]">Velo · {mood}</span>
          </div>
          <Heading id="velo-title" eyebrow="05 · AI assistant" title="Meet Velo. It knows the rules." lede="Ask for a room, a reason or a change in plain words. Velo answers with things you can act on, and never decides on its own." />
          <ul className="grid gap-4 sm:grid-cols-2">
            {points.map(([t, d]) => (
              <li key={t} className="vx-point flex gap-3">
                <span className="mt-1.5 size-2 shrink-0 rotate-45 bg-signal" />
                <span>
                  <b className="block text-[15px] font-extrabold">{t}</b>
                  <span className="text-[14px] leading-relaxed text-ink-2">{d}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* a turn, laid out the way the Velo panel lays it out */}
        <div className="vx-chat min-w-0 overflow-hidden rounded-[6px] border-2 border-rule-strong bg-sheet shadow-panel">
          <div className="flex items-center justify-between gap-3 border-b-2 border-rule-strong bg-sheet-2 px-4 py-2.5">
            <span className="flex items-center gap-2 text-[13px] font-extrabold">
              <StillOrb mood="idle" className="size-5" /> Velo
            </span>
            <span className="rounded-[3px] border-2 border-rule px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-3">On Find a room</span>
          </div>
          <div className="flex flex-col gap-3 p-4 sm:p-5">
            <p className="vx-user ml-auto max-w-[85%] rounded-[6px] rounded-br-[2px] bg-ink px-3.5 py-2.5 text-[14px] leading-snug text-platform">
              Need a room for 60 people tomorrow 4 to 6, projector chahiye
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="vx-chip font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-3">Understood</span>
              {["Find a room", "Tue", "4–6 pm", "60 people", "projector"].map((c) => (
                <span key={c} className="vx-chip rounded-[3px] border-2 border-rule-strong bg-signal-soft px-1.5 py-0.5 text-[12px] font-bold">
                  {c}
                </span>
              ))}
            </div>
            <p className="vx-reply text-[15px] leading-snug">Two lecture halls fit and are free then. LH-3 is the closer one.</p>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {[
                ["LH-3", "120 seats · projector", true],
                ["LH-4", "120 seats · projector", false],
              ].map(([room, facts, first]) => (
                <div key={room as string} className="vx-room flex items-center justify-between gap-3 rounded-[4px] border-2 border-rule-strong bg-sheet p-3 shadow-mount">
                  <span>
                    <b className="block font-mono text-[14px]">{room}</b>
                    <span className="text-[12.5px] text-ink-3">{facts}</span>
                  </span>
                  <span className={cn("rounded-[3px] border-2 border-rule-strong px-2 py-1 text-[12px] font-extrabold", first ? "bg-signal text-signal-ink" : "bg-sheet")}>Book this</span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {["Book LH-3", "Try Wednesday", "Why not the auditorium?"].map((c) => (
                <span key={c} className="vx-next rounded-full border-2 border-rule px-2.5 py-1 text-[12px] font-semibold text-ink-2">
                  {c}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const STATEMENT =
  "Every class gets a room. Every teacher gets a week that works. Every club gets an answer, and every answer comes with its reason.";

/** One big sentence that lights up word by word as you scroll through it (pinned on desktop). */
function Statement() {
  return (
    <section className="lx-statement relative py-24 sm:py-32" aria-label={STATEMENT}>
      <div className="mx-auto max-w-[1100px] px-4 sm:px-6">
        <span className="eyebrow mb-6 block">The promise</span>
        <p className="lx-h text-[34px] font-black uppercase leading-[1.02] tracking-[-0.03em] sm:text-[60px]" aria-hidden>
          {STATEMENT.split(" ").map((w, i, all) => (
            <span key={i} className={cn("lx-sw", i === all.length - 1 && "lx-sw-last")}>
              {w}{" "}
            </span>
          ))}
        </p>
      </div>
    </section>
  );
}

function Roles({ onTry }: { onTry: (id: DemoId) => void }) {
  const roles: [DemoId, LucideIcon, string, string, string[]][] = [
    ["admin", ShieldCheck, "Dean's Office", "bg-signal", ["Generate the timetable and exams", "Approve changes and roles", "Decide Spectra week"]],
    ["coordinator", Building2, "Coordinator", "bg-k-event-tint", ["Book rooms for department events", "Approve bookings of your labs", "See your department's load"]],
    ["faculty", GraduationCap, "Faculty", "bg-k-lecture-tint", ["Your week and your rooms", "Mark time you can't teach", "Ask for a class to move"]],
    ["club", UsersRound, "Club", "bg-k-lab-tint", ["Request venues by voice or text", "Get the nearest free option", "Track every request"]],
  ];
  return (
    <section id="roles" className="scroll-mt-20 py-20 sm:py-28" aria-labelledby="roles-title">
      <div className="mx-auto max-w-[1240px] px-4 sm:px-6">
        <Heading id="roles-title" eyebrow="04 · Roles" title="Built for everyone who books a room." lede="Each role sees only what it can act on. Try any of them with a demo account, no sign-up needed." />
        <div className="lx-cards lx-fan mt-10 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {roles.map(([id, Icon, title, fill, can]) => (
            <SpotCard key={id} className="flex flex-col">
              <div className={cn("flex items-center gap-3 border-b-2 border-rule-strong px-5 py-4 text-[#111]", fill)}>
                <Icon className="size-5" strokeWidth={2.2} />
                <h3 className="text-[17px] font-extrabold">{title}</h3>
              </div>
              <ul className="flex flex-1 flex-col gap-2 p-5">
                {can.map((c) => (
                  <li key={c} className="flex gap-2 text-[14px] leading-snug text-ink-2">
                    <Sparkles className="mt-0.5 size-3.5 shrink-0 text-ink-3" /> {c}
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => onTry(id)} className="group mx-5 mb-5 flex items-center justify-between rounded-[4px] border-2 border-rule-strong px-3.5 py-2.5 text-[14px] font-bold transition-colors hover:bg-signal hover:text-signal-ink">
                Try as {title}
                <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" />
              </button>
            </SpotCard>
          ))}
        </div>
      </div>
    </section>
  );
}

/** The last word: a cyan band whose headline grows to full size as it scrolls in. */
function Closing({ onStart }: { onStart: () => void }) {
  const title = "Ready when the timetable is.";
  return (
    <section className="lx-closing on-light overflow-hidden border-t-2 border-rule-strong bg-signal py-24 text-[#111] sm:py-32" aria-labelledby="closing-title">
      <div className="mx-auto flex max-w-[1240px] flex-col items-start gap-8 px-4 sm:px-6">
        <h2 id="closing-title" aria-label={title} className="lx-h lx-closing-title text-[44px] font-black uppercase leading-[0.92] tracking-[-0.045em] sm:text-[96px]">
          {splitWords(title)}
        </h2>
        <button
          type="button"
          onClick={onStart}
          className="lx-closing-cta press group inline-flex h-14 items-center gap-3 rounded-[4px] border-2 border-[#111] bg-[#111] px-6 text-[16px] font-extrabold text-white shadow-[4px_4px_0_#fff]"
        >
          Open the demo <ArrowRight className="size-5 transition-transform duration-200 group-hover:translate-x-1" />
        </button>
      </div>
    </section>
  );
}

/** Everything under the hero: the product story, the services, how it works and the roles. */
export function LandingSections({ onTry, onStart }: { onTry: (id: DemoId) => void; onStart: () => void }) {
  const { solver } = useStatuses();
  return (
    <>
      <Marquee />
      <section id="product" className="scroll-mt-20 py-20 sm:py-28" aria-labelledby="product-title">
        <div className="mx-auto max-w-[1240px] px-4 sm:px-6">
          <Heading
            id="product-title"
            eyebrow="01 · Product"
            title="From a pile of rules to a timetable you can defend."
            lede="Velora doesn't just fill a grid. It finds the clash, fixes it and tells you why, in words a head of department can check. Scroll to watch it work."
            className="mb-10"
          />
          <ProductPreview />
        </div>
      </section>
      <Services />
      <HowItWorks />
      <VeloSection />
      <Statement />
      <Roles onTry={onTry} />
      <Closing onStart={onStart} />
      <footer className="border-t-2 border-rule-strong bg-sheet">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-4 px-4 py-6 sm:px-6">
          <div className="flex items-center gap-2.5">
            <Logo size={28} title="" />
            <span className="text-[13px] font-semibold text-ink-2">Velora · Chilika Institute of Technology</span>
          </div>
          <StatusDot tone={solver[1]} label={`Solver ${solver[0]}`} />
        </div>
      </footer>
    </>
  );
}

/** The page-wide motion layer, scoped to the page root and reverted on unmount:
 * - the header's edge and scroll-progress line
 * - the hero: words rise, the plate stamps down, then the hero drifts apart in layers as you leave it
 * - every section heading's words rise as it arrives
 * - the marquee rows slide with scroll and lean with its speed
 * - the statement lights up word by word (pinned on desktop)
 * - the cards: services tip up out of the page, roles fan in from the sides (scrubbed)
 * - the closing headline grows to size, and the main hero button is magnetic */
export function useLandingMotion(page: React.RefObject<HTMLElement | null>) {
  useGsap(page, ({ reduce, desktop }) => {
    const el = page.current!;
    const q = gsap.utils.selector(el);
    const header = el.querySelector<HTMLElement>(".lx-header");
    const edge = () => header?.toggleAttribute("data-scrolled", scrollY > 8);
    edge();
    addEventListener("scroll", edge, { passive: true });
    const cleanups: (() => void)[] = [() => removeEventListener("scroll", edge)];
    const done = () => cleanups.forEach((f) => f());
    if (reduce) return done;

    gsap.to(q(".lx-progress"), { scaleX: 1, ease: "none", scrollTrigger: { start: 0, end: "max", scrub: 0.3 } });

    // ---- hero: in
    gsap
      .timeline({ defaults: { ease: "expo.out" } })
      .from(q("[data-hero-badge]"), { autoAlpha: 0, y: -14, duration: 0.6 })
      .from(q(".lx-hero .lx-wi"), { yPercent: 110, rotate: 3, duration: 0.75, stagger: 0.045 }, 0.05)
      .from(q(".lx-plate"), { autoAlpha: 0, scale: 1.35, rotate: -10, duration: 0.6, ease: "back.out(1.6)" }, 0.3)
      .from(q("[data-hero]"), { autoAlpha: 0, y: 18, duration: 0.6, stagger: 0.06, ease: "power3.out" }, 0.4)
      .from(q("[data-hero-card]"), { autoAlpha: 0, y: 40, rotateX: 12, transformPerspective: 1200, transformOrigin: "50% 100%", duration: 0.85 }, 0.2);

    // ---- hero: out, in layers (copy fastest, card slower, grid slowest)
    const out = { trigger: q(".lx-hero")[0], start: "top top", end: "bottom top", scrub: true };
    gsap.to(q(".lx-hero-copy"), { y: -140, opacity: 0.15, ease: "none", scrollTrigger: out });
    gsap.to(q("[data-hero-card]"), { y: -60, scale: 0.96, ease: "none", scrollTrigger: out });
    gsap.to(q(".lx-grid"), { y: 120, ease: "none", scrollTrigger: out });
    gsap.to(q(".lx-glow"), { yPercent: 40, scale: 1.25, ease: "none", scrollTrigger: out });

    // ---- section headings
    q(".lx-heading").forEach((h) => {
      gsap
        .timeline({ scrollTrigger: { trigger: h, start: "top 85%", once: true }, defaults: { ease: "expo.out" } })
        .from(h.querySelector(".lx-eyebrow"), { autoAlpha: 0, x: -14, duration: 0.45 })
        .from(h.querySelectorAll(".lx-wi"), { yPercent: 110, duration: 0.65, stagger: 0.03 }, 0.04)
        .from(h.querySelector(".lx-lede"), { autoAlpha: 0, y: 12, duration: 0.5, ease: "power3.out" }, 0.2);
    });

    // ---- marquee: rows slide opposite ways, and lean with scroll speed
    const rows = q(".lx-row");
    const marquee = q(".lx-marquee")[0];
    gsap.fromTo(rows[0], { xPercent: 0 }, { xPercent: -22, ease: "none", scrollTrigger: { trigger: marquee, start: "top bottom", end: "bottom top", scrub: 0.3 } });
    gsap.fromTo(rows[1], { xPercent: -22 }, { xPercent: 0, ease: "none", scrollTrigger: { trigger: marquee, start: "top bottom", end: "bottom top", scrub: 0.3 } });
    const skew = gsap.quickTo(rows, "skewX", { duration: 0.5, ease: "power3" });
    ScrollTrigger.create({
      trigger: marquee,
      start: "top bottom",
      end: "bottom top",
      onUpdate: (s) => skew(gsap.utils.clamp(-12, 12, s.getVelocity() / -250)),
      onLeave: () => skew(0),
      onLeaveBack: () => skew(0),
    });

    // ---- statement: word by word
    const statement = q(".lx-statement")[0];
    gsap.fromTo(
      q(".lx-sw"),
      { opacity: 0.12 },
      {
        opacity: 1,
        stagger: 0.1,
        ease: "none",
        scrollTrigger: { trigger: statement, start: "top 72%", end: "center 50%", scrub: 0.3 },
      },
    );
    gsap.from(q(".lx-sw-last"), { scale: 0.6, rotate: -6, transformOrigin: "0% 100%", ease: "back.out(2)", scrollTrigger: { trigger: statement, start: "center 62%", end: "center 50%", scrub: 0.3 } });

    // ---- cards
    q(".lx-rise").forEach((grid) =>
      gsap.from(grid.querySelectorAll(".lx-enter"), {
        y: 70,
        rotateX: -16,
        autoAlpha: 0,
        transformPerspective: 1000,
        transformOrigin: "50% 100%",
        stagger: 0.08,
        ease: "power2.out",
        scrollTrigger: { trigger: grid, start: "top 92%", end: "top 68%", scrub: 0.4 },
      }),
    );
    q(".lx-fan").forEach((grid) =>
      grid.querySelectorAll<HTMLElement>(".lx-enter").forEach((card, i) =>
        gsap.from(card, {
          ...(desktop ? { x: (i - 1.5) * 50, rotate: (i - 1.5) * 4, y: 40 } : { x: i % 2 ? 40 : -40, rotate: i % 2 ? 3 : -3 }),
          autoAlpha: 0,
          ease: "power2.out",
          scrollTrigger: { trigger: grid, start: "top 90%", end: "top 66%", scrub: 0.4 },
        }),
      ),
    );

    // ---- closing
    const closing = q(".lx-closing")[0];
    gsap.from(q(".lx-closing-title"), { scale: 0.85, transformOrigin: "0% 50%", ease: "none", scrollTrigger: { trigger: closing, start: "top bottom", end: "top 40%", scrub: 0.3 } });
    gsap.from(q(".lx-closing .lx-wi"), { yPercent: 115, stagger: 0.06, duration: 0.9, ease: "expo.out", scrollTrigger: { trigger: closing, start: "top 70%", once: true } });
    gsap.from(q(".lx-closing-cta"), { autoAlpha: 0, y: 30, duration: 0.7, ease: "power3.out", scrollTrigger: { trigger: closing, start: "top 55%", once: true } });

    // ---- the main button leans toward the pointer a few pixels, then springs back
    const magnet = el.querySelector<HTMLElement>("[data-magnetic]");
    if (magnet && finePointer()) {
      const x = gsap.quickTo(magnet, "x", { duration: 0.4, ease: "power3" });
      const y = gsap.quickTo(magnet, "y", { duration: 0.4, ease: "power3" });
      const move = (e: globalThis.PointerEvent) => {
        const r = magnet.getBoundingClientRect();
        x(gsap.utils.clamp(-10, 10, (e.clientX - (r.left + r.width / 2)) * 0.2));
        y(gsap.utils.clamp(-8, 8, (e.clientY - (r.top + r.height / 2)) * 0.28));
      };
      const leave = () => {
        x(0);
        y(0);
      };
      magnet.addEventListener("pointermove", move);
      magnet.addEventListener("pointerleave", leave);
      cleanups.push(() => {
        magnet.removeEventListener("pointermove", move);
        magnet.removeEventListener("pointerleave", leave);
      });
    }
    // fonts and late data change heights: re-measure once things settle
    const t = setTimeout(() => {
      ScrollTrigger.sort();
      ScrollTrigger.refresh();
    }, 600);
    cleanups.push(() => clearTimeout(t));
    return done;
  });
}
