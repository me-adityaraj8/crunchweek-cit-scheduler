// Velo's face. A mood sets targets; every frame each value eases toward its target, so moods blend
// instead of switching. Blinks, glances and the error shake are scheduled here too. Plain TypeScript:
// the orb reads `face` every frame and nothing here touches React or WebGL.

export type Mood = "idle" | "listening" | "thinking" | "speaking" | "happy" | "confused" | "error";

export interface Face {
  /** how far the surface is pushed in and out, and how fast the noise flows */
  amp: number;
  freq: number;
  speed: number;
  /** rim and halo brightness, energy on the crests, colour saturation */
  glow: number;
  energy: number;
  sat: number;
  /** body: breathing scale, float height, a sideways offset for the error shake */
  breath: number;
  float: number;
  shakeX: number;
  /** eyes: openness (blinks), smile arcs, flat lines, per-eye squint, head tilt, gaze, size */
  open: number;
  happy: number;
  flat: number;
  squintL: number;
  squintR: number;
  tilt: number;
  lookX: number;
  lookY: number;
  eye: number;
}

const BASE: Face = {
  amp: 0.065, freq: 0.8, speed: 0.45, glow: 0.35, energy: 0.2, sat: 1, breath: 0.02, float: 0.06, shakeX: 0,
  open: 1, happy: 0, flat: 0, squintL: 0, squintR: 0, tilt: 0, lookX: 0, lookY: 0, eye: 1,
};

const TARGET: Record<Mood, Partial<Face>> = {
  idle: {},
  listening: { amp: 0.08, freq: 0.9, speed: 0.6, glow: 0.55, energy: 0.35, breath: 0.015, float: 0.03, eye: 1.15, lookY: 0.05 },
  thinking: { amp: 0.11, freq: 1.15, speed: 1.4, glow: 0.6, energy: 0.55, sat: 1.05, open: 0.85, eye: 0.95, lookY: 0.45, float: 0.04 },
  speaking: { amp: 0.09, freq: 0.95, speed: 0.8, glow: 0.5, energy: 0.4, eye: 1.05, float: 0.04 },
  happy: { amp: 0.075, speed: 0.7, glow: 0.75, energy: 0.5, happy: 1, float: 0.08 },
  confused: { amp: 0.05, speed: 0.35, glow: 0.3, energy: 0.15, squintL: 0.55, tilt: -0.18, lookX: 0.25, lookY: 0.1, float: 0.03 },
  error: { amp: 0.04, speed: 0.25, glow: 0.15, energy: 0.05, sat: 0.35, flat: 1, float: 0.01, breath: 0.005 },
};

// eye shapes settle faster than the body, so an expression reads before the colour has finished moving
const FAST = new Set<keyof Face>(["open", "happy", "flat", "squintL", "squintR", "tilt", "lookX", "lookY", "eye"]);
const BLINK = 0.16;

export class ExpressionController {
  face: Face = { ...BASE };
  mood: Mood = "idle";
  private target: Face = { ...BASE };
  private t = 0;
  private nextBlink: number;
  private blinkAt = -1;
  private doubleBlink = false;
  private nextGlance: number;
  private glance = { x: 0, y: 0 };
  private shakeAt = -1;

  constructor(
    private rand: () => number = Math.random,
    private reduced = false,
  ) {
    this.nextBlink = 2 + rand() * 3;
    this.nextGlance = 1.5 + rand() * 2;
    if (reduced) this.still();
  }

  setMood(m: Mood): this {
    if (m === this.mood) return this;
    if (m === "error") this.shakeAt = this.t;
    this.mood = m;
    this.target = { ...BASE, ...TARGET[m] };
    if (this.reduced) this.still();
    return this;
  }

  /** With reduced motion the body holds still and moods show only in colour and eyes, at once. */
  private still() {
    this.face = { ...this.target, amp: 0, speed: 0, float: 0, breath: 0, shakeX: 0, lookX: 0, lookY: 0 };
  }

  /** Advance by dt seconds. `level` is the live audio level, 0 to 1 (mic while listening, voice while speaking). */
  update(dt: number, level: number): Face {
    if (this.reduced) return this.face;
    this.t += dt;
    const target: Face = { ...this.target };
    const lv = Math.max(0, Math.min(1, level));

    if (this.mood === "listening" || this.mood === "speaking") {
      target.energy += lv * 0.7;
      target.amp += lv * 0.16;
      target.glow += lv * 0.55;
      target.eye += lv * 0.08;
    }

    // gaze: wander when idle, small when listening, scan while thinking
    if (this.t >= this.nextGlance) {
      const reach = this.mood === "idle" ? 0.35 : this.mood === "listening" ? 0.1 : 0.15;
      this.glance = { x: (this.rand() * 2 - 1) * reach, y: (this.rand() * 2 - 1) * reach * 0.6 };
      this.nextGlance = this.t + 1.5 + this.rand() * 2;
    }
    if (this.mood === "thinking") target.lookX = 0.35 * Math.sin(this.t * 2.2);
    else if (this.mood !== "confused" && this.mood !== "error") {
      target.lookX += this.glance.x;
      target.lookY += this.glance.y;
    }

    const k = 1 - Math.exp(-dt * 5);
    const kFast = 1 - Math.exp(-dt * 10);
    for (const key of Object.keys(target) as (keyof Face)[]) {
      this.face[key] += (target[key] - this.face[key]) * (FAST.has(key) ? kFast : k);
    }

    // blinks (sometimes two), never while the eyes are flat lines
    if (this.mood !== "error" && this.t >= this.nextBlink && this.blinkAt < 0) {
      this.blinkAt = this.t;
      this.doubleBlink = this.rand() < 0.2;
    }
    if (this.blinkAt >= 0) {
      const p = (this.t - this.blinkAt) / BLINK;
      if (p >= 1) {
        if (this.doubleBlink) {
          this.doubleBlink = false;
          this.blinkAt = this.t + 0.08;
        } else {
          this.blinkAt = -1;
          this.nextBlink = this.t + 2.4 + this.rand() * 3.1;
        }
      } else if (p >= 0) {
        this.face.open = Math.min(this.face.open, Math.abs(Math.cos(Math.PI * p)) * 0.95 + 0.02);
      }
    }

    // one restrained shake when an error arrives
    const s = this.t - this.shakeAt;
    this.face.shakeX = this.shakeAt >= 0 && s < 0.5 ? Math.sin(s * 42) * 0.06 * (1 - s / 0.5) : 0;
    return this.face;
  }
}

interface Turn {
  cards: { kind: string }[];
  reply: string;
}

/** What Velo's latest state looks like on its face. Happy and confused are brief: the caller holds them a moment. */
export function moodFor({ pending, failed, last }: { pending?: boolean; failed?: boolean; last?: Turn | null }): Mood {
  if (pending) return "thinking";
  if (failed) return "error";
  if (last?.cards.length) return "happy";
  if (last && last.reply.trim().endsWith("?")) return "confused";
  return "idle";
}
