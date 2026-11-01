import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useDemoAccounts } from "@/api/hooks";
import { byRole } from "@/lib/accounts";
import { cn } from "@/lib/utils";
import { ANCHORS, CONFLICTS } from "./campus";
import { CHAPTERS, PALETTE, story } from "./story-state";
import "./landing.css";

gsap.registerPlugin(ScrollTrigger);
// phones resize the viewport as the address bar slides; re-measuring then would jolt the pinned story
ScrollTrigger.config({ ignoreMobileResize: true });
const Scene = lazy(() => import("./Scene"));

const NAMES = ["Arrival", "Campus", "Puzzle", "Clash", "Solve", "Disruption", "Velo"];
const CHIPS: [string, string][] = [["ROOM", PALETTE.violet], ["TEACHER", PALETTE.sodium], ["PERIOD", PALETTE.pink], ["GROUP", PALETTE.ice]];

function webgl() {
  try {
    return !!document.createElement("canvas").getContext("webgl2");
  } catch {
    return false;
  }
}

/** Text split into letters for staggered reveals; screen readers get the word whole. */
function Split({ text, className }: { text: string; className?: string }) {
  return (
    <span className={className} aria-label={text} role="text">
      {[...text].map((c, i) => (
        <span key={i} aria-hidden className="ch">
          {c === " " ? " " : c}
        </span>
      ))}
    </span>
  );
}

/** A line that rises out of a mask. */
const Line = ({ children }: { children: React.ReactNode }) => (
  <span className="lx-line">
    <span>{children}</span>
  </span>
);

/** The landing story: a pinned stage over the 3D campus, scrubbed by scroll through seven chapters.
 * Under reduced motion, or with the motion off, it reads as plain stacked sections without the 3D. */
