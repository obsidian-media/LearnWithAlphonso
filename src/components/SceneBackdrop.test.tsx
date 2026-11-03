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
    const layer = container.querySelector<HTMLElement>("[data-parallax]")!;
    act(() => {
      Object.defineProperty(window, "scrollY", { value: 200, configurable: true });
      window.dispatchEvent(new Event("scroll"));
    });
    expect(layer.style.transform).toBe("translate3d(0, -50px, 0)");
    act(() => {
      Object.defineProperty(window, "scrollY", { value: 100000, configurable: true });
      window.dispatchEvent(new Event("scroll"));
    });
    expect(layer.style.transform).toBe("translate3d(0, -160px, 0)");
  });

  it("stays still under Reduce Motion", () => {
    mockReducedMotion(true);
    const { container } = render(<SceneBackdrop scene="learn" />);
    const layer = container.querySelector<HTMLElement>("[data-parallax]")!;
    act(() => {
      Object.defineProperty(window, "scrollY", { value: 200, configurable: true });
      window.dispatchEvent(new Event("scroll"));
    });
    expect(layer.style.transform).toBe("");
  });

  it("with a clip, the scene plays it looping and silent, its first frame as the poster", () => {
    mockReducedMotion(false);
    const { container } = render(<SceneBackdrop scene="learn" clip="learn" />);
    const video = container.querySelector('[data-scene="learn"] video')!;
    expect(video.getAttribute("src")).toBe("/clips/learn.mp4");
    expect(video.getAttribute("poster")).toBe("/clips/learn.jpg");
    expect((video as HTMLVideoElement).loop).toBe(true);
    expect((video as HTMLVideoElement).muted).toBe(true);
    expect(container.querySelector('[data-scene="learn"] img[src="/scenes/learn.jpg"]')).toBeNull();
  });

  it("with a clip under Reduce Motion, the clip's first frame stands still instead", () => {
    mockReducedMotion(true);
    const { container } = render(<SceneBackdrop scene="learn" clip="learn" />);
    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector("img")?.getAttribute("src")).toBe("/clips/learn.jpg");
  });

  it("pins an overlay to a spot in the clip's own frame, so it stays on the character", () => {
    mockReducedMotion(false);
    const { container } = render(
      <SceneBackdrop scene="learn" clip="learn" pin={{ x: 64, y: 52, node: <p>Hi there</p> }} />,
    );
    const frame = container.querySelector<HTMLElement>("[data-clip-frame]")!;
    const pinned = frame.querySelector<HTMLElement>("[data-pin]")!;
    expect(pinned.textContent).toBe("Hi there");
    expect(pinned.style.left).toBe("64%");
    expect(pinned.style.top).toBe("52%");
  });
});
