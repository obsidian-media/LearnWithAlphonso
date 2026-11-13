// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LibraryVideo } from "../lib/video-library";

const tracked: { name: string; props: unknown }[] = [];
vi.mock("../lib/analytics", () => ({
  track: async (name: string, props: unknown) => {
    tracked.push({ name, props });
  },
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    search,
    children,
    onClick,
    className,
  }: {
    to: string;
    params?: Record<string, string>;
    search?: Record<string, unknown>;
    children: React.ReactNode;
    onClick?: () => void;
    className?: string;
  }) => (
    <a
      href={to}
      data-params={JSON.stringify(params ?? {})}
      data-search={JSON.stringify(search ?? {})}
      onClick={onClick}
      className={className}
    >
      {children}
    </a>
  ),
}));

const { VideoPlayerSheet } = await import("./VideoPlayerSheet");

const play = vi.fn(() => Promise.resolve());
const pause = vi.fn();

beforeEach(() => {
  tracked.length = 0;
  play.mockClear();
  pause.mockClear();
  HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
    Object.defineProperty(this, "paused", { value: false, configurable: true });
    this.dispatchEvent(new Event("play"));
    return play();
  };
  HTMLMediaElement.prototype.pause = function (this: HTMLMediaElement) {
    Object.defineProperty(this, "paused", { value: true, configurable: true });
    this.dispatchEvent(new Event("pause"));
    pause();
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const video = (over: Partial<LibraryVideo> = {}): LibraryVideo => ({
  id: "v1",
  slug: "en-a",
  course: "en",
  title: "I'd like vs I want",
  description: null,
  level: "A1",
  durationSeconds: 49,
  videoUrl: "https://x.test/a.mp4",
  posterUrl: "https://x.test/a.jpg",
  captionsUrl: "https://x.test/a.en.vtt",
  tags: [],
  practice: { kind: "lesson", id: "u3l2" },
  sortOrder: 0,
  progressSeconds: 0,
  completedAt: null,
  ...over,
});

function setup(v: LibraryVideo = video()) {
  const onClose = vi.fn();
  const onSaveProgress = vi.fn();
  render(<VideoPlayerSheet video={v} onClose={onClose} onSaveProgress={onSaveProgress} />);
  const el = screen.getByTestId("video-element") as HTMLVideoElement;
  return { el, onClose, onSaveProgress };
}
const setTime = (el: HTMLVideoElement, t: number) => {
  Object.defineProperty(el, "currentTime", { value: t, configurable: true, writable: true });
  fireEvent.timeUpdate(el);
};

describe("captions", () => {
  it("are ON when the sheet opens: a default captions track from the video's own WebVTT, and the CC button pressed", () => {
    const { el } = setup();
    const track = el.querySelector("track")!;
    expect(track.getAttribute("kind")).toBe("captions");
    expect(track.getAttribute("src")).toBe("https://x.test/a.en.vtt");
    expect(track.hasAttribute("default")).toBe(true);
    expect(track.getAttribute("srclang")).toBe("en");
    expect(screen.getByRole("button", { name: "Captions" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("can be switched off and on again", async () => {
    setup();
    const cc = screen.getByRole("button", { name: "Captions" });
    await userEvent.click(cc);
    expect(cc).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(cc);
    expect(cc).toHaveAttribute("aria-pressed", "true");
  });
});

describe("controls", () => {
  it("is a modal dialog named by the title, with a close button", () => {
    setup();
    expect(screen.getByRole("dialog", { name: "I'd like vs I want" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close video" })).toBeInTheDocument();
  });

  it("plays and pauses from the play button", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(play).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(pause).toHaveBeenCalled();
  });

  it("cycles the speed and applies it to the video", async () => {
    const { el } = setup();
    const speed = screen.getByRole("button", { name: /Playback speed 1x/ });
    await userEvent.click(speed);
    expect(el.playbackRate).toBe(1.25);
    expect(screen.getByRole("button", { name: /Playback speed 1.25x/ })).toBeInTheDocument();
  });

  it("scrubs: the seek slider moves the video and is labelled with the time", () => {
    const { el } = setup();
    const seek = screen.getByRole("slider", { name: "Seek" });
    fireEvent.change(seek, { target: { value: "30" } });
    expect(el.currentTime).toBe(30);
    expect(seek).toHaveAttribute("aria-valuetext", "0:30 of 0:49");
  });

  it("closes on Escape and saves where it stopped", () => {
    const { el, onClose, onSaveProgress } = setup();
    setTime(el, 12);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onSaveProgress).toHaveBeenCalledWith(12);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("saves at most every few seconds while playing, not on every frame", async () => {
    const { el, onSaveProgress } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Play" }));
    onSaveProgress.mockClear();
    setTime(el, 2);
    setTime(el, 4);
    expect(onSaveProgress).not.toHaveBeenCalled();
    setTime(el, 6);
    expect(onSaveProgress).toHaveBeenCalledTimes(1);
    expect(onSaveProgress).toHaveBeenCalledWith(6);
  });
});

describe("start, resume and reduced motion", () => {
  it("starts by itself when metadata loads, from the saved position", () => {
    const { el } = setup(video({ progressSeconds: 20 }));
    Object.defineProperty(el, "duration", { value: 49, configurable: true });
    fireEvent.loadedMetadata(el);
    expect(el.currentTime).toBe(20);
    expect(play).toHaveBeenCalled();
  });

  it("does NOT start by itself under Reduced Motion", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: q.includes("reduce"),
      addEventListener() {},
      removeEventListener() {},
    }));
    const { el } = setup();
    fireEvent.loadedMetadata(el);
    expect(play).not.toHaveBeenCalled();
  });
});

describe("the end of the video", () => {
  it("offers one tap to the matching practice item, completes the video and tracks it", () => {
    const { el, onSaveProgress, onClose } = setup();
    Object.defineProperty(el, "duration", { value: 49, configurable: true });
    fireEvent.play(el);
    fireEvent.ended(el);
    expect(onSaveProgress).toHaveBeenCalledWith(49);
    const link = screen.getByRole("link", { name: "Practice this in a lesson" });
    expect(link).toHaveAttribute("href", "/lesson/$id");
    expect(link.getAttribute("data-params")).toBe(JSON.stringify({ id: "u3l2" }));
    fireEvent.click(link);
    expect(onClose).toHaveBeenCalled();
    expect(tracked.map((t) => t.name)).toEqual(["video_started", "video_completed"]);
    expect(tracked[0].props).toEqual({ video_id: "v1", course: "en" });
  });

  it("opens a talk or a campaign practice target at its own route", () => {
    const talk = setup(video({ practice: { kind: "talk", id: "coffee" } }));
    fireEvent.ended(talk.el);
    expect(screen.getByRole("link", { name: "Practice this with Alphonso" })).toHaveAttribute(
      "href",
      "/converse/$scenarioId",
    );
    cleanup();
    const camp = setup(video({ practice: { kind: "campaign", id: "city-day" } }));
    fireEvent.ended(camp.el);
    const link = screen.getByRole("link", { name: "Practice this in a story" });
    expect(link.getAttribute("data-search")).toBe(JSON.stringify({ scene: 0 }));
  });

  it("shows no practice link when the video names none, and still offers to watch again", () => {
    const { el } = setup(video({ practice: null }));
    fireEvent.ended(el);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByRole("button", { name: "Watch again" })).toBeInTheDocument();
  });

  it("does not save a position on close after the video ended (the end already completed it)", () => {
    const { el, onClose, onSaveProgress } = setup();
    fireEvent.ended(el);
    onSaveProgress.mockClear();
    act(() => screen.getByRole("button", { name: "Close video" }).click());
    expect(onSaveProgress).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});

describe("errors", () => {
  it("says it could not play and offers Try again, the pattern the podcast player uses", async () => {
    const { el } = setup();
    fireEvent.error(el);
    expect(screen.getByText("We couldn't play this video.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.queryByText("We couldn't play this video.")).toBeNull();
  });
});
