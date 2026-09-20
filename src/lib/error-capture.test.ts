// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { consumeLastCapturedError } from "./error-capture";

afterEach(() => {
  vi.useRealTimers();
});

describe("consumeLastCapturedError", () => {
  it("returns undefined when nothing has been captured", () => {
    expect(consumeLastCapturedError()).toBeUndefined();
  });

  it("captures a window 'error' event and returns it once", () => {
    const err = new Error("boom");
    window.dispatchEvent(new ErrorEvent("error", { error: err }));
    expect(consumeLastCapturedError()).toBe(err);
    expect(consumeLastCapturedError()).toBeUndefined(); // consumed
  });

  it("captures an unhandledrejection reason", () => {
    const reason = new Error("rejected");
    const event = new Event("unhandledrejection") as PromiseRejectionEvent & {
      reason: unknown;
    };
    Object.defineProperty(event, "reason", { value: reason });
    window.dispatchEvent(event);
    expect(consumeLastCapturedError()).toBe(reason);
  });

  it("expires a captured error after the TTL", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const err = new Error("stale");
    window.dispatchEvent(new ErrorEvent("error", { error: err }));
    vi.advanceTimersByTime(5001);
    expect(consumeLastCapturedError()).toBeUndefined();
  });
});
