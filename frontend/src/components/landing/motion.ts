import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useLayoutEffect, type DependencyList, type RefObject } from "react";

gsap.registerPlugin(ScrollTrigger);
ScrollTrigger.config({ ignoreMobileResize: true });

export { gsap, ScrollTrigger };

/** Runs GSAP setup scoped to one element, once for full motion and once (instead) for reduced motion,
 * and reverts every tween, ScrollTrigger and inline style on unmount or when the preference changes.
 * GSAP only ever moves things (transform, opacity, layout vars): colours stay in CSS tokens, so both
 * themes keep working mid-animation. */
export function useGsap(scope: RefObject<HTMLElement | null>, setup: (reduce: boolean) => void | (() => void), deps: DependencyList = []) {
  useLayoutEffect(() => {
    if (!scope.current) return;
    const mm = gsap.matchMedia(scope.current);
    mm.add({ reduce: "(prefers-reduced-motion: reduce)", full: "(prefers-reduced-motion: no-preference)" }, (c) =>
      setup(!!c.conditions?.reduce),
    );
    return () => mm.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/** True on devices with a fine pointer that can hover (magnetic buttons and tilt only make sense there). */
export const finePointer = () => matchMedia("(hover: hover) and (pointer: fine)").matches;
