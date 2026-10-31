import { describe, expect, it } from "vitest";
import { initial, voice, type VoiceEvent, type VoiceState } from "./machine";

const run = (events: VoiceEvent[], from: VoiceState = initial) => events.reduce(voice, from);

describe("voice state machine", () => {
  it("goes listening → thinking → speaking → listening", () => {
    let s = run([{ type: "OPEN" }, { type: "READY" }]);
    expect(s.phase).toBe("listening");
    s = voice(s, { type: "HEARD", text: "free rooms" });
    expect(s.interim).toBe("free rooms");
    s = voice(s, { type: "FINAL", text: "free rooms tuesday" });
    expect(s).toMatchObject({ phase: "processing", said: "free rooms tuesday", interim: "" });
    s = voice(s, { type: "REPLY", text: "3 rooms are free." });
    expect(s).toMatchObject({ phase: "speaking", reply: "3 rooms are free." });
    s = voice(s, { type: "SPOKEN" });
    expect(s.phase).toBe("listening");
  });

  it("never treats silence as something said", () => {
    const s = run([{ type: "OPEN" }, { type: "READY" }, { type: "FINAL", text: "   " }]);
    expect(s.phase).toBe("listening");
    expect(s.said).toBe("");
  });

  it("muted replies are shown, not spoken", () => {
    const s = run([{ type: "OPEN" }, { type: "READY" }, { type: "MUTE" }, { type: "FINAL", text: "hi" }, { type: "REPLY", text: "Hello." }]);
    expect(s).toMatchObject({ phase: "listening", reply: "Hello.", muted: true });
  });

  it("can be interrupted while speaking", () => {
    const s = run([{ type: "OPEN" }, { type: "READY" }, { type: "FINAL", text: "hi" }, { type: "REPLY", text: "Hello there." }, { type: "INTERRUPT" }]);
    expect(s.phase).toBe("listening");
  });

  it("pauses and resumes the mic", () => {
    let s = run([{ type: "OPEN" }, { type: "READY" }, { type: "PAUSE" }]);
    expect(s.phase).toBe("paused");
    expect(voice(s, { type: "HEARD", text: "ignored" }).interim).toBe("");
    s = voice(s, { type: "RESUME" });
    expect(s.phase).toBe("listening");
  });

  it("names a denied mic and can retry", () => {
    let s = run([{ type: "OPEN" }, { type: "FAIL", message: "Microphone access was blocked." }]);
    expect(s).toMatchObject({ phase: "error", error: "Microphone access was blocked." });
    s = voice(s, { type: "RETRY" });
    expect(s).toMatchObject({ phase: "starting", error: null });
  });

  it("ignores late events after closing", () => {
    const s = run([{ type: "OPEN" }, { type: "READY" }, { type: "CLOSE" }, { type: "REPLY", text: "late" }, { type: "SPOKEN" }]);
    expect(s.phase).toBe("off");
    expect(s.reply).toBeNull();
  });
});
