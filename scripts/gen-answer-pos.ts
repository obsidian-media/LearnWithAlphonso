/**
 * Generates src/data/answer-pos.ts: a coarse part-of-speech tag for English
 * content answers, used to rank distractor candidates.
 *
 * Tags are taken FROM THE ANSWER'S OWN SENTENCE, never from the bare word.
 * That distinction is the whole correctness story here. `compromise` does not
 * hedge on a context-free word -- it commits to a single confident tag, and it
 * is frequently wrong: bare "tax", "card", "discount", "balance", "circle" and
 * "coins" all come back Verb. An earlier version of this script probed bare
 * words and tagged 45% of the bank Verb, which made the ranking layer promote
 * nouns into verb slots -- precisely the defect the layer exists to remove.
 * Filling the blank and tagging the term in place fixes ~9 of 10 of those.
 * (This repo already documented compromise's bare-word weakness; see
 * docs/superpowers/specs/2026-09-22-generative-sentence-content-design.md.)
 *
 * Two conservative rules, because a wrong tag is worse than no tag -- no tag
 * merely declines to express a preference, while a wrong one actively promotes
 * a bad distractor:
 *
 *   - Only cloze packs provide a sentence, so only they yield tags. An answer
 *     seen solely in "pair" packs is left untagged; those pools are
 *     semantically coherent by construction (all plurals, all animals), so
 *     part-of-speech adds little there anyway.
 *   - If a word is tagged differently in different sentences, it is genuinely
 *     ambiguous in this corpus and is dropped rather than arbitrated.
 *
 * Why precomputed rather than tagged at runtime: `pickDistractors` runs while
 * the curriculum is built at module load, for ~2,550 questions on every app
 * start. Tagging there would pull `compromise` into the client bundle and spend
 * startup time on it.
 *
 * Re-run this whenever lesson-bank.ts gains or changes answer strings.
 *
 * Usage: bun run scripts/gen-answer-pos.ts
 */
import fs from "node:fs";
import path from "node:path";
import nlp from "compromise";
import { BANK } from "../src/data/lesson-bank";

const CATEGORIES = [
  "Verb",
  "Adjective",
  "Adverb",
  "Preposition",
  "Pronoun",
  "Determiner",
  "Conjunction",
  "Value",
  "Noun",
] as const;

/** Tags `answer` as it actually reads inside `sentence`, or null if not found. */
function tagInContext(sentence: string, answer: string): string | null {
  const first = answer.toLowerCase().split(/\s+/)[0];
  if (!first) return null;
  const terms = (nlp(sentence).json()[0]?.terms ?? []) as { text: string; tags: string[] }[];
  for (const term of terms) {
    const normalised = term.text.toLowerCase().replace(/[^a-z'-]/g, "");
    if (normalised !== first) continue;
    for (const category of CATEGORIES) {
      if (term.tags.includes(category)) return category;
    }
    return null;
  }
  return null;
}

/**
 * Emits a bare key where JS allows one, quoting only what needs it. Prettier's
 * `quoteProps: "as-needed"` would otherwise rewrite every quoted key and fail
 * lint on a freshly generated file.
 */
function objectKey(word: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(word) ? word : JSON.stringify(word);
}

const observed = new Map<string, Set<string>>();
let clozeLines = 0;
let pairOnly = 0;

for (const pack of Object.values(BANK).flat()) {
  for (const line of pack.data.split("\n")) {
    const parts = line.trim().split("|");
    if (parts.length !== 2) continue;
    const [left, answer] = [parts[0]!.trim(), parts[1]!.trim()];
    if (!answer) continue;

    if (pack.kind !== "cloze" || !left.includes("___")) {
      pairOnly++;
      continue;
    }
    clozeLines++;
    const tag = tagInContext(left.replace("___", answer), answer);
    if (!tag) continue;
    if (!observed.has(answer)) observed.set(answer, new Set());
    observed.get(answer)!.add(tag);
  }
}

const stable = [...observed.entries()]
  .filter(([, tags]) => tags.size === 1)
  .map(([answer, tags]) => [answer, [...tags][0]!] as const)
  .sort((a, b) => a[0].localeCompare(b[0]));

const dropped = [...observed.values()].filter((t) => t.size > 1).length;

const body = `// GENERATED FILE -- do not edit by hand.
// Regenerate with: bun run scripts/gen-answer-pos.ts
//
// Coarse part-of-speech tag per English answer, read from the answer's own
// sentence rather than from the bare word (bare-word tagging is confidently
// wrong often enough to do harm -- see the generator's header comment).
// Only answers appearing in a cloze sentence are tagged, and only where every
// sentence agrees. Absence of a tag means "no preference", never "unknown
// word": distractor ranking degrades gracefully to pool order.

export const ANSWER_POS: Record<string, string> = {
${stable.map(([a, p]) => `  ${objectKey(a)}: ${JSON.stringify(p)},`).join("\n")}
};
`;

const out = path.resolve(import.meta.dirname, "../src/data/answer-pos.ts");
fs.writeFileSync(out, body);
console.log(`Wrote ${out}`);
console.log(
  `${clozeLines} cloze lines tagged, ${pairOnly} pair/non-blank lines skipped, ` +
    `${stable.length} answers tagged, ${dropped} dropped as context-ambiguous`,
);
const counts = stable.reduce<Record<string, number>>((acc, [, p]) => {
  acc[p] = (acc[p] ?? 0) + 1;
  return acc;
}, {});
console.log("distribution:", counts);
