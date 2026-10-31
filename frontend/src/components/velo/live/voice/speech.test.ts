import { describe, expect, it } from "vitest";
import { speechChunks, speechText } from "./speech";

describe("what Velo says out loud", () => {
  it("reads periods and typographic marks the way a person would say them", () => {
    expect(speechText("No—LH‑1 is busy in period 4 (11:00‑12:00); P1‑P3, P5 are free.")).toBe(
      "No, LH-1 is busy in period 4 (11:00-12:00); periods 1 to 3, period 5 are free.",
    );
  });

  it("reads a span of periods as a range", () => {
    expect(speechText("free in periods\u202f1\u20113 and\u202f5")).toBe("free in periods 1 to 3 and 5");
  });

  it("starts with a short first piece so the voice begins quickly, and keeps every word", () => {
    const text = "MA 101 has an exam on Saturday afternoon. It is in the auditorium, LH-1 and LH-4. There are 410 seats for 360 students. Want me to open the exam page?";
    const parts = speechChunks(text);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts[0]).toBe("MA 101 has an exam on Saturday afternoon.");
    expect(parts.join(" ")).toBe(text);
    expect(parts.every((p) => p.length <= 220)).toBe(true);
  });

  it("splits a long sentence at a comma or semicolon rather than mid-word", () => {
    const text = "No, LH-1 is occupied for a lecture in period 4 from 11 to 12 on Monday morning; the other morning periods, 1 to 3 and 5, are free for a booking.";
    const parts = speechChunks(text);
    expect(parts[0].length).toBeLessThanOrEqual(70);
    expect(parts.join(" ")).toBe(text);
  });

  it("gives nothing to say for empty text", () => {
    expect(speechChunks("   ")).toEqual([]);
  });
});
