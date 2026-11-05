// Mechanical variants of the accepted wordings of a translate question, so the hand-written lists
// only carry genuinely different sentences. Everything here is a swap a fluent speaker treats as the
// same sentence: politeness words on a request, "on Saturdays" / "every Saturday", spelling and
// word-choice differences between British and American English, "has got" in its short form.
//
// Contractions, numerals and punctuation are already folded by normaliseSpoken (the grader), so they
// are not repeated here.

import { normaliseSpoken } from "../lib/spoken-answer";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** Pairs written both ways, whole words, matched case-insensitively. */
const WORD_PAIRS: [string, string][] = [
  ["TV", "television"],
  ["film", "movie"],
  ["flat", "apartment"],
  ["sofa", "couch"],
  ["mother", "mom"],
  ["mother", "mum"],
  ["email", "e-mail"],
  ["centre", "center"],
  ["neighbour", "neighbor"],
  ["neighbours", "neighbors"],
  ["grey", "gray"],
  ["favourite", "favorite"],
  ["colour", "color"],
];

/** Pairs that only swap in some positions: "the shop" is "the store", "she shops" is not "she stores". */
const CONTEXT_PAIRS: [RegExp, string][] = [
  [/\b(the|a|my|our|nearest|closest) shop(s?)\b/gi, "$1 store$2"],
  [/\b(the|a|my|our|nearest|closest) store(s?)\b/gi, "$1 shop$2"],
  [/\bvery(?! much)\b/gi, "really"],
  [/\breally\b/gi, "very"],
];

const escapeRe = (w: string) => w.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");

function swapWord(text: string, from: string, to: string): string | null {
  const re = new RegExp(`(?<![\\w-])${escapeRe(from)}(?![\\w-])`, "gi");
  if (!re.test(text)) return null;
  return text.replace(re, (m) => (m === m.toUpperCase() && m.length > 1 ? to : keepCase(m, to)));
}
const keepCase = (from: string, to: string) =>
  from[0] === from[0]!.toUpperCase() && from !== "TV" ? to[0]!.toUpperCase() + to.slice(1) : to;

/** One sentence's own variants (not the sentence itself). */
function variantsOf(text: string): string[] {
  const out: string[] = [];
  const add = (s: string | null) => {
    if (s && s !== text) out.push(s);
  };
  for (const [a, b] of WORD_PAIRS) {
    add(swapWord(text, a, b));
    add(swapWord(text, b, a));
  }
  for (const [re, to] of CONTEXT_PAIRS) {
    re.lastIndex = 0;
    if (re.test(text)) add(text.replace(re, to));
  }
  // "on Saturdays" -> "on Saturday", "every Saturday"
  for (const d of DAYS) {
    if (new RegExp(`\\bon ${d}s\\b`).test(text)) {
      add(text.replace(`on ${d}s`, `on ${d}`));
      add(text.replace(`on ${d}s`, `every ${d}`));
    }
    if (new RegExp(`\\bevery ${d}\\b`).test(text)) add(text.replace(`every ${d}`, `on ${d}s`));
  }
  // "on weekends" -> "at weekends", "at the weekend", "on the weekend"
  if (/\bon weekends\b/.test(text))
    for (const w of ["at weekends", "at the weekend", "on the weekend"])
      add(text.replace("on weekends", w));
  if (/\bat weekends\b/.test(text))
    for (const w of ["on weekends", "at the weekend"]) add(text.replace("at weekends", w));
  // "ten o'clock" -> "ten"
  add(text.replace(/\b(\w+) o'clock\b/, "$1"));
  // "she has got" <-> "she's got": the grader reads 's as "is", so both spellings are listed
  add(text.replace(/\b(he|she|it) has got\b/i, (_, p: string) => `${p}'s got`));
  add(text.replace(/\b(he|she|it)'s got\b/i, (_, p: string) => `${p} has got`));
  return out;
}

const withoutEnd = (s: string) => s.trim().replace(/[.?!]+$/, "");
const endOf = (s: string) => /[.?!]+$/.exec(s.trim())?.[0] ?? "";

/** "..., please" for a request or a question to a stranger; "Please ..." for an instruction. */
function pleaseVariants(text: string): string[] {
  if (/\bplease\b/i.test(text)) {
    const without = text
      .replace(/,?\s*\bplease\b\s*([.?!]*)$/i, "$1")
      .replace(/^please,?\s+/i, "")
      .trim();
    return without && without !== text ? [without[0]!.toUpperCase() + without.slice(1)] : [];
  }
  // Only a single sentence: "Thank you. Could we ...?" has its please added to the last one.
  const out = [`${withoutEnd(text)}, please${endOf(text) || "."}`];
  if (/^(turn|go|take|walk|continue|repeat|open|close|bring|wait)\b/i.test(text))
    out.push(`Please ${text[0]!.toLowerCase()}${text.slice(1)}`);
  return out;
}

/**
 * The wordings a translate question accepts: the authored ones, then their mechanical variants.
 * `polite` adds "please" forms (the idea is an "Ask ..." or "Tell someone ..." prompt).
 */
export function expandAcceptedAnswers(say: string[], polite: boolean): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (s: string) => {
    const k = normaliseSpoken(s);
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push(s);
  };
  say.forEach(push);
  // A second pass over the first one's output catches variants of variants
  // ("on Saturdays" with "television" at once).
  let layer = [...out];
  for (let round = 0; round < 2; round++) {
    const next: string[] = [];
    for (const s of layer) {
      const before = out.length;
      variantsOf(s).forEach(push);
      next.push(...out.slice(before));
    }
    layer = next;
  }
  if (polite) {
    const base = [...out];
    for (const s of base) pleaseVariants(s).forEach(push);
  }
  return out;
}
