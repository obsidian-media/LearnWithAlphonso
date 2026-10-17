/**
 * Detecting the Lefff conjugation lexicon (french-verbs-lefff, LGPL-LR data,
 * 6 MB) in source files or in a built bundle.
 *
 * A bundler rewrites the JSON: keys lose their quotes, double quotes become
 * backticks or single quotes, whitespace goes. So the markers are NOT quoted
 * strings: each is a run of rare verb forms with ANY quote character (or none
 * of the usual ones) between them. The words are assembled from pieces so
 * this file does not itself contain a marker, which lets the scans look at
 * every tracked file, this one included.
 */
const Q = "[\"'`]";
const GAP = `${Q}\\s*,\\s*${Q}`;

const run = (...words: string[]) => new RegExp(words.join(GAP));

export const LEFFF_PATTERNS: RegExp[] = [
  run("sui" + "s", "sui" + "s", "sui" + "t", "suiv" + "ons"),
  run("suiv" + "ions", "suiv" + "iez"),
  run("abhorr" + "ions", "abhorr" + "iez"),
];

/** Our own lexicon is tiny. More than this many rows shaped `P:[` is a pasted fragment. */
export const LEFFF_ROW_SHAPE = new RegExp(`\\bP${Q}?\\s*:\\s*\\[${Q}`, "g");
export const LEFFF_ROW_LIMIT = 4;

/** Returns why `text` looks like it contains Lefff data, or null. */
export function findLefffLeak(text: string): string | null {
  if (LEFFF_PATTERNS.some((p) => p.test(text))) return "marker";
  if ((text.match(LEFFF_ROW_SHAPE) ?? []).length > LEFFF_ROW_LIMIT) return "rows";
  return null;
}
