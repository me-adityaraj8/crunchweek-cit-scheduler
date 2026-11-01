import { RotateCcw } from "lucide-react";
import { useRef } from "react";
import { cn } from "@/lib/utils";
import { gsap, ScrollTrigger, useGsap } from "./motion";

type Kind = "LEC" | "TUT" | "LAB";
interface Block {
  id: string;
  code: string;
  kind: Kind;
  room: string;
  c: number;
  r: number;
}

const DAYS = ["MON", "TUE", "WED", "THU", "FRI"];
const PERIODS = [
  ["P1", "09:00"],
  ["P2", "10:00"],
  ["P3", "11:00"],
  ["P4", "12:00"],
];
const FILL: Record<Kind, string> = { LEC: "bg-k-lecture-tint", TUT: "bg-k-tutorial-tint", LAB: "bg-k-lab-tint" };

const BLOCKS: Block[] = [
  { id: "a", code: "CS301", kind: "LEC", room: "LH-2", c: 0, r: 0 },
  { id: "b", code: "MA204", kind: "TUT", room: "T-07", c: 0, r: 2 },
  { id: "c", code: "CS305", kind: "LAB", room: "Lab 3", c: 1, r: 1 },
  { id: "d", code: "PH110", kind: "LEC", room: "LH-1", c: 2, r: 0 },
  { id: "e", code: "CS301", kind: "TUT", room: "T-04", c: 3, r: 3 },
  { id: "f", code: "EE210", kind: "LEC", room: "LH-3", c: 4, r: 1 },
  { id: "g", code: "MA204", kind: "LEC", room: "LH-2", c: 4, r: 3 },
];
// the two classes the same teacher was given at once, and where the solver moves the second one
const CLASH_A: Block = { id: "x", code: "CS320", kind: "LEC", room: "LH-1", c: 2, r: 2 };
const CLASH_B: Block = { id: "y", code: "CS330", kind: "LEC", room: "LH-4", c: 2, r: 2 };
const MOVE_TO = { c: 3, r: 1 };

const STEPS = [
  ["01", "Every rule goes in", "Rooms and capacities, who teaches what, labs that need three hours, the lunch break."],
  ["02", "Clashes show up at once", "Dr. Rao can't teach two sections at the same time. Velora flags it before anyone prints a timetable."],
  ["03", "Repaired, with a reason", "The solver moves one class and says why. Every placement can be explained, so it can be defended."],
] as const;

function Tile({ b, className }: { b: Block; className?: string }) {
  return (
    <div data-block={b.id} className={cn("pp-block absolute p-[3px] sm:p-1", className)} style={{ "--c": b.c, "--r": b.r } as React.CSSProperties}>
      <div className={cn("pp-face flex h-full flex-col justify-between overflow-hidden rounded-[4px] border-2 border-[#111] px-1.5 py-1 text-[#111] shadow-mount sm:px-2", FILL[b.kind])}>
        <span className="flex items-center justify-between gap-1">
          <span className="truncate font-mono text-[10px] font-semibold sm:text-[11.5px]">{b.code}</span>
          <span className="pp-tag hidden rounded-[2px] bg-[#111] px-1 font-mono text-[8.5px] font-semibold text-white sm:inline">{b.kind}</span>
        </span>
        <span className="truncate text-[10px] font-semibold opacity-75 sm:text-[11px]">{b.room}</span>
      </div>
    </div>
  );
}

/** A small timetable that tells the product's story when it scrolls into view: classes land, two of
 * them clash, the solver moves one and explains the move. The state (clash, solving, solved) is a data
 * attribute that CSS colours from the theme tokens; GSAP only moves things. */
