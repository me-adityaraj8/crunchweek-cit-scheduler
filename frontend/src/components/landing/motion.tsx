import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Fragment, useLayoutEffect, type DependencyList, type RefObject } from "react";

gsap.registerPlugin(ScrollTrigger);
ScrollTrigger.config({ ignoreMobileResize: true });

export { gsap, ScrollTrigger };

export interface MotionCtx {
  /** the person asked for reduced motion: show final states, animate nothing */
  reduce: boolean;
  /** 1024px and up: the screens that get pinned, scroll-scrubbed sequences */
  desktop: boolean;
}

/** Runs GSAP setup scoped to one element, once per matching media state (motion or reduced, desktop
 * or not), and reverts every tween, ScrollTrigger, pin and inline style on unmount or when the state
 * changes. GSAP only ever moves things (transform, opacity, layout vars): colours stay in CSS tokens,
 * so both themes keep working mid-animation. */
export function useGsap(scope: RefObject<HTMLElement | null>, setup: (c: MotionCtx) => void | (() => void), deps: DependencyList = []) {
  useLayoutEffect(() => {
    if (!scope.current) return;
    const mm = gsap.matchMedia(scope.current);
    mm.add({ reduce: "(prefers-reduced-motion: reduce)", desktop: "(min-width: 1024px)" }, (c) =>
      setup({ reduce: !!c.conditions?.reduce, desktop: !!c.conditions?.desktop }),
    );
    return () => mm.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/** True on devices with a fine pointer that can hover (magnetic buttons and tilt only make sense there). */
export const finePointer = () => matchMedia("(hover: hover) and (pointer: fine)").matches;

/** A line of text split into words, each in a clipping box so it can rise into place. Screen readers
 * get the plain text once. */
export function splitWords(text: string) {
  // the space sits between the clipping boxes: inside one it would collapse
  return text.split(" ").map((w, i) => (
    <Fragment key={i}>
      {i > 0 && " "}
      <span className="lx-w" aria-hidden>
        <span className="lx-wi">{w}</span>
      </span>
    </Fragment>
  ));
}
