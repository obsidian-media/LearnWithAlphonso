import type { Level } from "./levels";

/**
 * The English word-card rules (moved here from vocab-meanings.test.ts so the full content review's
 * fix checker, src/lib/content-review/fixes.ts, applies the gate's own rules to a card fix before
 * it is written). The gate and the checker import the same function.
 */
const MAX_MEANING_WORDS = 8;
/** French and Spanish sentences run longer than English ones, so B1 may use 12 words there too. */
const maxExampleWords = (level: Level, lang: "en" | "fr" | "es" = "en") =>
  level === "B2" || level === "C1" || (level === "B1" && lang !== "en") ? 12 : 10;

/** A leading article is not part of the word a French or Spanish card teaches: "le logiciel" is found in "ce logiciel". */
export const withoutArticle = (term: string) =>
  term.replace(/^(?:les|le|la|un|une|el|los|las|una)\s+|^l['’]/i, "");

export const words = (s: string) => s.trim().split(/\s+/).filter(Boolean);
const tokens = (s: string) => s.toLowerCase().match(/[\p{L}]+(?:'[\p{L}]+)?/gu) ?? [];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const norm = (s: string) => s.toLowerCase().replace(/[’]/g, "'");
/** Endings a short word may take and still count as the same word ("run" / "runs" / "running"). */
const SHORT_ENDINGS = "(?:s|es|d|ed|ing|'s|'d|'ll|n't)?";
/** A whole-word match for a short word, so "on" is not found in "London" or "at" in "cat". */
const shortWord = (w: string) =>
  new RegExp(`(?<![\\p{L}'])${esc(w)}${SHORT_ENDINGS}(?![\\p{L}])`, "u");
const isShort = (w: string) => w.length <= 3;
const stemOf = (w: string) => w.slice(0, Math.max(3, w.length - 2));
/** Does this sentence word belong to the term word (whole word if short, shared stem otherwise)? */
const sameWord = (sentenceWord: string, termWord: string) =>
  isShort(termWord)
    ? shortWord(termWord).test(sentenceWord)
    : sentenceWord.startsWith(stemOf(termWord));

/** Is the term, or an inflected form of it, in the sentence? */
export function mentionsTerm(sentence: string, term: string): boolean {
  const lower = norm(sentence);
  const t = norm(term).trim();
  const phrase = new RegExp(`(?<![\\p{L}'])${esc(t)}(?![\\p{L}])`, "u");
  if (phrase.test(lower)) return true;
  // An elided form counts as its word too: "j'écoute" holds "écoute" (French and Spanish clitics).
  const sentenceTokens = tokens(lower).flatMap((w) =>
    w.includes("'") ? [w, ...w.split("'")] : [w],
  );
  return tokens(t).every((tt) => sentenceTokens.some((s) => sameWord(s, tt)));
}

/**
 * The part of a meaning that DEFINES the word: quoted phrases and "used in ..." / "as in ..."
 * tails only show where the word is used, so the circularity check ignores them.
 */
function definingPart(meaning: string): string {
  return meaning.replace(/["“][^"”]*["”]/g, " ").replace(/(?:^|[;,]) *(?:used|as) in .*$/i, " ");
}

/**
 * True when the meaning defines the word with the word itself ("will" = "what will be true",
 * "fish" = "more than one fish"). A single word is matched whole, with its plain endings and
 * its base form ("drinks" / "drink"); a phrase is matched as a whole phrase. Related words
 * ("rainy" / "rain") are not flagged: that is a gloss, not a circle.
 */
function containsTerm(meaning: string, term: string): boolean {
  const m = norm(definingPart(meaning));
  const t = norm(term).trim();
  const forms = new Set([t, t.replace(/(?:es|s|ed|d|ing)$/, "")]);
  return [...forms].some((f) => f.length >= 2 && shortWord(f).test(m));
}

/** True when the gloss only restates the word (its content words are all forms of the term's words). */
function repeatsTerm(meaning: string, term: string): boolean {
  const forms = tokens(term);
  const m = tokens(meaning).filter((w) => !["to", "a", "an", "the"].includes(w));
  return m.length === 0 || m.every((w) => forms.some((f) => sameWord(w, f)));
}

/** Sentences that describe the word instead of using it: "Used to talks about a past habit." */
const LABEL = /\b(?:talks? about|is an? (?:indirect|polite|formal|informal)|refers? to)\b/i;

/** Everything wrong with one card, as short reasons ("" list = clean). */
export function cardProblems(
  card: { term: string; meaning: string; example: string },
  level: Level = "A1",
  /** The course language: for French and Spanish the term is foreign, so the English circularity checks are off. */
  lang: "en" | "fr" | "es" = "en",
): string[] {
  const out: string[] = [];
  const { term, meaning, example } = card;
  if (!meaning.trim()) out.push("empty meaning");
  else {
    if (words(meaning).length > MAX_MEANING_WORDS) out.push("meaning over 8 words");
    if (lang === "en") {
      if (repeatsTerm(meaning, term)) out.push("meaning repeats the word");
      else if (containsTerm(meaning, term)) out.push("meaning contains the word");
    }
  }
  if (!example.trim()) out.push("empty example");
  else {
    if (words(example).length > maxExampleWords(level, lang))
      out.push(`example over ${maxExampleWords(level, lang)} words`);
    if (!mentionsTerm(example, lang === "en" ? term : withoutArticle(term)))
      out.push("example lacks the word");
    if (LABEL.test(example)) out.push("example is a label, not a sentence");
  }
  for (const [name, text] of [
    ["meaning", meaning],
    ["example", example],
  ] as const) {
    if (/_{2,}/.test(text)) out.push(`${name} has a blank`);
    if (/→|->/.test(text)) out.push(`${name} has an arrow`);
    if (/is correct here/i.test(text)) out.push(`${name} is the quiz explanation`);
    if (/[()[\]]/.test(text)) out.push(`${name} has a bracket clue`);
  }
  return out;
}
