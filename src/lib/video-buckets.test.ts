import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  bucketForVideo,
  DRAFT_VIDEO_BUCKET,
  moveVideoForPublishState,
  PUBLIC_VIDEO_BUCKET,
  type VideoStorage,
} from "./video-buckets";

/** An in-memory storage: bucket -> path -> bytes. Records the order of mutations. */
function fakeStorage(
  initial: Record<string, string[]>,
  opts: { failRemoveIn?: string; failUploadOf?: string } = {},
) {
  const buckets: Record<string, Map<string, Blob>> = {
    [PUBLIC_VIDEO_BUCKET]: new Map(),
    [DRAFT_VIDEO_BUCKET]: new Map(),
  };
  for (const [bucket, paths] of Object.entries(initial)) {
    for (const p of paths) buckets[bucket].set(p, new Blob(["x"], { type: "video/mp4" }));
  }
  const log: string[] = [];
  const storage: VideoStorage = {
    from: (bucket) => ({
      download: async (p) => {
        const blob = buckets[bucket].get(p);
        return blob
          ? { data: blob, error: null }
          : { data: null, error: { message: "Object not found" } };
      },
      upload: async (p, body) => {
        log.push(`upload ${bucket}/${p}`);
        if (opts.failUploadOf === p) return { data: null, error: { message: "quota" } };
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

const PATHS = ["en/x.mp4", "en/x.jpg", "en/x.en.vtt"];
const ROOT = path.resolve(import.meta.dirname, "../..");

describe("bucketForVideo", () => {
  it("keeps published videos in the public bucket, whose name every client URL is built from", () => {
    expect(bucketForVideo(true)).toBe("videos");
    expect(bucketForVideo(false)).toBe("video-drafts");
  });

  it("the web, iOS and Android clients all read published videos from `videos`, so playback is unchanged", () => {
    expect(PUBLIC_VIDEO_BUCKET).toBe("videos");
    expect(readFileSync(path.join(ROOT, "src/lib/video.functions.ts"), "utf8")).toContain(
      `const BUCKET = "videos";`,
    );
    expect(
      readFileSync(
        path.join(ROOT, "ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/VideoShelf.swift"),
        "utf8",
      ),
    ).toContain(`static let bucket = "videos"`);
    expect(
      readFileSync(
        path.join(
          ROOT,
          "android/LearnWithAlphonso/core/src/main/kotlin/com/obsidianmedia/learnwithalphonso/core/video/VideoShelf.kt",
        ),
        "utf8",
      ),
    ).toContain(`const val BUCKET = "videos"`);
  });
});

describe("moveVideoForPublishState", () => {
  it("publish: all three objects appear in the public bucket at the SAME paths and leave the private one", async () => {
    const { storage, buckets } = fakeStorage({ [DRAFT_VIDEO_BUCKET]: PATHS });
    await moveVideoForPublishState({ storage, paths: PATHS, publish: true, flip: async () => {} });
    for (const p of PATHS) {
      expect(buckets[PUBLIC_VIDEO_BUCKET].has(p)).toBe(true);
      expect(buckets[DRAFT_VIDEO_BUCKET].has(p)).toBe(false);
    }
  });

  it("publish: every public copy exists BEFORE the row flips (never a published row with a missing file)", async () => {
    const { storage, buckets } = fakeStorage({ [DRAFT_VIDEO_BUCKET]: PATHS });
    let atFlip = 0;
    await moveVideoForPublishState({
      storage,
      paths: PATHS,
      publish: true,
      flip: async () => {
        atFlip = PATHS.filter((p) => buckets[PUBLIC_VIDEO_BUCKET].has(p)).length;
      },
    });
    expect(atFlip).toBe(3);
  });

  it("publish: a failed row flip removes the public copies again and keeps the private ones", async () => {
    const { storage, buckets } = fakeStorage({ [DRAFT_VIDEO_BUCKET]: PATHS });
    await expect(
      moveVideoForPublishState({
        storage,
        paths: PATHS,
        publish: true,
        flip: async () => {
          throw new Error("db down");
        },
      }),
    ).rejects.toThrow("db down");
    expect(buckets[PUBLIC_VIDEO_BUCKET].size).toBe(0);
    expect(buckets[DRAFT_VIDEO_BUCKET].size).toBe(3);
  });

  it("publish: a copy that fails part-way publishes nothing and leaves no public file behind", async () => {
    const { storage, buckets } = fakeStorage(
      { [DRAFT_VIDEO_BUCKET]: PATHS },
      { failUploadOf: "en/x.en.vtt" },
    );
    let flipped = false;
    await expect(
      moveVideoForPublishState({
        storage,
        paths: PATHS,
        publish: true,
        flip: async () => {
          flipped = true;
        },
      }),
    ).rejects.toThrow(/could not copy/);
    expect(flipped).toBe(false);
    expect(buckets[PUBLIC_VIDEO_BUCKET].size).toBe(0);
  });

  it("unpublish: the files are private afterwards and gone from the public bucket", async () => {
    const { storage, buckets } = fakeStorage({ [PUBLIC_VIDEO_BUCKET]: PATHS });
    await moveVideoForPublishState({ storage, paths: PATHS, publish: false, flip: async () => {} });
    expect(buckets[PUBLIC_VIDEO_BUCKET].size).toBe(0);
    for (const p of PATHS) expect(buckets[DRAFT_VIDEO_BUCKET].has(p)).toBe(true);
  });

  it("unpublish: each private copy exists before the public ones are removed", async () => {
    const { storage, log } = fakeStorage({ [PUBLIC_VIDEO_BUCKET]: PATHS });
    await moveVideoForPublishState({ storage, paths: PATHS, publish: false, flip: async () => {} });
    const lastUpload = Math.max(
      ...PATHS.map((p) => log.indexOf(`upload ${DRAFT_VIDEO_BUCKET}/${p}`)),
    );
    const removal = log.findIndex((l) => l.startsWith(`remove ${PUBLIC_VIDEO_BUCKET}/`));
    expect(lastUpload).toBeGreaterThan(-1);
    expect(removal).toBeGreaterThan(lastUpload);
  });

  it("unpublish: reports it when a public copy could not be removed (the file is still reachable)", async () => {
    const { storage } = fakeStorage(
      { [PUBLIC_VIDEO_BUCKET]: PATHS },
      { failRemoveIn: PUBLIC_VIDEO_BUCKET },
    );
    await expect(
      moveVideoForPublishState({ storage, paths: PATHS, publish: false, flip: async () => {} }),
    ).rejects.toThrow(/could not be removed/);
  });

  it("accepts a video already public when publishing (from before drafts were private), and refuses a missing object", async () => {
    const legacy = fakeStorage({ [PUBLIC_VIDEO_BUCKET]: PATHS });
    await moveVideoForPublishState({
      storage: legacy.storage,
      paths: PATHS,
      publish: true,
      flip: async () => {},
    });
    expect(legacy.buckets[PUBLIC_VIDEO_BUCKET].size).toBe(3);

    const partial = fakeStorage({ [DRAFT_VIDEO_BUCKET]: PATHS.slice(0, 2) });
    let flipped = false;
    await expect(
      moveVideoForPublishState({
        storage: partial.storage,
        paths: PATHS,
        publish: true,
        flip: async () => {
          flipped = true;
        },
      }),
    ).rejects.toThrow(/en\/x\.en\.vtt was not found/);
    expect(flipped).toBe(false);
    expect(partial.buckets[PUBLIC_VIDEO_BUCKET].size).toBe(0);
  });
});

describe("the video drafts bucket migration", () => {
  const dir = path.join(ROOT, "supabase/migrations");
  const file = readdirSync(dir).find((f) => f.endsWith("_video_drafts_bucket.sql"))!;
  const sql = readFileSync(path.join(dir, file), "utf8");

  it("creates a PRIVATE bucket with no storage.objects policy", () => {
    expect(sql).toMatch(/'video-drafts', 'video-drafts', false/);
    expect(sql).toMatch(/DO UPDATE SET public = false/);
    expect(sql).not.toMatch(/CREATE POLICY/i);
  });

  it("is versioned after the videos bucket it depends on", () => {
    expect(file.slice(0, 14) > "20261115100000").toBe(true);
  });
});

describe("scripts/video-tool.ts", () => {
  const tool = readFileSync(path.join(ROOT, "scripts/video-tool.ts"), "utf8");

  it("uploads new videos to the drafts bucket, never the public one", () => {
    expect(tool).toMatch(/\.from\(DRAFT_VIDEO_BUCKET\)\s*\.upload\(/);
    expect(tool).not.toMatch(/\.from\(PUBLIC_VIDEO_BUCKET\)\s*\.upload\(/);
  });

  it("publishes and unpublishes through the move, not by flipping the flag alone", () => {
    expect(tool).toContain("moveVideoForPublishState");
  });
});

describe("a failed publish whose rollback also fails (a draft left public)", () => {
  it("is reported loudly: operator cleanup_failed with every path left behind, and the hook is called", async () => {
    const { storage, buckets } = fakeStorage(
      { [DRAFT_VIDEO_BUCKET]: PATHS },
      { failRemoveIn: PUBLIC_VIDEO_BUCKET },
    );
    const reported: { bucket: string; paths: string[]; message: string }[] = [];
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const run = moveVideoForPublishState({
        storage,
        paths: PATHS,
        publish: true,
        flip: async () => {
          throw new Error("db down");
        },
        onCleanupFailed: (f) => {
          reported.push(f);
        },
      });
      await expect(run).rejects.toThrow(/operator: cleanup_failed videos\/en\/x\.mp4/);
      await expect(run).rejects.toThrow(/videos\/en\/x\.en\.vtt/);
      await expect(run).rejects.toThrow(/db down/);
    } finally {
      err.mockRestore();
    }
    expect([...buckets[PUBLIC_VIDEO_BUCKET].keys()].sort()).toEqual([...PATHS].sort());
    expect(reported).toEqual([{ bucket: PUBLIC_VIDEO_BUCKET, paths: PATHS, message: "boom" }]);
  });

  it("a copy that fails part-way and cannot be undone is reported the same way", async () => {
    const { storage } = fakeStorage(
      { [DRAFT_VIDEO_BUCKET]: PATHS },
      { failRemoveIn: PUBLIC_VIDEO_BUCKET, failUploadOf: "en/x.en.vtt" },
    );
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(
        moveVideoForPublishState({ storage, paths: PATHS, publish: true, flip: async () => {} }),
      ).rejects.toThrow(/operator: cleanup_failed videos\/en\/x\.mp4, videos\/en\/x\.jpg/);
    } finally {
      err.mockRestore();
    }
  });

  it("a rollback that works still rethrows the original error alone and reports nothing", async () => {
    const { storage } = fakeStorage({ [DRAFT_VIDEO_BUCKET]: PATHS });
    const onCleanupFailed = vi.fn();
    await expect(
      moveVideoForPublishState({
        storage,
        paths: PATHS,
        publish: true,
        flip: async () => {
          throw new Error("db down");
        },
        onCleanupFailed,
      }),
    ).rejects.toThrow(/^db down$/);
    expect(onCleanupFailed).not.toHaveBeenCalled();
  });
});
