/**
 * The storage half of the speech cache (tts-cache.ts says which lines, and the key). One object per line in the
 * PRIVATE `tts-cache` bucket (20261118200000_ai_cost_log.sql: no storage.objects policy, so no client role can list,
 * read or write it). The only reader and writer is /api/tts, with the service role, after it has authenticated the
 * learner, so the audio is served through the same auth path as everything else, never by a public URL.
 *
 * Both calls are best effort and never throw: a miss, a failed read or a failed write just means the vendor is asked,
 * exactly as before the cache existed.
 */
export const TTS_CACHE_BUCKET = "tts-cache";
/** The most audio kept for one line: a scene opener is a few seconds; anything larger is not one of ours. */
export const TTS_CACHE_MAX_BYTES = 1_500_000;

type StorageClient = {
  storage: {
    from: (bucket: string) => {
      download: (
        path: string,
      ) => PromiseLike<{ data: Blob | null; error: { message: string } | null }>;
      upload: (
        path: string,
        body: Uint8Array,
        opts: { contentType: string; upsert: boolean },
      ) => PromiseLike<{ error: { message: string } | null }>;
    };
  };
};

const objectPath = (key: string) => `${key}.mp3`;

async function adminClient(): Promise<StorageClient> {
  return (await import("@/integrations/supabase/client.server"))
    .supabaseAdmin as unknown as StorageClient;
}

/** The stored audio for a key, or null on a miss or any failure. */
export async function readCachedSpeech(
  key: string,
  client?: StorageClient,
): Promise<Uint8Array | null> {
  try {
    const db = client ?? (await adminClient());
    const { data, error } = await db.storage.from(TTS_CACHE_BUCKET).download(objectPath(key));
    if (error || !data) return null;
    const bytes = new Uint8Array(await data.arrayBuffer());
    return bytes.length > 0 && bytes.length <= TTS_CACHE_MAX_BYTES ? bytes : null;
  } catch {
    return null;
  }
}

/** Keeps the audio under the key. Never throws; an object that already exists is left as it is (upsert false). */
export async function writeCachedSpeech(
  key: string,
  audio: Uint8Array,
  client?: StorageClient,
): Promise<void> {
  if (audio.length === 0 || audio.length > TTS_CACHE_MAX_BYTES) return;
  try {
    const db = client ?? (await adminClient());
    const { error } = await db.storage
      .from(TTS_CACHE_BUCKET)
      .upload(objectPath(key), audio, { contentType: "audio/mpeg", upsert: false });
    // "already exists" is two requests for the same line racing: the first one won, which is the point.
    if (error && !/already exists|duplicate/i.test(error.message)) {
      console.error("[tts-cache] write failed:", error.message);
    }
  } catch (e) {
    console.error("[tts-cache] write failed:", e instanceof Error ? e.message : "error");
  }
}
