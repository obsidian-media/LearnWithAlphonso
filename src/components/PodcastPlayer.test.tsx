// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
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

  it("shows elapsed time against the episode length", () => {
    usePodcastPlayer.getState().play(episode);
    usePodcastPlayer.getState().setElapsed(65);
    render(<PodcastPlayer />);
    expect(screen.getByText("1:05 / 5:00")).toBeInTheDocument();
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
