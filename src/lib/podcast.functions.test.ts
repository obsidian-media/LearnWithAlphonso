import { describe, expect, it } from "vitest";
import { clampPosition, toPodcastEpisode } from "./podcast.functions";

// Review Focus #4: a re-uploaded, shorter episode leaves saved positions
// past its end. Seeking there strands the player instead of restarting.
describe("clampPosition", () => {
  it("keeps a position inside the episode", () => {
    expect(clampPosition(42, 300)).toBe(42);
  });

  it("restarts from zero when the saved position is past the end", () => {
    expect(clampPosition(400, 300)).toBe(0);
  });

  it("restarts from zero when the position sits in the final second", () => {
    // Resuming at 299.6/300 would replay a fraction of a second and
    // instantly hit the end -- indistinguishable from a broken player.
    expect(clampPosition(299.6, 300)).toBe(0);
  });

  it("treats a negative position as the start", () => {
    expect(clampPosition(-5, 300)).toBe(0);
  });

  it("treats a non-finite position as the start", () => {
    expect(clampPosition(Number.NaN, 300)).toBe(0);
    expect(clampPosition(Number.POSITIVE_INFINITY, 300)).toBe(0);
  });
});

describe("toPodcastEpisode", () => {
  const row = {
    id: "e1",
    folder_id: "f1",
    slug: "s",
    title: "T",
    description: null,
    duration_seconds: 120,
    source: "tts",
  };

  it("maps a row and labels a text-to-speech episode AI-narrated", () => {
    expect(toPodcastEpisode(row, "https://x/a.mp3", 30)).toEqual({
      id: "e1",
      folderId: "f1",
      slug: "s",
      title: "T",
      description: null,
      audioUrl: "https://x/a.mp3",
      durationSeconds: 120,
      positionSeconds: 30,
      aiNarrated: true,
      course: null,
    });
  });

  it("carries the episode's own course and ignores an unknown code", () => {
    expect(toPodcastEpisode({ ...row, course: "fr" }, "u", 0).course).toBe("fr");
    expect(toPodcastEpisode({ ...row, course: "de" }, "u", 0).course).toBeNull();
  });

  it("does not label an uploaded recording", () => {
    expect(toPodcastEpisode({ ...row, source: "upload" }, "u", 0).aiNarrated).toBe(false);
  });
});
