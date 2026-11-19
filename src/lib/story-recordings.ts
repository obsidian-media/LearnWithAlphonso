/**
 * Pre-recorded story narration: the pure rules the web reader (and the generator script) share. The iOS Kit
 * (StoryRecordings.swift) and Android core (StoryRecordings.kt) mirror the parsing and lookup.
 *
 * A story's narration is one MP3 per sentence, recorded once with the course's Alphonso voice and kept in the public
 * `podcast-audio` bucket under `stories/<storyId>/`. A manifest next to the files (`manifest.json`) lists each recorded
 * sentence by its text. A reader looks its sentence up BY TEXT, so:
 *   - an edited sentence simply has no entry until the generator runs again (the reader falls back to live speech),
 *     never the old audio under new text;
 *   - the same sentence in a branching story's several nodes is recorded once;
 *   - no client has to hash anything.
 * The files are named from a hash of voice + text (story-audio-plan.ts), so they never change once written and can be
 * cached for good.
 */

/** The public bucket the files live in (no migration: podcast-audio is already public, service-role write only). */
export const STORY_AUDIO_BUCKET = "podcast-audio";
export const STORY_MANIFEST_VERSION = 1;

export type StoryManifestEntry = { text: string; file: string };
export type StoryManifest = { v: number; voice: string; entries: StoryManifestEntry[] };

/** Spoken text is compared NFC, whitespace-collapsed and trimmed, so a stray space or newline does not defeat a hit. */
export function normalizeStoryLine(text: string): string {
  return text.normalize("NFC").replace(/\s+/g, " ").trim();
}

export const storyAudioPrefix = (storyId: string) => `stories/${storyId}`;
export const storyManifestPath = (storyId: string) => `${storyAudioPrefix(storyId)}/manifest.json`;

/** The public URL of an object in the bucket, from the project URL (no trailing slash needed). */
export function storyAudioPublicUrl(supabaseUrl: string, path: string): string {
  const base = supabaseUrl.replace(/\/+$/, "");
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${base}/storage/v1/object/public/${STORY_AUDIO_BUCKET}/${encoded}`;
}

/** text (normalised) -> object path. Null for anything that is not a v1 manifest, so a bad file means "no recordings". */
export function parseStoryManifest(value: unknown): Map<string, string> | null {
  if (!value || typeof value !== "object") return null;
  const m = value as Partial<StoryManifest>;
  if (m.v !== STORY_MANIFEST_VERSION || !Array.isArray(m.entries)) return null;
  const out = new Map<string, string>();
  for (const e of m.entries) {
    if (
      e &&
      typeof e.text === "string" &&
      typeof e.file === "string" &&
      e.file.startsWith("stories/") &&
      !e.file.includes("..")
    ) {
      out.set(normalizeStoryLine(e.text), e.file);
    }
  }
  return out;
}

/** The recording for a sentence, or null (the caller then falls back to live speech). */
export function recordingPathFor(
  recordings: Map<string, string> | null,
  text: string,
): string | null {
  return recordings?.get(normalizeStoryLine(text)) ?? null;
}

/** True when every sentence has a recording: then narration needs no AI call, no quota and no AI consent. */
export function allRecorded(recordings: Map<string, string> | null, segments: string[]): boolean {
  return segments.length > 0 && segments.every((s) => recordingPathFor(recordings, s) !== null);
}

/** Loads a story's manifest from the public bucket. Any failure (no file yet, offline, bad JSON) is null, never a throw. */
export async function fetchStoryRecordings(
  supabaseUrl: string | undefined,
  storyId: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<Map<string, string> | null> {
  if (!supabaseUrl || !storyId) return null;
  try {
    const resp = await fetchImpl(storyAudioPublicUrl(supabaseUrl, storyManifestPath(storyId)));
    if (!resp.ok) return null;
    return parseStoryManifest(await resp.json());
  } catch {
    return null;
  }
}
