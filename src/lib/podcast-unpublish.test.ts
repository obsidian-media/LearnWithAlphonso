import { describe, expect, it } from "vitest";
import type { PodcastFolder } from "./podcast-tree";
import {
  coursesLeftEmpty,
  coursesLow,
  MIN_PUBLISHED_PER_COURSE,
  removableAudioPaths,
  episodePath,
  parseUnpublishList,
  planUnpublishTargets,
  planUnpublishUnlicensed,
  publishedCountsAfter,
  type UnpublishEpisode,
} from "./podcast-unpublish";

const folders: PodcastFolder[] = [
  { id: "en", parentId: null, slug: "en", title: "English", description: null, sortOrder: 0 },
  { id: "c1", parentId: "en", slug: "c1", title: "C1", description: null, sortOrder: 0 },
  { id: "fr", parentId: null, slug: "fr", title: "French", description: null, sortOrder: 1 },
  { id: "fr-a1", parentId: "fr", slug: "a1", title: "A1", description: null, sortOrder: 0 },
];

const episode = (overrides: Partial<UnpublishEpisode>): UnpublishEpisode => ({
  id: "e1",
  folderId: "c1",
  slug: "why-we-procrastinate",
  title: "Why",
  published: true,
  audioPath: "en/c1/why-we-procrastinate.mp3",
  course: "en",
  voiceProvider: "unknown",
  ...overrides,
});

const episodes: UnpublishEpisode[] = [
  episode({}),
  episode({
    id: "e2",
    slug: "why-we-procrastinate-v2",
    audioPath: "en/c1/why-we-procrastinate-v2.mp3",
    voiceProvider: "deepgram",
  }),
  episode({
    id: "e3",
    slug: "old-draft",
    published: false,
    voiceProvider: "edge-tts",
    audioPath: "en/c1/old-draft.mp3",
  }),
  episode({
    id: "e4",
    folderId: "fr-a1",
    slug: "au-cafe",
    course: "fr",
    voiceProvider: "deepgram",
    audioPath: "fr/a1/au-cafe.mp3",
  }),
];

describe("parseUnpublishList", () => {
  it("reads folder/slug lines, skipping blanks and comments, with CRLF", () => {
    const { targets, problems } = parseUnpublishList(
      "# old audio\r\nen/c1/why-we-procrastinate\r\n\r\n",
    );
    expect(problems).toEqual([]);
    expect(targets).toEqual([{ segments: ["en", "c1"], slug: "why-we-procrastinate", line: 2 }]);
  });

  it("names every bad line instead of guessing", () => {
    const { targets, problems } = parseUnpublishList(
      "why-we-procrastinate\nen/C1/Bad Slug\nen/c1/x\nen/c1/x\n",
    );
    expect(targets).toHaveLength(1);
    expect(problems).toEqual([
      'line 1: "why-we-procrastinate" needs a folder path and a slug, e.g. en/c1/why-we-procrastinate.',
      'line 2: "en/C1/Bad Slug" is not a lowercase kebab-case path.',
      'line 4: "en/c1/x" is listed twice.',
    ]);
  });
});

describe("planUnpublishTargets", () => {
  it("resolves nested paths and splits published from already-unpublished", () => {
    const { targets } = parseUnpublishList("en/c1/why-we-procrastinate\nen/c1/old-draft\n");
    const plan = planUnpublishTargets(targets, folders, episodes);
    expect(plan.problems).toEqual([]);
    expect(plan.toUnpublish.map((e) => e.id)).toEqual(["e1"]);
    expect(plan.alreadyUnpublished.map((e) => e.id)).toEqual(["e3"]);
  });

  it("reports a missing folder or episode and plans nothing for it", () => {
    const { targets } = parseUnpublishList("en/b9/x\nen/c1/missing\n");
    const plan = planUnpublishTargets(targets, folders, episodes);
    expect(plan.toUnpublish).toEqual([]);
    expect(plan.problems).toEqual([
      'line 1: folder "en/b9" does not exist.',
      'line 2: no episode "missing" in en/c1.',
    ]);
  });
});

