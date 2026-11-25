// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { hasPanel, hasRail, useViewportTier } from "./use-viewport-tier";

type Listener = () => void;

/** A window whose width can change, with matchMedia change events, like a browser being resized. */
function fakeWindow(initial: number) {
  let width = initial;
  const listeners = new Set<Listener>();
  window.matchMedia = ((query: string) => {
    const min = Number(/min-width:\s*(\d+)px/.exec(query)?.[1] ?? 0);
    return {
      get matches() {
        return width >= min;
      },
      media: query,
      addEventListener: (_: string, l: Listener) => listeners.add(l),
      removeEventListener: (_: string, l: Listener) => listeners.delete(l),
    };
  }) as unknown as typeof window.matchMedia;
  return (next: number) => {
    width = next;
    for (const l of listeners) l();
  };
}

afterEach(() => {
  // @ts-expect-error -- back to a bare window
  delete window.matchMedia;
});

describe("useViewportTier", () => {
  it("names the four layouts at their breakpoints: 768, 1024 and 1280", () => {
    const expected: [number, string][] = [
      [320, "phone"],
      [767, "phone"],
      [768, "tablet"],
      [1023, "tablet"],
      [1024, "compact"],
      [1279, "compact"],
      [1280, "wide"],
      [1900, "wide"],
    ];
    for (const [width, tier] of expected) {
      fakeWindow(width);
      const { result, unmount } = renderHook(() => useViewportTier());
      expect(result.current, `${width}px`).toBe(tier);
      unmount();
    }
  });

  it("is the phone where there is no matchMedia (the server, a bare test)", () => {
    const { result } = renderHook(() => useViewportTier());
    expect(result.current).toBe("phone");
  });

  it("follows a resize across a breakpoint", () => {
    const resize = fakeWindow(1440);
    const { result } = renderHook(() => useViewportTier());
    expect(result.current).toBe("wide");
    act(() => resize(900));
    expect(result.current).toBe("tablet");
    act(() => resize(390));
    expect(result.current).toBe("phone");
  });

  it("says where the rail and the panel are", () => {
    expect([hasRail("phone"), hasRail("tablet"), hasRail("compact"), hasRail("wide")]).toEqual([
      false,
      true,
      true,
      true,
    ]);
    expect([hasPanel("phone"), hasPanel("tablet"), hasPanel("compact"), hasPanel("wide")]).toEqual([
      false,
      false,
      true,
      true,
    ]);
  });
});
