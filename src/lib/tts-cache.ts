import { SCENARIOS, CONTENT_COURSES } from "@/data/scenarios";
import { CAMPAIGNS } from "@/data/campaigns";
import { namelessHectorGreetings } from "./hector-greeting";

/**
 * Which spoken lines /api/tts may keep, and the key they are kept under. Pure: the storage side is
 * tts-cache.server.ts.
 *
 * The audit behind it (docs/operations.md, "AI cost"): /api/tts is called for three kinds of text.
 *   1. A scene OPENER (the first thing Alphonso says in a Practice call or a campaign scene): our own fixed sentence,
 *      the same for every learner in a course. The apps keep one in memory for the open screen only, so every learner,
 *      every device and every relaunch asked the vendor again.
 *   2. Hector's GREETING: a fixed template. Without a learner name in it, it is one of a finite list of our own
 *      sentences; with a name it is that learner's.
 *   3. A model REPLY: written for one learner, about what they just said. Never ours to keep.
 *
 * So the rule is an exact match against the fixed lines we ship, never a guess about the text: a line is cached only
 * when it IS one of them, character for character. Anything else (a reply, a greeting with a name, any text a client
 * invents) goes to the vendor and is never stored, so learner text is never written to the store.
 */

/** Bumped when the audio format or the vendor settings in the request change, so old entries are never served. */
export const TTS_CACHE_VERSION = "v1";
/** The vendor settings in the request (/api/tts): the encoding is part of the key. */
export const TTS_CACHE_ENCODING = "mp3";

/** Spoken text is compared whitespace-collapsed, so a client's stray space or newline does not defeat a hit. */
export function normalizeSpokenLine(text: string): string {
  return text.normalize("NFC").replace(/\s+/g, " ").trim();
}

let fixed: ReadonlySet<string> | null = null;

/** Every fixed line we may cache, normalised. Built once per server instance. */
export function fixedSpokenLines(): ReadonlySet<string> {
  if (fixed) return fixed;
  const lines = new Set<string>();
  for (const scenario of SCENARIOS) {
    for (const course of CONTENT_COURSES) lines.add(normalizeSpokenLine(scenario.opener[course]));
  }
  for (const campaign of CAMPAIGNS) {
    for (const scene of campaign.scenes) {
      for (const course of CONTENT_COURSES) lines.add(normalizeSpokenLine(scene.opener[course]));
    }
  }
  for (const greeting of namelessHectorGreetings()) lines.add(normalizeSpokenLine(greeting));
  lines.delete("");
  fixed = lines;
  return lines;
}

/** True only for one of our own fixed lines. */
export function isCacheableSpokenLine(text: string): boolean {
  return fixedSpokenLines().has(normalizeSpokenLine(text));
}

/**
 * The store key: a SHA-256 of the voice, the format settings and the normalised text, so the same line in the same
 * voice always maps to the same object and a different voice, version or wording never does. Hex, so it is a safe
 * object name; it reveals nothing about the line.
 */
export async function ttsCacheKey(model: string, text: string): Promise<string> {
  const material = [
    "tts-cache",
    TTS_CACHE_VERSION,
    TTS_CACHE_ENCODING,
    model,
    normalizeSpokenLine(text),
  ].join("\u001f");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
