// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PodcastAudio } from "./PodcastAudio";
import { usePodcastPlayer } from "../lib/podcast-player";

vi.mock("../lib/podcast.functions", () => ({
  savePlaybackPosition: vi.fn(async () => ({ positionSeconds: 0 })),
  recordPlayEvent: vi.fn(async () => undefined),
}));

const episode = {
  id: "11111111-1111-1111-1111-111111111111",
  folderId: "22222222-2222-2222-2222-222222222222",
  slug: "ordering-coffee",
  title: "Ordering Coffee",
  description: null,
  audioUrl: "https://example.test/en/a1/ordering-coffee.mp3",
  durationSeconds: 300,
  positionSeconds: 0,
};

/** Stands in for two different pages rendered at the router's Outlet. */
function PageA() {
  return <p>page a</p>;
}
function PageB() {
  return <p>page b</p>;
}

beforeEach(() => {
  usePodcastPlayer.setState({
    episode: null,
    isPlaying: false,
    elapsedSeconds: 0,
    failed: false,
    retryToken: 0,
  });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockReturnValue(
    undefined as unknown as Promise<void>,
  );
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PodcastAudio", () => {
  // The finding this file exists for: the player used to live inside
  // MobileFrame, which every page renders for itself, so walking from a
  // folder into a subfolder swapped the route component and unmounted the
  // audio element mid-episode. Mounting it beside the Outlet -- above the
  // page, not inside it -- is what makes playback survive.
  it("keeps the same audio element when the page beside it is replaced", () => {
    usePodcastPlayer.getState().play(episode);
    const { rerender } = render(
      <>
        <PodcastAudio />
        <PageA />
      </>,
    );
    const before = screen.getByTestId("podcast-audio");

    rerender(
      <>
        <PodcastAudio />
        <PageB />
      </>,
    );

    expect(screen.getByText("page b")).toBeInTheDocument();
    expect(screen.getByTestId("podcast-audio")).toBe(before);
  });

  it("publishes elapsed time to the store so a resume knows where playback got to", () => {
    usePodcastPlayer.getState().play(episode);
    render(<PodcastAudio />);
    const audio = screen.getByTestId("podcast-audio") as HTMLAudioElement;
    Object.defineProperty(audio, "currentTime", { value: 42, writable: true });

    fireEvent.timeUpdate(audio);

    expect(usePodcastPlayer.getState().elapsedSeconds).toBe(42);
  });

  it("clears isPlaying when the episode ends, so the bar stops claiming it is playing", () => {
    usePodcastPlayer.getState().play(episode);
    render(<PodcastAudio />);

    fireEvent.ended(screen.getByTestId("podcast-audio"));

    expect(usePodcastPlayer.getState().isPlaying).toBe(false);
  });

  it("follows the media element when playback is paused outside the app", () => {
    // An incoming call, another tab taking audio focus, or headphones
    // being unplugged all pause the element without going through our
    // button. The bar must not keep claiming "Pause".
    usePodcastPlayer.getState().play(episode);
    render(<PodcastAudio />);

    fireEvent.pause(screen.getByTestId("podcast-audio"));

    expect(usePodcastPlayer.getState().isPlaying).toBe(false);
  });

  it("actually restarts playback on retry, not just clearing the error", () => {
    usePodcastPlayer.getState().play(episode);
    render(<PodcastAudio />);
    const audio = screen.getByTestId("podcast-audio");
    fireEvent.error(audio);
    expect(usePodcastPlayer.getState().failed).toBe(true);

    const playSpy = vi.spyOn(HTMLMediaElement.prototype, "play");
    playSpy.mockClear();
    // act() so React flushes the effect the retry token re-triggers.
    act(() => usePodcastPlayer.getState().retry());

    expect(usePodcastPlayer.getState().failed).toBe(false);
    expect(playSpy).toHaveBeenCalled();
  });

  it("does not seek past the end when the stored duration is longer than the real audio", () => {
    // duration_seconds is written by the CLI at publish time. If the
    // object is later replaced by hand, or a concatenated TTS episode
    // reported a wrong length, the row and the media disagree -- and the
    // media is the truth we can actually seek within.
    usePodcastPlayer.getState().play({ ...episode, positionSeconds: 280 });
    render(<PodcastAudio />);
    const audio = screen.getByTestId("podcast-audio") as HTMLAudioElement;
    Object.defineProperty(audio, "duration", { value: 40, writable: true });
    Object.defineProperty(audio, "currentTime", { value: 0, writable: true });

    fireEvent.loadedMetadata(audio);

    expect(audio.currentTime).toBe(0);
  });
});
