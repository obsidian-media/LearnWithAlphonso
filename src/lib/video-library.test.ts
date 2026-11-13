import { describe, expect, it } from "vitest";
import {
  CAPTIONS_DEFAULT_ON,
  PLAYBACK_SPEEDS,
  nextSpeed,
  practiceLink,
  resumeSeconds,
  toLibraryVideo,
  videoFraction,
  videoState,
  watchShelf,
  type LibraryVideo,
  type VideoRow,
} from "./video-library";

const video = (over: Partial<LibraryVideo> = {}): LibraryVideo => ({
  id: "v1",
  slug: "en-a",
  course: "en",
  title: "A",
  description: null,
  level: "A1",
  durationSeconds: 50,
  videoUrl: "https://x.test/a.mp4",
  posterUrl: null,
  captionsUrl: "https://x.test/a.vtt",
  tags: [],
  practice: null,
  sortOrder: 0,
  progressSeconds: 0,
  completedAt: null,
  ...over,
});

describe("state, fraction and resume", () => {
  it("is new, in progress or done", () => {
    expect(videoState(video())).toBe("new");
    expect(videoState(video({ progressSeconds: 12 }))).toBe("inProgress");
    expect(videoState(video({ progressSeconds: 12, completedAt: "2026-11-14T00:00:00Z" }))).toBe(
      "done",
    );
  });
  it("a finished video is a full bar whatever its last position says", () => {
    expect(videoFraction(video({ progressSeconds: 5, completedAt: "x" }))).toBe(1);
    expect(videoFraction(video({ progressSeconds: 25 }))).toBe(0.5);
    expect(videoFraction(video({ progressSeconds: 500 }))).toBe(1);
    expect(videoFraction(video({ durationSeconds: 0, progressSeconds: 5 }))).toBe(0);
  });
  it("resumes from the saved position, but restarts a finished video or one saved at its very end", () => {
    expect(resumeSeconds(video({ progressSeconds: 20 }))).toBe(20);
    expect(resumeSeconds(video({ progressSeconds: 48 }))).toBe(0);
    expect(resumeSeconds(video({ progressSeconds: 20, completedAt: "x" }))).toBe(0);
    expect(resumeSeconds(video())).toBe(0);
  });
});

describe("the shelf", () => {
  it("lists only the course's videos, in shelf order, and is empty (hidden) when there are none", () => {
    const list = [
      video({ id: "b", title: "B", sortOrder: 2 }),
      video({ id: "a", title: "A", sortOrder: 1 }),
      video({ id: "f", course: "fr", title: "F" }),
    ];
    expect(watchShelf(list, "en").map((v) => v.id)).toEqual(["a", "b"]);
    expect(watchShelf(list, "es")).toEqual([]);
  });
});

describe("player rules", () => {
  it("captions are on by default", () => {
    expect(CAPTIONS_DEFAULT_ON).toBe(true);
  });
  it("cycles the speeds and restarts from normal speed on an unknown one", () => {
    expect(PLAYBACK_SPEEDS).toContain(1);
    expect(nextSpeed(1)).toBe(1.25);
    expect(nextSpeed(1.5)).toBe(0.75);
    expect(nextSpeed(3)).toBe(1);
  });
  it("links the practice target: lesson, talk, campaign (scene 0), or nothing", () => {
    expect(practiceLink({ kind: "lesson", id: "u3l2" })).toEqual({
      to: "/lesson/$id",
      params: { id: "u3l2" },
    });
    expect(practiceLink({ kind: "talk", id: "coffee" })).toEqual({
      to: "/converse/$scenarioId",
      params: { scenarioId: "coffee" },
    });
    expect(practiceLink({ kind: "campaign", id: "city-day" })).toEqual({
      to: "/campaign/$campaignId",
      params: { campaignId: "city-day" },
      search: { scene: 0 },
    });
    expect(practiceLink(null)).toBeNull();
  });
});

describe("toLibraryVideo", () => {
  const row: VideoRow = {
    id: "v1",
    slug: "en-a",
    course: "en",
    title: "A",
    description: "d",
    level_id: "A1",
    duration_seconds: 49,
    video_path: "en/en-a.mp4",
    poster_path: "en/en-a.jpg",
    captions_path: "en/en-a.en.vtt",
    tags: ["food"],
    practice_kind: "lesson",
    practice_id: "u3l2",
    sort_order: 3,
  };
  const url = (p: string) => `https://cdn.test/videos/${p}`;
  it("builds public URLs, the practice pair and the learner's progress", () => {
    expect(
      toLibraryVideo(row, { video_id: "v1", progress_seconds: 20, completed_at: null }, url),
    ).toMatchObject({
      videoUrl: "https://cdn.test/videos/en/en-a.mp4",
      posterUrl: "https://cdn.test/videos/en/en-a.jpg",
      captionsUrl: "https://cdn.test/videos/en/en-a.en.vtt",
      practice: { kind: "lesson", id: "u3l2" },
      progressSeconds: 20,
      level: "A1",
      durationSeconds: 49,
    });
  });
  it("drops a row it cannot caption or place in a course, and a half-set practice target", () => {
    expect(toLibraryVideo({ ...row, captions_path: null }, undefined, url)).toBeNull();
    expect(toLibraryVideo({ ...row, course: "de" }, undefined, url)).toBeNull();
    expect(toLibraryVideo({ ...row, practice_kind: "quiz" }, undefined, url)?.practice).toBeNull();
    expect(toLibraryVideo({ ...row, practice_id: null }, undefined, url)?.practice).toBeNull();
  });
});
