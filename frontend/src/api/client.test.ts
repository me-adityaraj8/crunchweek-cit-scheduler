import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, request } from "./client";

describe("request timeouts", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("gives up on a server that never answers, with a clear error", async () => {
    vi.stubGlobal("fetch", (_: string, init: RequestInit) =>
      new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(init.signal!.reason))),
    );
    const err = await request("/velo", { body: {}, timeoutMs: 30 }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe("timeout");
  });

  it("still lets the caller cancel", async () => {
    vi.stubGlobal("fetch", (_: string, init: RequestInit) =>
      new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))),
    );
    const ctl = new AbortController();
    const p = request("/velo", { body: {}, timeoutMs: 5000, signal: ctl.signal }).catch((e) => e);
    ctl.abort();
    expect(((await p) as Error).name).toBe("AbortError");
  });
});
