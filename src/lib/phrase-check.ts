/**
 * Phrase mode ("Say it" in the phrasebook): how clearly a whole phrase came across. Pure functions only, mirrored one for
 * one by LearnWithAlphonsoKit/Pronunciation.swift and core/logic/Pronunciation.kt; the shared cases in
 * tests/fixtures/phrase-check-cases.json pin all three apps to the same answers. It never produces a pronunciation
 * score: only "understood clearly", "mostly understood" (with up to two words to listen to again) or "not yet".
 *
 * THE RULES (the natives port exactly these):
 *  1. Comparing form of a text: Unicode NFD, drop U+0300-U+036F (accents), lower case, curly and modifier apostrophes
 *     become ', "oe" and "ae" ligatures are spelled out, every character outside a-z, 0-9 and ' becomes a space, then
 *     every ' becomes a space too. Split on spaces. A token is dropped when it is one character long or one of
 *     qu, jusqu, lorsqu, puisqu, quoiqu (elision pieces: l' d' j' m' t' s' n' c' qu' and English 's 't 'm 'd).
 *  2. The expected phrase is split on whitespace into WORDS (the unit shown to the learner, in original spelling with
 *     outer punctuation trimmed). A word with no token left after rule 1 is ignored. No words left: "not_yet".
 *  3. The heard text is tokenised the same way. No tokens: "not_yet".
 *  4. Confidence: each entry of `words` (the recogniser's own per-word list) is tokenised the same way; the tokens take
 *     that entry's confidence, queued per token in order. The k-th occurrence of a heard token takes the k-th queued
 *     confidence; none queued means "unknown", which is taken as clear (nothing says it was unclear).
 *  5. Each expected token claims the first still-unclaimed heard token that matches it: equal, or equal once an elision
 *     prefix (l d j m t s n c qu jusqu lorsqu puisqu quoiqu) is removed from the heard token ("jaime" for "aime"), or
 *     equal once a contraction ending (t s m d ll re ve) is removed from the heard token ("dont" for "don").
 *  6. An expected word is FLAGGED when any of its tokens was not heard, or was heard with confidence below
 *     WORD_CONFIDENCE (0.7).
 *  7. Nothing flagged: "clear". One or two flagged (MAX_LISTEN_AGAIN) AND no more than half of the words: "mostly", with
 *     the flagged words, in phrase order, as `listenAgain`. Anything else: "not_yet" with an empty `listenAgain`.
 */

/** One word of the transcript with the recogniser's own confidence for it (0-1), as `/api/stt` forwards it. */
export type HeardWord = { word: string; confidence: number };

/** How clearly a phrase came across: all of it, most of it, or not yet. */
export type PhraseResult = "clear" | "mostly" | "not_yet";

export type PhraseCheck = {
  result: PhraseResult;
  /** At most MAX_LISTEN_AGAIN words, copied from the EXPECTED phrase in its own spelling; only for "mostly". */
  listenAgain: string[];
};

/** A heard word below this confidence (0-1) counts as not clearly understood. Tunable: the one place it lives. */
export const WORD_CONFIDENCE = 0.7;
/** "Mostly" names at most this many words, and never more than half of the phrase. */
export const MAX_LISTEN_AGAIN = 2;

const DROPPED_FRAGMENTS = new Set(["qu", "jusqu", "lorsqu", "puisqu", "quoiqu"]);
/** Elision prefixes a recogniser may glue onto the next word ("jaime" for j'aime). */
const GLUED_PREFIXES = new Set(["l", "d", "j", "m", "t", "s", "n", "c", ...DROPPED_FRAGMENTS]);
/** English contraction endings a recogniser may glue on ("dont" for don't). */
const GLUED_SUFFIXES = new Set(["t", "s", "m", "d", "ll", "re", "ve"]);

/** Rule 1: the comparing tokens of a text. */
export function phraseTokens(s: string): string[] {
  const t = s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’‘ʼ`´]/g, "'")
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/[^a-z0-9']/g, " ")
    .replace(/'/g, " ");
  return t.split(" ").filter((w) => w.length >= 2 && !DROPPED_FRAGMENTS.has(w));
}

function sameWord(expected: string, heard: string): boolean {
  if (expected === heard) return true;
  if (heard.length <= expected.length) return false;
  if (
    heard.endsWith(expected) &&
    GLUED_PREFIXES.has(heard.slice(0, heard.length - expected.length))
  )
    return true;
  return heard.startsWith(expected) && GLUED_SUFFIXES.has(heard.slice(expected.length));
}

/** Rule 2: the words of the expected phrase, each with the original spelling to show and its comparing tokens. */
function expectedWords(expected: string): { shown: string; tokens: string[] }[] {
  const out: { shown: string; tokens: string[] }[] = [];
  for (const chunk of expected.split(/\s+/)) {
    const tokens = phraseTokens(chunk);
    if (tokens.length === 0) continue;
    out.push({ shown: chunk.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""), tokens });
  }
  return out;
}

/** How clearly `heard` conveyed `expected`, given the recogniser's per-word confidences (see the rules above). */
export function checkPhrase(
  expected: string,
  heard: string,
  words: readonly HeardWord[] | null | undefined,
): PhraseCheck {
  const want = expectedWords(expected);
  const said = phraseTokens(heard);
  if (want.length === 0 || said.length === 0) return { result: "not_yet", listenAgain: [] };

  const queued = new Map<string, number[]>();
  for (const w of words ?? []) {
    if (!w || typeof w.word !== "string" || typeof w.confidence !== "number") continue;
    for (const token of phraseTokens(w.word)) {
      const list = queued.get(token) ?? [];
      list.push(w.confidence);
      queued.set(token, list);
    }
  }
  const unclaimed = said.map((token) => ({
    token,
    confidence: queued.get(token)?.shift() ?? null,
  }));

  const flagged: string[] = [];
  for (const { shown, tokens } of want) {
    let bad = false;
    for (const token of tokens) {
      const at = unclaimed.findIndex((h) => sameWord(token, h.token));
      if (at < 0) {
        bad = true;
        continue;
      }
      const [hit] = unclaimed.splice(at, 1);
      if (hit.confidence !== null && hit.confidence < WORD_CONFIDENCE) bad = true;
    }
    if (bad) flagged.push(shown);
  }

  if (flagged.length === 0) return { result: "clear", listenAgain: [] };
  if (flagged.length <= MAX_LISTEN_AGAIN && flagged.length * 2 <= want.length) {
    return { result: "mostly", listenAgain: flagged };
  }
  return { result: "not_yet", listenAgain: [] };
}
