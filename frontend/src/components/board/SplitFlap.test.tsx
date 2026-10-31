import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flapPath, SplitFlap } from "./SplitFlap";

const halves = (container: HTMLElement) =>
  [...container.querySelectorAll(".flap")].map((f) => `${f.querySelector(".t i")?.textContent}${f.querySelector(".b i")?.textContent}`);

describe("split-flap", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("steps through at most seven characters to reach the target", () => {
    expect(flapPath("A", "C")).toEqual(["B", "C"]);
    expect(flapPath(" ", "1")).toHaveLength(7);
    expect(flapPath(" ", "1").at(-1)).toBe("1");
    expect(flapPath("Z", "Z")).toEqual([]);
    expect(flapPath("A", ":")).toEqual([":"]);
  });

  it("settles both halves on the new text, even when animations never run", () => {
    const { container, rerender } = render(<SplitFlap value="17:47" />);
    act(() => vi.advanceTimersByTime(2000));
    expect(halves(container)).toEqual(["11", "77", "::", "44", "77"]);
    rerender(<SplitFlap value="17:48" />);
    act(() => vi.advanceTimersByTime(2000));
    expect(halves(container)).toEqual(["11", "77", "::", "44", "88"]);
  });

  it("names the value for screen readers", () => {
    const { getByRole } = render(<SplitFlap value="ON TIME" />);
    expect(getByRole("img").getAttribute("aria-label")).toBe("ON TIME");
  });
});