export function ProductPreview() {
  const root = useRef<HTMLDivElement>(null);
  const tl = useRef<gsap.core.Timeline | null>(null);

  // Desktop: the preview pins under the header and scrolling plays the story (and rewinds it).
  // Smaller screens: it plays once when it scrolls into view, with a replay button.
  useGsap(root, ({ reduce, desktop }) => {
    const el = root.current!;
    const moved = el.querySelector<HTMLElement>('[data-block="y"]');
    if (reduce) {
      el.dataset.state = "solved";
      gsap.set(moved, { "--c": MOVE_TO.c, "--r": MOVE_TO.r, x: 0, y: 0 });
      return;
    }
    el.dataset.state = "idle";
    el.toggleAttribute("data-scrub", desktop);
    const t = gsap.timeline({ paused: !desktop, defaults: { ease: "power3.out" } });
    t.set(moved, { "--c": CLASH_B.c, "--r": CLASH_B.r })
      .from(".pp-calm", { autoAlpha: 0, y: 14, scale: 0.9, rotate: -3, stagger: 0.06, duration: 0.5 })
      .from('[data-block="x"]', { autoAlpha: 0, y: 14, scale: 0.9, duration: 0.4 }, "-=0.1")
      .fromTo(moved, { autoAlpha: 0, x: 80, rotate: 6 }, { autoAlpha: 1, x: 7, y: 7, rotate: 0, duration: 0.6 }, "+=0.15")
      .addLabel("clash")
      .fromTo('[data-block="x"] .pp-face, [data-block="y"] .pp-face', { x: 0 }, { keyframes: { x: [-4, 4, -3, 3, 0] }, duration: 0.4, ease: "none" })
      .fromTo(".pp-badge", { scale: 0.4, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.35, ease: "back.out(3)" }, "<")
      .addLabel("solving", "+=0.6")
      .fromTo(".pp-progress", { scaleX: 0 }, { scaleX: 1, duration: 1.1, ease: "power1.inOut" }, "solving")
      .to(moved, { "--c": MOVE_TO.c, "--r": MOVE_TO.r, x: 0, y: 0, duration: 0.8, ease: "power3.inOut" })
      .addLabel("solved")
      .to(".pp-badge", { scale: 0.4, autoAlpha: 0, duration: 0.2 }, "<")
      .fromTo(".pp-why-text", { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.45 }, "+=0.05")
      .to({}, { duration: 0.2 }); // a beat on the answer before the pin lets go
    // the state follows the playhead, so scrubbing backwards rewinds the colours too
    const at = (l: string) => t.labels[l];
    t.eventCallback("onUpdate", () => {
      const now = t.time();
      el.dataset.state = now >= at("solved") ? "solved" : now >= at("solving") ? "solving" : now >= at("clash") ? "clash" : "idle";
    });
    tl.current = t;
    if (desktop) {
      ScrollTrigger.create({ trigger: el, start: "top 92px", end: "+=520", pin: true, scrub: 0.3, animation: t, anticipatePin: 1 });
    } else {
      ScrollTrigger.create({ trigger: el, start: "top 72%", once: true, onEnter: () => void t.play(0) });
    }
    return () => void (tl.current = null);
  });

  return (
    <div ref={root} data-state="solved" className="pp grid items-start gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-12">
      <div className="overflow-hidden rounded-[6px] border-2 border-rule-strong bg-sheet shadow-panel">
        {/* a slim app bar: what you're looking at and the solver's state */}
        <div className="flex items-center justify-between gap-3 border-b-2 border-rule-strong bg-sheet-2 px-3 py-2.5 sm:px-4">
          <div className="flex min-w-0 items-center gap-2">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Timetable</span>
            <span className="truncate text-[13px] font-extrabold">CSE · 3rd year · Section A</span>
          </div>
          <span className="pp-status inline-flex shrink-0 items-center gap-1.5 rounded-[3px] border-2 px-2 py-0.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em]">
            <span className="pp-dot size-1.5 rounded-full" />
            <span className="pp-s-idle">Placing</span>
            <span className="pp-s-clash">1 clash</span>
            <span className="pp-s-solving">Solving</span>
            <span className="pp-s-solved">0 clashes</span>
          </span>
        </div>
        <div className="relative h-[3px] bg-transparent">
          <div className="pp-progress absolute inset-0 origin-left bg-signal" />
        </div>

        <div className="grid grid-cols-[38px_minmax(0,1fr)] p-2 sm:grid-cols-[52px_minmax(0,1fr)] sm:p-3">
          <span />
          <div className="grid grid-cols-5 pb-1.5">
            {DAYS.map((d) => (
              <span key={d} className="text-center font-mono text-[10px] font-semibold tracking-[0.08em] text-ink-3 sm:text-[11px]">
                {d}
              </span>
            ))}
          </div>
          <div className="grid grid-rows-4">
            {PERIODS.map(([p, t]) => (
              <span key={p} className="flex h-[58px] flex-col justify-center font-mono text-[10px] leading-tight text-ink-3 sm:h-[68px] sm:text-[11px]">
                <b className="font-semibold text-ink">{p}</b>
                {t}
              </span>
            ))}
          </div>
          <div className="pp-board relative grid grid-cols-5 grid-rows-4 rounded-[4px] border-2 border-rule">
            {Array.from({ length: 20 }, (_, i) => (
              <span key={i} className={cn("border-rule", i % 5 !== 4 && "border-r", i < 15 && "border-b")} />
            ))}
            {BLOCKS.map((b) => (
              <Tile key={b.id} b={b} className="pp-calm" />
            ))}
            <Tile b={CLASH_A} className="pp-clashing" />
            <Tile b={CLASH_B} className="pp-clashing pp-moving z-[2]" />
            <span
              className="pp-badge pointer-events-none absolute z-[3] grid size-6 place-items-center rounded-full border-2 border-[#111] bg-stop-vivid font-mono text-[12px] font-bold text-[#111]"
              style={{ left: `calc(${(CLASH_A.c + 1) * 20}% - 14px)`, top: `calc(${CLASH_A.r * 25}% - 8px)` }}
              aria-hidden
            >
              !
            </span>
          </div>
        </div>
        {/* the reason, as the "Why here?" panel gives it */}
        <div className="pp-why flex items-start gap-3 border-t-2 border-rule-strong bg-sheet-2 px-3 py-3 text-[13px] leading-snug text-ink transition-opacity duration-300 sm:px-4">
          <span className="mt-0.5 inline-flex shrink-0 items-center gap-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">
            <span className="pp-why-dot size-1.5 rounded-full" /> Why here?
          </span>
          <p className="pp-why-text">
            <b className="font-extrabold">CS330 moved to Thu P2.</b> Dr. Rao teaches CS320 on Wed P3, and LH-4 is free on Thursday morning.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <ol className="flex flex-col gap-3">
          {STEPS.map(([n, title, body], i) => (
            <li key={n} data-step={i + 1} className="pp-step rounded-[6px] border-2 p-4 transition-[background-color,border-color,box-shadow,transform] duration-300">
              <div className="flex items-baseline gap-3">
                <span className="pp-step-n font-mono text-[12px] font-semibold">{n}</span>
                <div>
                  <h3 className="text-[16px] font-extrabold leading-tight">{title}</h3>
                  <p className="mt-1 text-[14px] leading-relaxed text-ink-2">{body}</p>
                </div>
              </div>
            </li>
          ))}
        </ol>
        <button
          type="button"
          onClick={() => tl.current?.play(0)}
          className="pp-replay group inline-flex w-fit items-center gap-2 rounded-[4px] px-1 py-1 text-[13px] font-bold text-ink-2 hover:text-ink"
        >
          <RotateCcw className="size-4 transition-transform duration-500 group-hover:-rotate-[200deg]" /> Play it again
        </button>
      </div>
    </div>
  );
}
