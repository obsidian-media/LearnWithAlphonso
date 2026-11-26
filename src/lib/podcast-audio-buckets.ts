/**
 * Where an episode's audio lives, by whether the episode is published.
 *
 * Published audio stays in the PUBLIC bucket at `audio_path`, so every client URL (web, iOS, Android, lock-screen
 * and offline downloads) is exactly what it has always been. Audio that is not published lives in a PRIVATE bucket
 * at the same `audio_path`, which no URL can reach without the service role. Publishing copies the object across
 * before the row flips; unpublishing copies it back and then removes the public copy.
 */

export const PUBLIC_AUDIO_BUCKET = "podcast-audio";
export const DRAFT_AUDIO_BUCKET = "podcast-audio-drafts";

/** The bucket that holds an episode's audio right now. */
export function bucketForEpisode(published: boolean): string {
  return published ? PUBLIC_AUDIO_BUCKET : DRAFT_AUDIO_BUCKET;
}

type StorageResult<T> = Promise<{ data: T | null; error: { message: string } | null }>;

/** The slice of a Supabase storage client these helpers use (tests pass a fake). */
export interface AudioStorage {
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

async function objectBlob(storage: AudioStorage, bucket: string, path: string) {
  const { data, error } = await storage.from(bucket).download(path);
  return error || !data ? null : data;
}

/**
 * Copies one object between buckets. Returns false when the source does not exist. Overwrites the destination.
 * Download then upload: a Supabase storage copy cannot cross buckets on every client version.
 */
export async function copyAudio(
  storage: AudioStorage,
  from: string,
  to: string,
  path: string,
): Promise<boolean> {
  const blob = await objectBlob(storage, from, path);
  if (!blob) return false;
  const { error } = await storage
    .from(to)
    .upload(path, blob, { contentType: blob.type || "audio/mpeg", upsert: true });
  if (error) throw new Error(`could not copy ${path} to ${to}: ${error.message}`);
  return true;
}

/**
 * Moves an episode's audio to the bucket for its new state and flips the row, in the order that never leaves a
 * published row without audio and never leaves unpublished audio public:
 *
 *   publish:   copy draft -> public, flip the row, remove the draft copy.
 *   unpublish: copy public -> draft, flip the row, remove the public copy.
 *
 * `flip` writes the row and must throw when it fails; if it does, a public copy made for a publish is removed again.
 * An object already in the target bucket and missing from the source (data written before drafts were private) is
 * accepted. A missing object everywhere is an error: a row must never be flipped over nothing.
 */
export async function moveAudioForPublishState(args: {
  storage: AudioStorage;
  path: string;
  publish: boolean;
  flip: () => Promise<void>;
}): Promise<void> {
  const { storage, path, publish, flip } = args;
  const source = publish ? DRAFT_AUDIO_BUCKET : PUBLIC_AUDIO_BUCKET;
  const target = publish ? PUBLIC_AUDIO_BUCKET : DRAFT_AUDIO_BUCKET;

  const copied = await copyAudio(storage, source, target, path);
  if (!copied && !(await objectBlob(storage, target, path))) {
    throw new Error(`the audio object ${path} was not found in ${source} or ${target}.`);
  }

  try {
    await flip();
  } catch (e) {
    // Undo what we added: a public copy of audio that did not get published must not stay.
    if (copied && publish) await storage.from(target).remove([path]);
    throw e;
  }

  // Row flipped. Remove the old copy. For an unpublish a failure leaves the audio public, so it is reported.
  const { error } = await storage.from(source).remove([path]);
  if (error && !publish) {
    throw new Error(
      `the episode is unpublished, but its public audio copy could not be removed: ${error.message}. Remove ${PUBLIC_AUDIO_BUCKET}/${path}.`,
    );
  }
}

/**
 * For the one-off move of existing data: which objects of the public bucket must go private. Every object that no
 * PUBLISHED episode points at, except the `stories/` narration, which is public by design.
 */
export function objectsToMakePrivate(
  objectNames: string[],
  publishedAudioPaths: string[],
): string[] {
  const published = new Set(publishedAudioPaths);
  return objectNames.filter((name) => !name.startsWith("stories/") && !published.has(name));
}
