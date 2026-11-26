/**
 * Where a Watch-shelf video's files live, by whether the video is published. The same design as podcast audio
 * (src/lib/podcast-audio-buckets.ts, docs/OPEN-ITEMS.md item 29a).
 *
 * Published videos stay in the PUBLIC `videos` bucket at `video_path`, `poster_path` and `captions_path`, so every
 * client URL (web, iOS, Android) is exactly what it has always been. Files of a video that is not published live in a
 * PRIVATE bucket at the same paths, which no URL can reach without the service role. Publishing copies the three
 * objects across before the row flips; unpublishing copies them back and then removes the public copies.
 */

import { removeAfterFailedPublish, type CleanupReporter } from "./storage-cleanup";

export const PUBLIC_VIDEO_BUCKET = "videos";
export const DRAFT_VIDEO_BUCKET = "video-drafts";

/** The bucket that holds a video's files right now. */
export function bucketForVideo(published: boolean): string {
  return published ? PUBLIC_VIDEO_BUCKET : DRAFT_VIDEO_BUCKET;
}

type StorageResult<T> = Promise<{ data: T | null; error: { message: string } | null }>;

/** The slice of a Supabase storage client these helpers use (tests pass a fake). */
export interface VideoStorage {
  from(bucket: string): {
    download(path: string): StorageResult<Blob>;
    upload(
      path: string,
      body: Blob,
      options: { contentType?: string; upsert: boolean },
    ): StorageResult<unknown>;
    remove(paths: string[]): StorageResult<unknown>;
  };
}

const CONTENT_TYPES: Record<string, string> = {
  mp4: "video/mp4",
  jpg: "image/jpeg",
  vtt: "text/vtt",
};
const contentTypeOf = (path: string, blob: Blob) =>
  blob.type || CONTENT_TYPES[path.split(".").pop() ?? ""] || "application/octet-stream";

async function objectBlob(storage: VideoStorage, bucket: string, path: string) {
  const { data, error } = await storage.from(bucket).download(path);
  return error || !data ? null : data;
}

/**
 * Copies one object between buckets. Returns false when the source does not exist. Download then upload: a storage
 * copy cannot cross buckets on every client version.
 */
async function copyObject(
  storage: VideoStorage,
  from: string,
  to: string,
  path: string,
): Promise<boolean> {
  const blob = await objectBlob(storage, from, path);
  if (!blob) return false;
  const { error } = await storage
    .from(to)
    .upload(path, blob, { contentType: contentTypeOf(path, blob), upsert: true });
  if (error) throw new Error(`could not copy ${path} to ${to}: ${error.message}`);
  return true;
}

/**
 * Moves a video's files (video, poster, captions) to the bucket for its new state and flips the row, in the order that
 * never leaves a published row without files and never leaves an unpublished video's files public:
 *
 *   publish:   copy draft -> public, flip the row, remove the draft copies.
 *   unpublish: copy public -> draft, flip the row, remove the public copies.
 *
 * `flip` writes the row and must throw when it fails; if it does, public copies made for a publish are removed again.
 * That removal is checked: when it fails too, a draft is public, so the error thrown is `operator: cleanup_failed
 * <bucket>/<path>` (see storage-cleanup.ts) and `onCleanupFailed` is told, instead of the original error alone.
 * An object already in the target bucket and missing from the source (data written before drafts were private) is
 * accepted. An object missing everywhere is an error: a row must never be flipped over nothing. Paths are derived from
 * the slug (videoStoragePaths), so no two videos share a file.
 */
export async function moveVideoForPublishState(args: {
  storage: VideoStorage;
  paths: string[];
  publish: boolean;
  flip: () => Promise<void>;
  /** Told when the rollback removal failed (the admin function writes an ops_events row). */
  onCleanupFailed?: CleanupReporter;
}): Promise<void> {
  const { storage, publish, flip } = args;
  const paths = [...new Set(args.paths)];
  const source = publish ? DRAFT_VIDEO_BUCKET : PUBLIC_VIDEO_BUCKET;
  const target = publish ? PUBLIC_VIDEO_BUCKET : DRAFT_VIDEO_BUCKET;

  const copied: string[] = [];
  const addedToTarget = async (cause: unknown) => {
    // Undo what we added: public copies of files that did not get published must not stay.
    if (publish && copied.length > 0) {
      await removeAfterFailedPublish({
        storage,
        bucket: target,
        paths: copied,
        cause,
        onCleanupFailed: args.onCleanupFailed,
      });
    }
  };
  try {
    for (const path of paths) {
      if (await copyObject(storage, source, target, path)) copied.push(path);
      else if (!(await objectBlob(storage, target, path))) {
        throw new Error(`the video file ${path} was not found in ${source} or ${target}.`);
      }
    }
    await flip();
  } catch (e) {
    await addedToTarget(e);
    throw e;
  }

  // Row flipped. Remove the old copies. For an unpublish a failure leaves files public, so it is reported.
  const { error } = await storage.from(source).remove(paths);
  if (error && !publish) {
    throw new Error(
      `the video is unpublished, but its public copies could not be removed: ${error.message}. Remove ${paths
        .map((p) => `${PUBLIC_VIDEO_BUCKET}/${p}`)
        .join(", ")}.`,
    );
  }
}
