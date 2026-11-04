// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { PodcastPlayer } from "./PodcastPlayer";
import { usePodcastPlayer } from "../lib/podcast-player";

const episode = {
  id: "11111111-1111-1111-1111-111111111111",
  folderId: "22222222-2222-2222-2222-222222222222",
  slug: "ordering-coffee",
  title: "Ordering Coffee",
  description: null,
  audioUrl: "https://example.test/en/a1/ordering-coffee.mp3",
  durationSeconds: 300,
  positionSeconds: 0,
  aiNarrated: true,
};

beforeEach(() => {
  usePodcastPlayer.setState({
    episode: null,
    isPlaying: false,
    elapsedSeconds: 0,
    failed: false,
    retryToken: 0,
  });
});

describe("PodcastPlayer (mini-bar)", () => {
  it("renders nothing until an episode is playing", () => {
    const { container } = render(<PodcastPlayer />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the episode title once one is loaded", () => {
    usePodcastPlayer.getState().play(episode);
    render(<PodcastPlayer />);
    expect(screen.getByText("Ordering Coffee")).toBeInTheDocument();
  });

  it("labels an AI-narrated episode, and not a recorded one", () => {
    usePodcastPlayer.getState().play(episode);
    const { unmount } = render(<PodcastPlayer />);
    expect(screen.getByText("AI-narrated")).toBeInTheDocument();
    unmount();
    usePodcastPlayer.getState().play({ ...episode, id: "e2", aiNarrated: false });
    render(<PodcastPlayer />);
    expect(screen.queryByText("AI-narrated")).not.toBeInTheDocument();
  });

  it("shows elapsed time against the episode length", () => {
    usePodcastPlayer.getState().play(episode);
    usePodcastPlayer.getState().setElapsed(65);
    render(<PodcastPlayer />);
    expect(screen.getByText("1:05")).toBeInTheDocument();
    expect(screen.getByText("-3:55")).toBeInTheDocument();
  });

  it("exposes a labelled play/pause control", async () => {
    usePodcastPlayer.getState().play(episode);
    render(<PodcastPlayer />);
    // Exact names, not a regex: "Close player" also matches /play/i.
    await userEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
  });

  it("shows an error with a retry when playback has failed", () => {
    usePodcastPlayer.getState().play(episode);
    usePodcastPlayer.getState().setFailed(true);
    render(<PodcastPlayer />);
    expect(screen.getByText(/couldn't play/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("retrying clears the error and asks for playback again", async () => {
    usePodcastPlayer.getState().play(episode);
    usePodcastPlayer.getState().setFailed(true);
    render(<PodcastPlayer />);
    const before = usePodcastPlayer.getState().retryToken;

    await userEvent.click(screen.getByRole("button", { name: /try again/i }));

    expect(usePodcastPlayer.getState().failed).toBe(false);
    // The token is what makes the audio element re-run play(); clearing
    // the flag alone would hide the error while nothing played.
    expect(usePodcastPlayer.getState().retryToken).toBe(before + 1);
  });

  it("closing the player clears the episode", async () => {
    usePodcastPlayer.getState().play(episode);
    render(<PodcastPlayer />);
    await userEvent.click(screen.getByRole("button", { name: /close player/i }));
    expect(usePodcastPlayer.getState().episode).toBeNull();
  });
});

describe("PodcastPlayer scrubber", () => {
  const load = (elapsed = 65) => {
    usePodcastPlayer.getState().play(episode);
    usePodcastPlayer.getState().setElapsed(elapsed);
    render(<PodcastPlayer />);
    return screen.getByRole("slider", { name: "Seek" });
  };

  it("is a labelled slider spanning the episode, at the current position", () => {
    const slider = load();
    expect(slider).toHaveAttribute("min", "0");
    expect(slider).toHaveAttribute("max", "300");
    expect(slider).toHaveValue("65");
    expect(slider).toHaveAttribute("aria-valuetext", "1:05 of 5:00");
  });

  it("shows elapsed on the left and time remaining on the right", () => {
    load(65);
    expect(screen.getByText("1:05")).toBeInTheDocument();
    expect(screen.getByText("-3:55")).toBeInTheDocument();
  });

  it("dragging asks the audio element to seek, and the readout follows at once", () => {
    const slider = load(0);
    fireEvent.change(slider, { target: { value: "120" } });
    expect(usePodcastPlayer.getState().seekRequest?.seconds).toBe(120);
    expect(usePodcastPlayer.getState().elapsedSeconds).toBe(120);
    expect(screen.getByText("2:00")).toBeInTheDocument();
    expect(screen.getByText("-3:00")).toBeInTheDocument();
  });

  it("arrow keys step 5 seconds, Page keys 30, clamped to the episode", async () => {
    const user = userEvent.setup();
    const slider = load(10);
    slider.focus();
    await user.keyboard("{ArrowRight}");
    expect(usePodcastPlayer.getState().elapsedSeconds).toBe(15);
    await user.keyboard("{ArrowLeft}{ArrowLeft}{ArrowLeft}");
    expect(usePodcastPlayer.getState().elapsedSeconds).toBe(0);
    await user.keyboard("{PageUp}");
    expect(usePodcastPlayer.getState().elapsedSeconds).toBe(30);
    await user.keyboard("{End}");
    expect(usePodcastPlayer.getState().elapsedSeconds).toBe(300);
    await user.keyboard("{ArrowRight}");
    expect(usePodcastPlayer.getState().elapsedSeconds).toBe(300);
    await user.keyboard("{Home}");
    expect(usePodcastPlayer.getState().elapsedSeconds).toBe(0);
  });

  it("has a visible focus ring and no motion for people who asked for none", () => {
    const slider = load();
    expect(slider.className).toContain("focus-visible:ring-2");
    expect(slider.className).toContain("motion-reduce:transition-none");
  });

  it("is hidden while playback has failed, where there is nothing to seek", () => {
    usePodcastPlayer.getState().play(episode);
    usePodcastPlayer.getState().setFailed(true);
    render(<PodcastPlayer />);
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  });
});
