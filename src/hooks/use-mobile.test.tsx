// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useIsMobile } from "./use-mobile";

function mockMatchMedia(matches: boolean) {
  const listeners: Array<() => void> = [];
  window.matchMedia = vi.fn().mockImplementation(() => ({
    matches,
    addEventListener: (_: string, cb: () => void) => listeners.push(cb),
    removeEventListener: vi.fn(),
  }));
  return { fire: () => listeners.forEach((cb) => cb()) };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useIsMobile", () => {
  it("reports mobile when the viewport is under the breakpoint", () => {
    mockMatchMedia(true);
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(400);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it("reports desktop when the viewport is at/above the breakpoint", () => {
    mockMatchMedia(false);
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(1024);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("updates when the media query change event fires", () => {
    const { fire } = mockMatchMedia(false);
    const widthSpy = vi.spyOn(window, "innerWidth", "get").mockReturnValue(1024);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    widthSpy.mockReturnValue(320);
    act(() => fire());
    expect(result.current).toBe(true);
  });
});
