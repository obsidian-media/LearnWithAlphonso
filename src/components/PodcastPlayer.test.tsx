// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PodcastPlayer } from "./PodcastPlayer";
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

beforeEach(() => {
  usePodcastPlayer.setState({ episode: null, isPlaying: false, positionSeconds: 0 });
  // jsdom implements neither play() nor pause() and logs "Not implemented"
  // for both. Stubbing them keeps the output pristine -- and play() is
  // stubbed to return undefined on purpose, which is what old browsers
  // and jsdom both do, so the component's guard against calling .catch()
  // on a non-Promise stays exercised rather than mocked away.
  vi.spyOn(HTMLMediaElement.prototype, "play").mockReturnValue(
    undefined as unknown as Promise<void>,
  );
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PodcastPlayer", () => {
  it("renders nothing until an episode is playing", () => {
    const { container } = render(<PodcastPlayer />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the episode title once one is loaded", () => {
    usePodcastPlayer.getState().play(episode);
    render(<PodcastPlayer />);
    expect(screen.getByText("Ordering Coffee")).toBeInTheDocument();
  });

  it("resumes from the saved position rather than the start", () => {
    usePodcastPlayer.getState().play({ ...episode, positionSeconds: 90 });
    render(<PodcastPlayer />);
    expect(screen.getByTestId("podcast-audio")).toHaveAttribute("data-start-at", "90");
  });

  it("exposes a labelled play/pause control", async () => {
    usePodcastPlayer.getState().play(episode);
    render(<PodcastPlayer />);
    // Exact names, not a regex: "Close player" also matches /play/i.
    await userEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
  });

  // Review Focus #5: the single most common way this class of feature
  // breaks. The audio element belongs to the shell, so re-rendering the
  // surrounding page must not swap it for a new one.
  it("keeps the same audio element across a re-render of the surrounding page", () => {
    usePodcastPlayer.getState().play(episode);
    const { rerender } = render(<PodcastPlayer />);
    const before = screen.getByTestId("podcast-audio");
    rerender(<PodcastPlayer />);
    expect(screen.getByTestId("podcast-audio")).toBe(before);
  });

  it("shows an error with a retry when the audio fails to load", () => {
    usePodcastPlayer.getState().play(episode);
    render(<PodcastPlayer />);
    // fireEvent, not dispatchEvent: the latter is not wrapped in act(),
    // so React never flushes the resulting state update.
    fireEvent.error(screen.getByTestId("podcast-audio"));
    expect(screen.getByText(/couldn't play/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("closing the player clears the episode", async () => {
    usePodcastPlayer.getState().play(episode);
    render(<PodcastPlayer />);
    await userEvent.click(screen.getByRole("button", { name: /close player/i }));
    expect(usePodcastPlayer.getState().episode).toBeNull();
  });
});
