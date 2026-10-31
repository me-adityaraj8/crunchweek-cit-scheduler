import { useEffect, useRef, useState } from "react";

export function useMediaQuery(query: string) {
  const [match, setMatch] = useState(() => (typeof window !== "undefined" ? window.matchMedia(query).matches : false));
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return match;
}

export function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

/** The previous value of something, for animating from old to new. */
export function usePrevious<T>(value: T) {
  const ref = useRef<T | undefined>(undefined);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref.current;
}

/** A counter that ticks every `delayMs` (after Skiper UI's useLoop): key an animated element on it to
 * cycle content. It holds still while the tab is hidden, and when `paused` (reduced motion). */
export function useLoop(delayMs: number, paused = false) {
  const [key, setKey] = useState(0);
  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") setKey((k) => k + 1);
    }, delayMs);
    return () => clearInterval(id);
  }, [delayMs, paused]);
  return key;
}
