/**
 * The spoken scene openers already fetched in this tab (OpenerSpeechCache on iOS and Android). An opener is our own
 * static text, so reopening a Practice call or a campaign replays the same audio instead of asking /api/tts, and the
 * learner's voice budget, again. Keyed by text, voice and course, so a voice changed in Settings fetches the new one.
 * A failed fetch is not cached; concurrent requests for one line share one fetch.
 */
const CAPACITY = 12;
const entries = new Map<string, Promise<Blob>>();

export function openerSpeechKey(
  text: string,
  voice: string | null | undefined,
  course: string,
): string {
  return [course, voice ?? "", text].join("\u001f");
}

/** `fetchBlob` resolves the audio, or null when it could not be fetched (nothing is cached then). */
export async function cachedOpenerSpeech(
  key: string,
  fetchBlob: () => Promise<Blob | null>,
): Promise<Blob | null> {
  const hit = entries.get(key);
  if (hit) {
    // Most recently used last, so eviction drops the oldest.
    entries.delete(key);
    entries.set(key, hit);
    return hit;
  }
  const pending = fetchBlob().then((blob) => {
    if (!blob) throw new Error("no audio");
    return blob;
  });
  entries.set(key, pending);
  while (entries.size > CAPACITY) entries.delete(entries.keys().next().value as string);
  try {
    return await pending;
  } catch {
    if (entries.get(key) === pending) entries.delete(key);
    return null;
  }
}

/** Tests only. */
export function clearOpenerSpeechCache(): void {
  entries.clear();
}
