// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useCountdown } from "./use-countdown";

afterEach(() => {
  vi.useRealTimers();
});

describe("useCountdown", () => {
  it("returns null when there is no target", () => {
    const { result } = renderHook(() => useCountdown(null));
    expect(result.current).toBeNull();
  });

  it("returns null once the target has already passed", () => {
    const { result } = renderHook(() => useCountdown(Date.now() - 1000));
    expect(result.current).toBeNull();
  });

  it("returns a formatted duration while counting down, and ticks every second", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const target = Date.now() + 5000;
    const { result } = renderHook(() => useCountdown(target));
    expect(result.current).toBe("0:05");

    act(() => vi.advanceTimersByTime(2000));
    expect(result.current).toBe("0:03");
  });

  it("flips to null once the countdown reaches the target while mounted", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const target = Date.now() + 1000;
    const { result } = renderHook(() => useCountdown(target));
    expect(result.current).toBe("0:01");

    act(() => vi.advanceTimersByTime(1000));
    expect(result.current).toBeNull();
  });
});