describe("planUnpublishUnlicensed", () => {
  it("selects every published episode whose provider is not licensed, and keeps Deepgram", () => {
    const plan = planUnpublishUnlicensed(episodes);
    expect(plan.toUnpublish.map((e) => e.id)).toEqual(["e1"]);
    expect(plan.alreadyUnpublished.map((e) => e.id)).toEqual(["e3"]);
    expect(plan.problems).toEqual([]);
  });

  it("selects ElevenLabs and Edge TTS episodes, not only unknown ones", () => {
    const mixed = [
      episode({ id: "a", voiceProvider: "elevenlabs" }),
      episode({ id: "b", voiceProvider: "edge-tts" }),
      episode({ id: "c", voiceProvider: "human" }),
    ];
    expect(planUnpublishUnlicensed(mixed).toUnpublish.map((e) => e.id)).toEqual(["a", "b"]);
  });
});

describe("course counts", () => {
  it("counts what stays published per course", () => {
    expect(publishedCountsAfter(episodes, new Set(["e1"]))).toEqual({ en: 1, fr: 1, es: 0 });
  });

  it("reports the courses an unpublish would leave empty", () => {
    expect(coursesLeftEmpty({ en: 1, fr: 0, es: 0 })).toEqual(["fr", "es"]);
  });
});

describe("episodePath", () => {
  it("prints the slug path the list file uses", () => {
    expect(episodePath(folders, episodes[3]!)).toBe("fr/a1/au-cafe");
  });
});

describe("courses that would be left thin", () => {
  it("warns below three published per course, but not for an empty one (that has its own warning)", () => {
    expect(MIN_PUBLISHED_PER_COURSE).toBe(3);
    expect(coursesLow({ en: 2, fr: 0, es: 1 })).toEqual([
      { course: "en", count: 2 },
      { course: "es", count: 1 },
    ]);
  });

  it("stays silent for the planned 10 / 3 / 3 run, and for exactly three", () => {
    expect(coursesLow({ en: 10, fr: 3, es: 3 })).toEqual([]);
    expect(coursesLow({ en: 3, fr: 4, es: 100 })).toEqual([]);
  });
});

describe("removableAudioPaths (--remove-audio)", () => {
  const plan = {
    toUnpublish: [episode({ id: "a", audioPath: "en/c1/a.mp3" })],
    alreadyUnpublished: [
      episode({ id: "b", audioPath: "en/c1/b.mp3", published: false }),
      episode({ id: "c", audioPath: "en/c1/shared.mp3", published: false }),
    ],
    problems: [],
  };

  it("deletes the audio of every listed episode", () => {
    const result = removableAudioPaths(plan, [...plan.toUnpublish, ...plan.alreadyUnpublished]);
    expect(result.paths.sort()).toEqual(["en/c1/a.mp3", "en/c1/b.mp3", "en/c1/shared.mp3"]);
    expect(result.keptBecauseShared).toEqual([]);
  });

  it("keeps an audio_path that an episode staying published still points at", () => {
    const stayer = episode({ id: "d", slug: "d", audioPath: "en/c1/shared.mp3", published: true });
    const result = removableAudioPaths(plan, [
      ...plan.toUnpublish,
      ...plan.alreadyUnpublished,
      stayer,
    ]);
    expect(result.paths).not.toContain("en/c1/shared.mp3");
    expect(result.paths.sort()).toEqual(["en/c1/a.mp3", "en/c1/b.mp3"]);
    expect(result.keptBecauseShared).toEqual(["en/c1/shared.mp3"]);
  });

  it("does not let an episode that is itself being unpublished keep a path alive", () => {
    const twin = episode({ id: "t", slug: "t", audioPath: "en/c1/a.mp3", published: true });
    const both = { ...plan, toUnpublish: [...plan.toUnpublish, twin] };
    const result = removableAudioPaths(both, [...both.toUnpublish, ...both.alreadyUnpublished]);
    expect(result.paths).toContain("en/c1/a.mp3");
  });

  it("lists each path once", () => {
    const twin = episode({ id: "t", slug: "t", audioPath: "en/c1/a.mp3", published: false });
    const dup = { ...plan, alreadyUnpublished: [...plan.alreadyUnpublished, twin] };
    const result = removableAudioPaths(dup, [...dup.toUnpublish, ...dup.alreadyUnpublished]);
    expect(result.paths.filter((path) => path === "en/c1/a.mp3")).toHaveLength(1);
  });
});
