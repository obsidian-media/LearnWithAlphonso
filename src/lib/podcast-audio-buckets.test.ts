import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  bucketForEpisode,
  DRAFT_AUDIO_BUCKET,
  moveAudioForPublishState,
  objectsToMakePrivate,
  PUBLIC_AUDIO_BUCKET,
  type AudioStorage,
} from "./podcast-audio-buckets";

/** An in-memory storage: bucket -> path -> bytes. Records the order of mutations. */
function fakeStorage(initial: Record<string, string[]>, opts: { failRemoveIn?: string } = {}) {
  const buckets: Record<string, Map<string, Blob>> = {
    [PUBLIC_AUDIO_BUCKET]: new Map(),
    [DRAFT_AUDIO_BUCKET]: new Map(),
  };
  for (const [bucket, paths] of Object.entries(initial)) {
    for (const p of paths) buckets[bucket].set(p, new Blob(["mp3"], { type: "audio/mpeg" }));
  }
  const log: string[] = [];
  const storage: AudioStorage = {
    from: (bucket) => ({
      download: async (p) => {
        const blob = buckets[bucket].get(p);
        return blob
          ? { data: blob, error: null }
          : { data: null, error: { message: "Object not found" } };
      },
      upload: async (p, body) => {
        log.push(`upload ${bucket}/${p}`);
        buckets[bucket].set(p, body);
        return { data: {}, error: null };
      },
      remove: async (paths) => {
        log.push(`remove ${bucket}/${paths.join(",")}`);
        if (opts.failRemoveIn === bucket) return { data: null, error: { message: "boom" } };
        for (const p of paths) buckets[bucket].delete(p);
        return { data: {}, error: null };
      },
    }),
  };
  return { storage, buckets, log };
}

const PATH = "en/a1/ordering-coffee.mp3";

describe("bucketForEpisode", () => {
  it("keeps published audio in the public bucket, whose name every client URL is built from", () => {
    expect(bucketForEpisode(true)).toBe("podcast-audio");
    expect(bucketForEpisode(false)).toBe("podcast-audio-drafts");
    expect(bucketForEpisode(false)).not.toBe(bucketForEpisode(true));
  });

  it("is the bucket the client URL builder reads, so a published episode's URL is unchanged", () => {
    const source = readFileSync(path.resolve(import.meta.dirname, "podcast.functions.ts"), "utf8");
    expect(source).toContain(`const BUCKET = "podcast-audio";`);
    expect(source).toMatch(/getPublicUrl\(row\.audio_path\)/);
    expect(PUBLIC_AUDIO_BUCKET).toBe("podcast-audio");
  });
});

describe("moveAudioForPublishState", () => {
  it("publish: the object appears in the public bucket at the SAME path and leaves the private one", async () => {
    const { storage, buckets } = fakeStorage({ [DRAFT_AUDIO_BUCKET]: [PATH] });
    await moveAudioForPublishState({ storage, path: PATH, publish: true, flip: async () => {} });
    expect(buckets[PUBLIC_AUDIO_BUCKET].has(PATH)).toBe(true);
    expect(buckets[DRAFT_AUDIO_BUCKET].has(PATH)).toBe(false);
  });

  it("publish: the public copy exists BEFORE the row flips (never a published row with no audio)", async () => {
    const { storage, buckets } = fakeStorage({ [DRAFT_AUDIO_BUCKET]: [PATH] });
    let publicAtFlip = false;
    await moveAudioForPublishState({
      storage,
      path: PATH,
      publish: true,
      flip: async () => {
        publicAtFlip = buckets[PUBLIC_AUDIO_BUCKET].has(PATH);
      },
    });
    expect(publicAtFlip).toBe(true);
  });

  it("publish: a failed row flip removes the public copy again", async () => {
    const { storage, buckets } = fakeStorage({ [DRAFT_AUDIO_BUCKET]: [PATH] });
    await expect(
      moveAudioForPublishState({
        storage,
        path: PATH,
        publish: true,
        flip: async () => {
          throw new Error("db down");
        },
      }),
    ).rejects.toThrow("db down");
    expect(buckets[PUBLIC_AUDIO_BUCKET].has(PATH)).toBe(false);
    expect(buckets[DRAFT_AUDIO_BUCKET].has(PATH)).toBe(true);
  });

  it("unpublish: the audio is private afterwards and gone from the public bucket", async () => {
    const { storage, buckets } = fakeStorage({ [PUBLIC_AUDIO_BUCKET]: [PATH] });
    await moveAudioForPublishState({ storage, path: PATH, publish: false, flip: async () => {} });
    expect(buckets[DRAFT_AUDIO_BUCKET].has(PATH)).toBe(true);
    expect(buckets[PUBLIC_AUDIO_BUCKET].has(PATH)).toBe(false);
  });

  it("unpublish: the private copy exists before the public one is removed", async () => {
    const { storage, log } = fakeStorage({ [PUBLIC_AUDIO_BUCKET]: [PATH] });
    await moveAudioForPublishState({ storage, path: PATH, publish: false, flip: async () => {} });
    const up = log.indexOf(`upload ${DRAFT_AUDIO_BUCKET}/${PATH}`);
    const rm = log.indexOf(`remove ${PUBLIC_AUDIO_BUCKET}/${PATH}`);
    expect(up).toBeGreaterThan(-1);
    expect(rm).toBeGreaterThan(up);
  });

  it("unpublish: reports it when the public copy could not be removed", async () => {
    const { storage } = fakeStorage(
      { [PUBLIC_AUDIO_BUCKET]: [PATH] },
      { failRemoveIn: PUBLIC_AUDIO_BUCKET },
    );
    await expect(
      moveAudioForPublishState({ storage, path: PATH, publish: false, flip: async () => {} }),
    ).rejects.toThrow(/could not be removed/);
  });

  it("accepts legacy audio already public when publishing, and refuses a missing object", async () => {
    const legacy = fakeStorage({ [PUBLIC_AUDIO_BUCKET]: [PATH] });
    await moveAudioForPublishState({
      storage: legacy.storage,
      path: PATH,
      publish: true,
      flip: async () => {},
    });
    expect(legacy.buckets[PUBLIC_AUDIO_BUCKET].has(PATH)).toBe(true);

    const empty = fakeStorage({});
    await expect(
      moveAudioForPublishState({
        storage: empty.storage,
        path: PATH,
        publish: true,
        flip: async () => {},
      }),
    ).rejects.toThrow(/was not found/);
  });
});

