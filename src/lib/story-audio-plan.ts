/**
 * What scripts/story-audio.ts has to do for one story, as pure functions: which sentences the story speaks, which
 * already have a recording, which need one, and the manifest to publish. No I/O, so it is unit-tested; the script is
 * the thin Deepgram + storage wrapper around it.
 */
import type { StoryGraph } from "./branching";
import {
  normalizeStoryLine,
  parseStoryManifest,
  STORY_MANIFEST_VERSION,
  storyAudioPrefix,
  type StoryManifest,
} from "./story-recordings";

export type StoryForAudio = {
  id: string;
  course: string;
  segments: unknown;
  nodes: unknown;
};

/** Every distinct sentence a story speaks, in reading order: its segments, or every node's segments when branching. */
export function storySentences(story: Pick<StoryForAudio, "segments" | "nodes">): string[] {
  const raw: unknown[] = [];
  const nodes = story.nodes as StoryGraph | null;
  if (nodes && typeof nodes === "object" && nodes.map && typeof nodes.map === "object") {
    for (const node of Object.values(nodes.map)) {
      if (Array.isArray(node?.segments)) raw.push(...node.segments);
    }
  } else if (Array.isArray(story.segments)) {
    raw.push(...story.segments);
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of raw) {
    if (typeof s !== "string") continue;
    const line = normalizeStoryLine(s);
    if (line && !seen.has(line)) {
      seen.add(line);
      out.push(line);
    }
  }
  return out;
}

/** The object name for a sentence: a hash of voice + text, so a new voice or new wording is a new file. */
export async function recordingFile(storyId: string, voice: string, text: string): Promise<string> {
  const data = new TextEncoder().encode(`${voice}\n${normalizeStoryLine(text)}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${storyAudioPrefix(storyId)}/${hex.slice(0, 32)}.mp3`;
}

export type StoryAudioPlan = {
  /** Sentences that still need synthesising, with the object path each will be stored at. */
  toGenerate: { text: string; file: string }[];
  /** How many sentences were already recorded (skipped, so a re-run costs nothing). */
  reused: number;
  /** The manifest to publish: exactly this story's current sentences, so edited-away sentences drop out. */
  manifest: StoryManifest;
  /** Characters Deepgram will bill for `toGenerate`. */
  chars: number;
};

/**
 * `existing` is the manifest already published for the story (or null). An entry is reused only when its text AND its
 * file name (which encodes the voice) match what would be generated now.
 */
export async function planStoryAudio(
  story: StoryForAudio,
  voice: string,
  existing: unknown,
): Promise<StoryAudioPlan> {
  const have = parseStoryManifest(existing);
  const toGenerate: StoryAudioPlan["toGenerate"] = [];
  const entries: StoryManifest["entries"] = [];
  let reused = 0;
  for (const text of storySentences(story)) {
    const file = await recordingFile(story.id, voice, text);
    entries.push({ text, file });
    if (have?.get(text) === file) reused += 1;
    else toGenerate.push({ text, file });
  }
  return {
    toGenerate,
    reused,
    manifest: { v: STORY_MANIFEST_VERSION, voice, entries },
    chars: toGenerate.reduce((n, g) => n + g.text.length, 0),
  };
}
