// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { SceneBackdrop } from "./SceneBackdrop";

function mockReducedMotion(reduce: boolean) {
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: reduce && q.includes("prefers-reduced-motion"),
    media: q,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("SceneBackdrop", () => {
  it("puts the scene behind the page as a decorative image, under a readability scrim", () => {
    mockReducedMotion(false);
    const { container } = render(<SceneBackdrop scene="learn" />);
    const root = container.querySelector('[data-scene="learn"]')!;
    expect(root.getAttribute("aria-hidden")).toBe("true");
    expect(root.className).toContain("pointer-events-none");
    const img = root.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("/scenes/learn.jpg");
    expect(img.getAttribute("alt")).toBe("");
    expect(root.querySelector(".scene-scrim")).not.toBeNull();
  });

  it("drifts at a fraction of the scroll, and only a bounded distance", () => {
    mockReducedMotion(false);
    const { container } = render(<SceneBackdrop scene="learn" />);
    const img = container.querySelector("img")!;
    act(() => {
      Object.defineProperty(window, "scrollY", { value: 200, configurable: true });
      window.dispatchEvent(new Event("scroll"));
    });
    expect(img.style.transform).toBe("translate3d(0, -50px, 0)");
    act(() => {
      Object.defineProperty(window, "scrollY", { value: 100000, configurable: true });
      window.dispatchEvent(new Event("scroll"));
    });
    expect(img.style.transform).toBe("translate3d(0, -160px, 0)");
  });

  it("stays still under Reduce Motion", () => {
    mockReducedMotion(true);
    const { container } = render(<SceneBackdrop scene="learn" />);
    const img = container.querySelector("img")!;
    act(() => {
      Object.defineProperty(window, "scrollY", { value: 200, configurable: true });
      window.dispatchEvent(new Event("scroll"));
    });
    expect(img.style.transform).toBe("");
  });
});