export default function Story({ onEnter }: { onEnter: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [env] = useState(() => ({
    reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
    mobile: matchMedia("(max-width: 767px), (pointer: coarse)").matches,
    gl: webgl(),
  }));
  const [active, setActive] = useState(true);
  const [ready, setReady] = useState(false);
  const { data: accounts } = useDemoAccounts();
  const roles = accounts ? byRole(accounts) : null;
  const stats = roles
    ? [
        [roles.faculty.length, "faculty"],
        [roles.coordinator.length, "departments"],
        [roles.club.length, "clubs"],
      ].filter(([n]) => (n as number) > 0)
    : [];

  useLayoutEffect(() => {
    story.t = 0;
    if (env.reduced) return;
    const ctx = gsap.context(() => {
      const rail = gsap.utils.toArray<HTMLElement>(".lx-rail button");
      const bar = root.current!.querySelector<HTMLElement>(".lx-bar i")!;
      const label = root.current!.querySelector<HTMLElement>(".lx-now")!;
      let shown = -1;
      const hud = () => {
        const i = Math.min(CHAPTERS - 1, Math.floor(story.t));
        bar.style.transform = `scaleX(${(story.t / CHAPTERS).toFixed(4)})`;
        if (i === shown) return;
        shown = i;
        rail.forEach((b, j) => b.toggleAttribute("data-on", j === i));
        label.textContent = `${String(i).padStart(2, "0")} / ${NAMES[i].toUpperCase()}`;
      };

      gsap.set(".lx-panel:not(.lx-p0)", { autoAlpha: 0 });
      gsap.from(".lx-p0 .ch", { yPercent: 110, opacity: 0, stagger: 0.06, duration: 1.2, ease: "expo.out", delay: 0.15 });
      gsap.from(".lx-p0 .lx-fade", { y: 24, opacity: 0, stagger: 0.12, duration: 0.9, ease: "power3.out", delay: 0.6 });

      const tl = gsap.timeline({
        defaults: { ease: "none" },
        onUpdate: hud,
        scrollTrigger: { trigger: stage.current, start: "top top", end: () => `+=${innerHeight * (env.mobile ? 8 : 11)}`, pin: true, scrub: 1.1, anticipatePin: 1, invalidateOnRefresh: true },
      });
      const show = (i: number, at: number) => tl.set(`.lx-p${i}`, { autoAlpha: 1 }, at);
      const hide = (i: number, at: number) => tl.set(`.lx-p${i}`, { autoAlpha: 0 }, at);
      const rise = (sel: string, at: number) => tl.from(sel, { yPercent: 118, rotate: 3, stagger: 0.06, duration: 0.28, ease: "power3.out" }, at);
      const count = (sel: string, at: number, dur: number) =>
        root.current!.querySelectorAll<HTMLElement>(sel).forEach((el) => {
          const o = { v: 0 };
          tl.to(o, { v: 1, duration: dur, onUpdate: () => void (el.textContent = String(Math.round(Number(el.dataset.from ?? 0) + (Number(el.dataset.to) - Number(el.dataset.from ?? 0)) * o.v))) }, at);
        });

      tl.to(story, { t: CHAPTERS, duration: CHAPTERS }, 0);

      // 00 arrival: the name lifts away as the camera dives
      tl.to(".lx-p0 .ch", { yPercent: -130, rotateX: 80, opacity: 0, stagger: 0.035, duration: 0.4, ease: "power2.in" }, 0.4)
        .to(".lx-p0 .lx-tag", { y: -140, opacity: 0, duration: 0.35 }, 0.35)
        .to(".lx-p0 .lx-fade:not(.lx-tag)", { y: -30, opacity: 0, duration: 0.2 }, 0.3);
      hide(0, 0.95);

      // 01 campus
      show(1, 0.9);
      rise(".lx-p1 .lx-line > span", 0.92);
      tl.from(".lx-p1 .lx-fade", { y: 40, opacity: 0, stagger: 0.07, duration: 0.25, ease: "power2.out" }, 1.1)
        .fromTo(".lx-p1 .lx-copy", { y: 50 }, { y: -50, duration: 1.1 }, 0.9)
        .to(".lx-p1 .lx-copy", { xPercent: -45, opacity: 0, duration: 0.22, ease: "power2.in" }, 1.8);
      count(".lx-p1 [data-to]", 1.15, 0.45);
      hide(1, 2.03);

      // 02 puzzle: in from the right, the days run sideways under it, the four needs light up
      show(2, 1.98);
      tl.from(".lx-p2 .lx-copy", { xPercent: 55, opacity: 0, duration: 0.3, ease: "power3.out" }, 2.0)
        .fromTo(".lx-days", { xPercent: 5, opacity: 0 }, { xPercent: -48, opacity: 1, duration: 1.05 }, 1.98)
        .to(".lx-days", { opacity: 0, duration: 0.12 }, 2.88);
      rise(".lx-p2 .lx-line > span", 2.06);
      gsap.utils.toArray<HTMLElement>(".lx-chip").forEach((chip, i) => tl.to(chip, { backgroundColor: CHIPS[i][1], borderColor: CHIPS[i][1], color: PALETTE.night, duration: 0.06 }, 2.38 + i * 0.12));
      tl.to(".lx-p2 .lx-copy", { scale: 0.86, opacity: 0, filter: "blur(10px)", duration: 0.2 }, 2.82);
      hide(2, 3.03);

      // 03 clash: the word slams in, the stage shakes, the broken rules fly up at different depths
      show(3, 3.0);
      tl.from(".lx-clash .ch", { scale: 3.4, opacity: 0, stagger: 0.025, duration: 0.18, ease: "power4.out" }, 3.02)
        .to(".lx-shake", { keyframes: { x: [0, -18, 14, -9, 6, -3, 0], y: [0, 7, -5, 3, -1, 0, 0] }, duration: 0.14 }, 3.12)
        .from(".lx-card", { opacity: 0, y: 140, rotateX: -55, rotateZ: (i) => [-9, 7, -4][i], stagger: 0.08, duration: 0.26, ease: "back.out(1.5)" }, 3.2)
        .to(".lx-card", { yPercent: (i) => [-40, -110, -70][i], duration: 0.55 }, 3.3)
        .from(".lx-p3 .lx-fade", { opacity: 0, y: 20, duration: 0.15 }, 3.4)
        .to(".lx-clash", { letterSpacing: "0.35em", opacity: 0, filter: "blur(16px)", duration: 0.25 }, 3.8)
        .to(".lx-card, .lx-p3 .lx-fade", { opacity: 0, scale: 0.6, stagger: 0.03, duration: 0.18 }, 3.8);
      hide(3, 4.06);

      // 04 solve: the clash count falls to zero as the board heals
      show(4, 4.0);
      tl.from(".lx-num", { scale: 0.4, opacity: 0, duration: 0.2, ease: "back.out(2)" }, 4.0);
      rise(".lx-p4 .lx-line > span", 4.05);
      count(".lx-p4 [data-to]", 4.1, 0.75);
      tl.from(".lx-p4 .lx-fade", { y: 30, opacity: 0, duration: 0.2 }, 4.3)
        .from(".lx-stamp", { scale: 2.8, rotate: -28, opacity: 0, duration: 0.14, ease: "back.out(2.2)" }, 4.78)
        .to(".lx-p4 .lx-copy", { yPercent: -35, opacity: 0, duration: 0.2, ease: "power2.in" }, 4.88);
      hide(4, 5.06);

      // 05 disruption
      show(5, 5.05);
      rise(".lx-p5 .lx-line > span", 5.1);
      tl.from(".lx-tagred", { clipPath: "inset(0 100% 0 0)", duration: 0.15 }, 5.3)
        .from(".lx-log li", { x: 60, opacity: 0, stagger: 0.12, duration: 0.15 }, 5.5)
        .to(".lx-p5 .lx-copy", { xPercent: 30, opacity: 0, duration: 0.18 }, 5.88);
      hide(5, 6.06);

      // 06 Velo
      show(6, 6.1);
      tl.from(".lx-p6 .ch", { yPercent: 130, skewY: 14, opacity: 0, stagger: 0.045, duration: 0.35, ease: "power3.out" }, 6.2).from(".lx-p6 .lx-fade", { y: 30, opacity: 0, stagger: 0.08, duration: 0.2 }, 6.55);

      rail.forEach((b, i) =>
        b.addEventListener("click", () => {
          const st = tl.scrollTrigger!;
          window.scrollTo({ top: st.start + (st.end - st.start) * ((i + 0.55) / CHAPTERS), behavior: "smooth" });
        }),
      );
      hud();
    }, root);
    return () => ctx.revert();
  }, [env]);

  // the scene runs only while the stage is on screen; the pointer tilts the camera a little
  useEffect(() => {
    if (env.reduced) return;
    const io = new IntersectionObserver(([e]) => setActive(e.isIntersecting));
    io.observe(stage.current!);
    const move = (e: PointerEvent) => {
      story.mx = (e.clientX / innerWidth) * 2 - 1;
      story.my = (e.clientY / innerHeight) * 2 - 1;
    };
    addEventListener("pointermove", move, { passive: true });
    return () => {
      io.disconnect();
      removeEventListener("pointermove", move);
      story.anchors = {};
    };
  }, [env]);

  const three = !env.reduced && env.gl;
  return (
    <div ref={root} className={cn("lx", env.reduced && "lx-reduced")}>
      <div ref={stage} className="lx-stage">
        <div className={cn("lx-canvas", ready && "is-ready")} aria-hidden>
          {three && (
            <Suspense fallback={null}>
              <Scene mobile={env.mobile} active={active} onReady={() => setReady(true)} />
            </Suspense>
          )}
        </div>
        {three && (
          <div className="lx-anchors" aria-hidden>
            {ANCHORS.map((a) => (
              <div key={a.id} ref={(el) => void (story.anchors[a.id] = el)} className={cn("lx-anchor", a.tone && `lx-anchor-${a.tone}`)}>
                <i />
                <span>{a.text}</span>
              </div>
            ))}
          </div>
        )}
        <div className="lx-grain" aria-hidden />

        <div className="lx-shake">
          <section className="lx-panel lx-p0">
            <p className="lx-kick lx-fade">Chilika Institute of Technology · scheduling engine</p>
            <h1 className="lx-mega">
              <Split text="VELORA" />
            </h1>
            <p className="lx-tag lx-serif lx-fade">a campus that schedules itself.</p>
            <p className="lx-cue lx-fade">
              Scroll to fly through the week <span />
            </p>
          </section>

          <section className="lx-panel lx-p1 lx-left">
            <div className="lx-copy">
              <p className="lx-kick">01 — The campus</p>
              <h2 className="lx-h">
                <Line>Every room</Line>
                <Line>
                  is a <em className="lx-serif">promise.</em>
                </Line>
              </h2>
              <p className="lx-body lx-fade">Lecture halls, labs and seminar rooms. Each holds one class at a time, and everyone wants ten o'clock.</p>
              {stats.length > 0 && (
                <dl className="lx-stats">
                  {stats.map(([n, what]) => (
                    <div key={what} className="lx-fade">
                      <dt className="lx-kick">{what}</dt>
                      <dd data-to={n}>{n}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </section>

          <section className="lx-panel lx-p2 lx-right">
            <div className="lx-copy">
              <p className="lx-kick">02 — The puzzle</p>
              <h2 className="lx-h">
                <Line>Each class needs</Line>
                <Line>a room, a teacher,</Line>
                <Line>
                  <em className="lx-serif">and a period.</em>
                </Line>
              </h2>
              <div className="lx-chips">
                {CHIPS.map(([c]) => (
                  <span key={c} className="lx-chip">
                    {c}
                  </span>
                ))}
              </div>
            </div>
            <div className="lx-days" aria-hidden>
              MON TUE WED THU FRI SAT MON TUE
            </div>
          </section>

          <section className="lx-panel lx-p3 lx-center">
            <h2 className="lx-clash" data-text="CLASH.">
              <Split text="CLASH." />
            </h2>
            <div className="lx-cards">
              {["Two classes, one room.", "One teacher, two places.", "A lab class in a lecture hall."].map((c) => (
                <div key={c} className="lx-card">
                  <span className="lx-kick">Hard rule broken</span>
                  {c}
                </div>
              ))}
            </div>
            <p className="lx-body lx-fade">By hand, fixing one clash makes two more.</p>
          </section>

          <section className="lx-panel lx-p4 lx-left">
            <div className="lx-copy">
              <p className="lx-kick">04 — The solve</p>
              <div className="lx-num">
                <span data-from={CONFLICTS} data-to={0}>
                  {CONFLICTS}
                </span>
                <small className="lx-kick">clashes on screen</small>
              </div>
              <h2 className="lx-h lx-h-sm">
                <Line>The solver moves classes</Line>
                <Line>
                  <em className="lx-serif">until no hard rule breaks.</em>
                </Line>
              </h2>
              <p className="lx-body lx-fade">Then it tells you why each class sits where it does.</p>
              <span className="lx-stamp">0 hard violations</span>
            </div>
          </section>

          <section className="lx-panel lx-p5 lx-right">
            <div className="lx-copy">
              <p className="lx-kick">05 — The disruption</p>
              <span className="lx-tagred">Block C · closed</span>
              <h2 className="lx-h">
                <Line>A building closes.</Line>
                <Line>
                  <em className="lx-serif">The week repairs itself.</em>
                </Line>
              </h2>
              <ul className="lx-log">
                <li>› 12 classes lose their room</li>
                <li>› 12 moved to free rooms</li>
                <li>› 0 new clashes · the rest stays put</li>
              </ul>
            </div>
          </section>

          <section className="lx-panel lx-p6 lx-center">
            <p className="lx-kick lx-fade">06 — Velo</p>
            <h2 className="lx-velo lx-serif">
              <Split text="Meet Velo." />
            </h2>
            <p className="lx-body lx-fade">Ask in plain words: book a hall, move a class, explain a slot. Velo drafts it. The rule checker decides.</p>
            <button type="button" className="lx-cta lx-fade" onClick={onEnter}>
              Enter Velora <span aria-hidden>→</span>
            </button>
          </section>
        </div>

        {!env.reduced && (
          <>
            <nav className="lx-rail" aria-label="Chapters">
              {NAMES.map((n, i) => (
                <button key={n} type="button">
                  <span>{String(i).padStart(2, "0")}</span> {n}
                </button>
              ))}
            </nav>
            <div className="lx-hud" aria-hidden>
              <span className="lx-now" />
              <span className="lx-bar">
                <i />
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
