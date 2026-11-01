import { ArrowRight, Bot, Building2, CalendarClock, ClipboardCheck, Database, GraduationCap, PartyPopper, ScrollText, ShieldCheck, Sparkles, UsersRound, type LucideIcon } from "lucide-react";
import { useRef, type PointerEvent, type ReactNode } from "react";
import { useHealth } from "@/api/hooks";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { cn } from "@/lib/utils";
import { finePointer, gsap, ScrollTrigger, useGsap } from "./motion";
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
 * the page scrolls. */
export function LandingHeader({ onLogin }: { onLogin: () => void }) {
  const links: [string, string][] = [
    ["Product", "#product"],
    ["Services", "#services"],
    ["How it works", "#how"],
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
    </header>
  );
}

/** Wraps one heading block the same way everywhere: mono eyebrow, heavy title, lede. */
function Heading({ eyebrow, title, lede, className }: { eyebrow: string; title: ReactNode; lede?: string; className?: string }) {
  return (
    <div className={cn("flex max-w-[680px] flex-col gap-3", className)} data-reveal>
      <span className="eyebrow">{eyebrow}</span>
      <h2 className="lx-h text-[32px] font-black uppercase leading-[0.95] tracking-[-0.035em] sm:text-[44px]">{title}</h2>
      {lede && <p className="text-[16px] leading-relaxed text-ink-2 sm:text-[17px]">{lede}</p>}
    </div>
  );
}

/** A card with a soft accent spot that follows the pointer (a hover nicety, off on touch). */
function SpotCard({ className, children }: { className?: string; children: ReactNode }) {
  const move = (e: PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
  };
  return (
    <article onPointerMove={move} data-reveal className={cn("lx-spot lift relative overflow-hidden rounded-[6px] border-2 border-rule-strong bg-sheet shadow-float", className)}>
      {children}
    </article>
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
        <Heading eyebrow="02 · Services" title={<span id="services-title">Four jobs, one rulebook.</span>} lede="The same solver and the same hard rules sit under every screen, so a booking can never undo the timetable." />
        <div className="mt-10 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
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

  // the rail fills as the section scrolls past, and each step lights up as the fill reaches it
  useGsap(root, (reduce) => {
    const el = root.current!;
    const dots = gsap.utils.toArray<HTMLElement>(".hw-step", el);
    if (reduce) {
      el.style.setProperty("--p", "1");
      dots.forEach((d) => d.classList.add("is-on"));
      return;
    }
    ScrollTrigger.create({
      trigger: el.querySelector(".hw-track"),
      start: "top 78%",
      end: "bottom 55%",
      scrub: 0.6,
      onUpdate: ({ progress }) => {
        el.style.setProperty("--p", progress.toFixed(3));
        dots.forEach((d, i) => d.classList.toggle("is-on", progress >= i / steps.length + 0.02 || (i === 0 && progress > 0)));
      },
    });
  });

  return (
    <section ref={root} id="how" className="scroll-mt-20 border-y-2 border-rule-strong bg-sheet py-20 sm:py-28" aria-labelledby="how-title">
      <div className="mx-auto max-w-[1240px] px-4 sm:px-6">
        <Heading eyebrow="03 · How it works" title={<span id="how-title">Data in. Decisions out.</span>} />
        <ol className="hw-track relative mt-12 grid gap-8 lg:grid-cols-3 lg:gap-6">
          <span className="hw-rail pointer-events-none absolute" aria-hidden>
            <span className="hw-fill absolute inset-0" />
          </span>
          {steps.map(([Icon, title, body], i) => (
            <li key={title} className="hw-step relative flex gap-4 pl-0 lg:flex-col lg:gap-5">
              <span className="hw-node relative z-[1] grid size-12 shrink-0 place-items-center rounded-full border-2 border-rule-strong bg-sheet text-ink transition-[background-color,color,transform] duration-300">
                <Icon className="size-5" strokeWidth={2.2} />
              </span>
              <div className="pt-1 lg:pt-0">
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
        <Heading eyebrow="04 · Roles" title={<span id="roles-title">Built for everyone who books a room.</span>} lede="Each role sees only what it can act on. Try any of them with a demo account, no sign-up needed." />
        <div className="mt-10 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
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

/** Everything under the hero: the product story, the services, how it works and the roles. */
export function LandingSections({ onTry }: { onTry: (id: DemoId) => void }) {
  const { solver } = useStatuses();
  return (
    <>
      <section id="product" className="scroll-mt-20 py-20 sm:py-28" aria-labelledby="product-title">
        <div className="mx-auto max-w-[1240px] px-4 sm:px-6">
          <Heading
            eyebrow="01 · Product"
            title={<span id="product-title">From a pile of rules to a timetable you can defend.</span>}
            lede="Velora doesn't just fill a grid. It finds the clash, fixes it and tells you why, in words a head of department can check."
            className="mb-10"
          />
          <div data-reveal>
            <ProductPreview />
          </div>
        </div>
      </section>
      <Services />
      <HowItWorks />
      <Roles onTry={onTry} />
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

/** The page-wide motion layer: the header edge, the hero's entrance, the glow's drift, reveals and the
 * magnetic main button. Scoped to the page root and reverted on unmount. */
export function useLandingMotion(page: React.RefObject<HTMLElement | null>) {
  useGsap(page, (reduce) => {
    const el = page.current!;
    const header = el.querySelector<HTMLElement>(".lx-header");
    const edge = () => header?.toggleAttribute("data-scrolled", scrollY > 8);
    edge();
    addEventListener("scroll", edge, { passive: true });
    const off = () => removeEventListener("scroll", edge);
    if (reduce) return off;

    gsap
      .timeline({ defaults: { ease: "power3.out" } })
      .from("[data-hero]", { autoAlpha: 0, y: 22, duration: 0.7, stagger: 0.07 })
      .from("[data-hero-card]", { autoAlpha: 0, y: 28, duration: 0.8 }, 0.15);

    gsap.to(".lx-glow", { yPercent: 18, ease: "none", scrollTrigger: { trigger: el, start: "top top", end: "+=900", scrub: true } });

    const items = gsap.utils.toArray<HTMLElement>("[data-reveal]", el);
    gsap.set(items, { autoAlpha: 0, y: 20 });
    ScrollTrigger.batch(items, {
      start: "top 88%",
      once: true,
      onEnter: (batch) => gsap.to(batch, { autoAlpha: 1, y: 0, duration: 0.6, stagger: 0.08, ease: "power3.out", overwrite: true }),
    });

    // the main button leans toward the pointer a few pixels, then springs back
    const magnet = el.querySelector<HTMLElement>("[data-magnetic]");
    if (!magnet || !finePointer()) return off;
    const x = gsap.quickTo(magnet, "x", { duration: 0.4, ease: "power3" });
    const y = gsap.quickTo(magnet, "y", { duration: 0.4, ease: "power3" });
    const move = (e: globalThis.PointerEvent) => {
      const r = magnet.getBoundingClientRect();
      x(gsap.utils.clamp(-8, 8, (e.clientX - (r.left + r.width / 2)) * 0.18));
      y(gsap.utils.clamp(-6, 6, (e.clientY - (r.top + r.height / 2)) * 0.25));
    };
    const leave = () => {
      x(0);
      y(0);
    };
    magnet.addEventListener("pointermove", move);
    magnet.addEventListener("pointerleave", leave);
    return () => {
      off();
      magnet.removeEventListener("pointermove", move);
      magnet.removeEventListener("pointerleave", leave);
    };
  });
}
