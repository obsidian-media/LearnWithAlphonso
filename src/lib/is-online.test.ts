import { afterEach, describe, expect, it, vi } from "vitest";
import { isOnline } from "./is-online";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("isOnline", () => {
  it("is true when the request succeeds", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    expect(await isOnline()).toBe(true);
  });

  it("is false when the request rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    expect(await isOnline()).toBe(false);
  });

  it("is false when the request hangs past 8 seconds (aborted)", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_u: string, init: RequestInit) =>
          new Promise((_res, rej) => {
            init.signal!.addEventListener("abort", () =>
              rej(new DOMException("aborted", "AbortError")),
            );
          }),
      ),
    );
    const p = isOnline();
    await vi.advanceTimersByTimeAsync(7999);
    let settled = false;
    void p.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await p).toBe(false);
  });
});
