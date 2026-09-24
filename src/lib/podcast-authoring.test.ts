import { describe, expect, it } from "vitest";
import { storagePathFor, validateEpisodeDraft, type EpisodeDraft } from "./podcast-authoring";

const draft = (over: Partial<EpisodeDraft> = {}): EpisodeDraft => ({
  folderSlugPath: ["en", "a1"],
  slug: "ordering-coffee",
  title: "Ordering Coffee",
  description: null,
  source: "tts",
  course: "en",
  levelId: "A1",
  ...over,
});

describe("validateEpisodeDraft", () => {
  it("accepts a well-formed draft", () => {
    expect(validateEpisodeDraft(draft(), [])).toEqual([]);
  });

  it("rejects an invalid slug", () => {
    expect(validateEpisodeDraft(draft({ slug: "Ordering Coffee" }), [])).toContainEqual(
      expect.stringContaining("slug"),
    );
  });

  it("rejects a slug already used in the same folder", () => {
    expect(validateEpisodeDraft(draft(), ["ordering-coffee"])).toContainEqual(
      expect.stringContaining("already"),
    );
  });

  it("rejects an empty title", () => {
    expect(validateEpisodeDraft(draft({ title: "  " }), [])).toContainEqual(
      expect.stringContaining("title"),
    );
  });

  it("rejects a folder path containing an invalid segment", () => {
    expect(validateEpisodeDraft(draft({ folderSlugPath: ["en", "A1 Level"] }), [])).toContainEqual(
      expect.stringContaining("folder"),
    );
  });

  it("rejects a draft with no folder path at all", () => {
    expect(validateEpisodeDraft(draft({ folderSlugPath: [] }), [])).toContainEqual(
      expect.stringContaining("folder"),
    );
  });
});

describe("storagePathFor", () => {
  it("builds a stable object path from the folder path and slug", () => {
    expect(storagePathFor(draft())).toBe("en/a1/ordering-coffee.mp3");
  });

  it("works for a folder path of any depth", () => {
    expect(storagePathFor(draft({ folderSlugPath: ["en", "a1", "cafe", "week-1"] }))).toBe(
      "en/a1/cafe/week-1/ordering-coffee.mp3",
    );
  });
});
