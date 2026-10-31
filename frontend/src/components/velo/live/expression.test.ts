import { describe, expect, it } from "vitest";
import { ExpressionController, moodFor } from "./expression";

/** Run the controller for `seconds` at 60 fps with a fixed audio level. */
function run(c: ExpressionController, seconds: number, level = 0) {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) c.update(1 / 60, level);
  return c.face;
}

describe("ExpressionController", () => {
  it("eases into a mood instead of jumping", () => {
    const c = new ExpressionController(() => 0.5);
    c.setMood("happy");
    const first = c.update(1 / 60, 0).happy;
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(0.3);
    expect(run(c, 1.2).happy).toBeGreaterThan(0.9);
  });

  it("blinks on its own when idle", () => {
    const c = new ExpressionController(() => 0.5);
    let closed = false;
    for (let i = 0; i < 60 * 8; i++) if (c.update(1 / 60, 0).open < 0.2) closed = true;
    expect(closed).toBe(true);
  });

  it("listening follows the voice level", () => {
    const quiet = run(new ExpressionController(() => 0.5).setMood("listening"), 1, 0).energy;
    const loud = run(new ExpressionController(() => 0.5).setMood("listening"), 1, 0.9).energy;
    expect(loud).toBeGreaterThan(quiet + 0.2);
  });

  it("an error drains colour and flattens the eyes", () => {
    const f = run(new ExpressionController(() => 0.5).setMood("error"), 1.5);
    expect(f.sat).toBeLessThan(0.6);
    expect(f.flat).toBeGreaterThan(0.8);
  });

  it("confused squints one eye more than the other", () => {
    const f = run(new ExpressionController(() => 0.5).setMood("confused"), 1.5);
    expect(Math.abs(f.squintL - f.squintR)).toBeGreaterThan(0.3);
    expect(Math.abs(f.tilt)).toBeGreaterThan(0.05);
  });

  it("holds still with reduced motion but still shows the mood", () => {
    const c = new ExpressionController(() => 0.5, true).setMood("happy");
    const f = c.update(1 / 60, 0);
    expect(f.happy).toBe(1);
    expect(f.amp).toBe(0);
  });
});

describe("moodFor", () => {
  it("maps what Velo is doing to a mood", () => {
    expect(moodFor({ pending: true })).toBe("thinking");
    expect(moodFor({ last: { cards: [{ kind: "rooms" }], reply: "3 rooms are free." } })).toBe("happy");
    expect(moodFor({ last: { cards: [], reply: "Which day and time?" } })).toBe("confused");
    expect(moodFor({ failed: true })).toBe("error");
    expect(moodFor({})).toBe("idle");
  });
});
