import { beforeEach, describe, expect, it } from "vitest";
import { usePodcastPlayer } from "./podcast-player";

const episode = {
  id: "11111111-1111-4111-8111-111111111111",
  folderId: "22222222-2222-4222-8222-222222222222",
  slug: "s",
  title: "T",
  description: null,
  audioUrl: "https://example.test/a.mp3",
  durationSeconds: 100,
  positionSeconds: 0,
  aiNarrated: false,
};

describe("player 'finished' flag (the cue to offer the quiz)", () => {
  beforeEach(() => usePodcastPlayer.getState().close());

  it("is off until an episode has played to its end", () => {
    usePodcastPlayer.getState().play(episode);
    expect(usePodcastPlayer.getState().finished).toBe(false);
    usePodcastPlayer.getState().markFinished();
    expect(usePodcastPlayer.getState().finished).toBe(true);
  });

  it("clears when the learner plays again, loads another episode, retries, or closes", () => {
    const { markFinished, play, toggle, close, retry } = usePodcastPlayer.getState();
    play(episode);
    markFinished();
    toggle();
    expect(usePodcastPlayer.getState().finished).toBe(false);
    markFinished();
    play({ ...episode, id: "33333333-3333-4333-8333-333333333333" });
    expect(usePodcastPlayer.getState().finished).toBe(false);
    markFinished();
    retry();
    expect(usePodcastPlayer.getState().finished).toBe(false);
    markFinished();
    close();
    expect(usePodcastPlayer.getState().finished).toBe(false);
  });

  it("is not set for a pause or a seek", () => {
    usePodcastPlayer.getState().play(episode);
    usePodcastPlayer.getState().setPlaying(false);
    usePodcastPlayer.getState().seek(50);
    expect(usePodcastPlayer.getState().finished).toBe(false);
  });
});