describe("objectsToMakePrivate", () => {
  it("lists unpublished and orphan podcast audio, never a published path", () => {
    expect(objectsToMakePrivate(["en/a.mp3", "fr/x/b.mp3", "es/orphan.mp3"], ["en/a.mp3"])).toEqual(
      ["fr/x/b.mp3", "es/orphan.mp3"],
    );
  });

  it("is an allowlist: stories, instagram reels and unknown prefixes are never selected", () => {
    expect(
      objectsToMakePrivate(
        [
          "stories/s1/x.mp3",
          "instagram-reels/r1.mp4",
          "instagram-reels/r1.mp3",
          "misc/y.mp3",
          "de/z.mp3",
          "en/notes.txt",
        ],
        [],
      ),
    ).toEqual([]);
  });
});

describe("moveAudioForPublishState with a shared audio_path", () => {
  it("unpublish keeps the public file while another published episode uses it", async () => {
    const { storage, buckets } = fakeStorage({ [PUBLIC_AUDIO_BUCKET]: [PATH] });
    await moveAudioForPublishState({
      storage,
      path: PATH,
      publish: false,
      sharedWith: { published: true, unpublished: false },
      flip: async () => {},
    });
    expect(buckets[PUBLIC_AUDIO_BUCKET].has(PATH)).toBe(true);
  });

  it("publish keeps the private copy while another unpublished episode uses it", async () => {
    const { storage, buckets } = fakeStorage({ [DRAFT_AUDIO_BUCKET]: [PATH] });
    await moveAudioForPublishState({
      storage,
      path: PATH,
      publish: true,
      sharedWith: { published: false, unpublished: true },
      flip: async () => {},
    });
    expect(buckets[DRAFT_AUDIO_BUCKET].has(PATH)).toBe(true);
    expect(buckets[PUBLIC_AUDIO_BUCKET].has(PATH)).toBe(true);
  });

  it("a failed publish does not remove a public file another published episode already used", async () => {
    const { storage, buckets } = fakeStorage({ [DRAFT_AUDIO_BUCKET]: [PATH] });
    await expect(
      moveAudioForPublishState({
        storage,
        path: PATH,
        publish: true,
        sharedWith: { published: true, unpublished: false },
        flip: async () => {
          throw new Error("db down");
        },
      }),
    ).rejects.toThrow("db down");
    expect(buckets[PUBLIC_AUDIO_BUCKET].has(PATH)).toBe(true);
  });
});

describe("wiring of the writers", () => {
  const read = (rel: string) => readFileSync(path.resolve(import.meta.dirname, rel), "utf8");

  it("podcast-tool uploads new audio to the private bucket and publishes through the mover", () => {
    const tool = read("../../scripts/podcast-tool.ts");
    expect(tool).toContain("const BUCKET = DRAFT_AUDIO_BUCKET;");
    expect(tool).toContain("moveAudioForPublishState");
  });

  it("the admin console never uploads new or staged audio to the public bucket", () => {
    const admin = read("admin.functions.ts");
    expect(admin).toContain("moveAudioForPublishState");
    expect(admin).toMatch(/createSignedUploadUrl\(stagingPathFor\(audioPath\)/);
    expect(admin).not.toMatch(/\.from\(BUCKET\)\s*\.createSignedUploadUrl/);
    expect(admin).not.toMatch(/\.from\(BUCKET\)\s*\.upload/);
  });

  it("the drafts bucket migration is private, has no storage policy and sorts after main's newest", () => {
    const sql = readFileSync(
      path.resolve(
        import.meta.dirname,
        "../../supabase/migrations/20261128120000_podcast_audio_drafts_bucket.sql",
      ),
      "utf8",
    );
    expect(sql).toMatch(/'podcast-audio-drafts', 'podcast-audio-drafts', false/);
    expect(sql).not.toMatch(/CREATE POLICY/i);
  });
});
