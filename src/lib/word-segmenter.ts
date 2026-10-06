import type { SavedWordCourse, SavedWordInput } from "./saved-word";

/**
 * Splits displayed text into words and the text between them, for the web's
 * tap-to-save (docs/superpowers/specs/2026-10-05-save-any-word-design.md). The
 * iOS twin is WordSegmenter.swift; the token rule is deliberately the SAME
 * regex `validateSavedWordInput` uses on the server, so a word this finds is a
 * word the server accepts: letters, with an apostrophe (straight or
 * typographic) or hyphen only BETWEEN letters.
 *
 * Offsets are UTF-16 code units into the NFC-normalised text, which is what the
 * server measures its limits in and what it stores.
 */
export type TextSegment = { text: string; isWord: boolean; start: number };

const TOKEN = /\p{L}(?:\p{L}|['’-](?=\p{L}))*/gu;
const WORD_MAX = 40;
const SENTENCE_MAX = 300;
const TERMINATORS = new Set([".", "!", "?", "\n", "…"]);

export function segmentText(raw: string): TextSegment[] {
  // NFC first: \p{L} does not match a combining accent, so a decomposed
  // "e" + U+0301 would otherwise end the word early.
  const text = raw.normalize("NFC");
  const segments: TextSegment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(TOKEN)) {
    const start = match.index ?? 0;
    if (start > cursor) {
      segments.push({ text: text.slice(cursor, start), isWord: false, start: cursor });
    }
    segments.push({ text: match[0], isWord: true, start });
    cursor = start + match[0].length;
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), isWord: false, start: cursor });
  }
  return segments;
}

/** The server accepts 1 to 40 UTF-16 units; anything longer is not worth a link. */
export function isSavableWord(word: string): boolean {
  const units = word.normalize("NFC").length;
  return units >= 1 && units <= WORD_MAX;
}

// Words after which a full stop does not end the sentence. Lower-case, no dot.
const ABBREVIATIONS = new Set([
  "mr",
  "mrs",
  "ms",
  "dr",
  "prof",
  "sr",
  "jr",
  "st",
  "vs",
  "etc",
  "eg",
  "ie",
  "no",
  "approx",
]);

/** The letters immediately before index `dot`, lower-cased ("Mr" before "Mr."). */
function wordBefore(text: string, dot: number): string {
  let i = dot;
  while (i > 0 && /\p{L}/u.test(text[i - 1])) i -= 1;
  return text.slice(i, dot);
}

function endsSentence(text: string, i: number): boolean {
  const ch = text[i];
  if (ch !== ".") return TERMINATORS.has(ch);
  // A full stop only ends a sentence when whitespace (or the end) follows it:
  // "3.14", "e.g" and "U.S.A" are not boundaries.
  const next = text[i + 1];
  if (next !== undefined && !/\s/.test(next)) return false;
  const before = wordBefore(text, i);
  if (ABBREVIATIONS.has(before.toLowerCase())) return false;
  // The tail of a dotted abbreviation: "e.g.", "i.e.", "U.S.".
  if (before.length === 1 && text[i - 2] === ".") return false;
  // A single capital initial ("J. Smith"), but not "I", which ends sentences.
  if (before.length === 1 && before !== "I" && before !== "A" && before === before.toUpperCase()) {
    return false;
  }
  return true;
}

function splitSentences(text: string): { text: string; start: number }[] {
  const sentences: { text: string; start: number }[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (endsSentence(text, i)) {
      sentences.push({ text: text.slice(start, i + 1), start });
      start = i + 1;
    }
  }
  if (start < text.length) sentences.push({ text: text.slice(start), start });
  return sentences;
}

/**
 * Trims the sentence to at most SENTENCE_MAX UTF-16 units, keeping the tapped
 * word (at `wordStart`, `wordLength` units long, both relative to `sentence`)
 * and as much of its surroundings as fits. Works in code points so a surrogate
 * pair is never cut in half, and anchors on the tapped occurrence rather than
 * the first one, so the same word later in a long sentence still yields a
 * window that contains it.
 */
function fit(sentence: string, wordStart: number, wordLength: number): string {
  const trimmed = sentence.trim();
  if (trimmed.length <= SENTENCE_MAX) return trimmed;

  const chars = Array.from(sentence);
  const unitStart: number[] = [];
  let units = 0;
  for (const ch of chars) {
    unitStart.push(units);
    units += ch.length;
  }
  unitStart.push(units);

  let lo = unitStart.indexOf(wordStart);
  let hi = unitStart.indexOf(wordStart + wordLength);
  if (lo < 0 || hi < 0) return trimmed.slice(0, SENTENCE_MAX);
  let used = unitStart[hi] - unitStart[lo];

  let grew = true;
  while (grew) {
    grew = false;
    if (lo > 0 && used + chars[lo - 1].length <= SENTENCE_MAX) {
      lo -= 1;
      used += chars[lo].length;
      grew = true;
    }
    if (hi < chars.length && used + chars[hi].length <= SENTENCE_MAX) {
      used += chars[hi].length;
      hi += 1;
      grew = true;
    }
  }
  return chars.slice(lo, hi).join("").trim();
}

/**
 * The request for saving `segment` out of `text`: the word, the sentence it was
 * TAPPED in (chosen by position, so the same word in two sentences is two
 * different saves), and the course. `text` is the same string that was given to
 * `segmentText`, which produced `segment`.
 */
export function saveRequestFor(
  text: string,
  segment: TextSegment,
  course: SavedWordCourse,
): SavedWordInput {
  const normalised = text.normalize("NFC");
  const sentences = splitSentences(normalised);
  const containing = sentences.find(
    (s) => segment.start >= s.start && segment.start < s.start + s.text.length,
  ) ?? { text: normalised, start: 0 };
  const sentence = fit(containing.text, segment.start - containing.start, segment.text.length);
  return { word: segment.text, sentence, course };
}
