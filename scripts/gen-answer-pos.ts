/**
 * Generates src/data/answer-pos.ts: a coarse part-of-speech tag for every
 * distinct answer string in the English content bank.
 *
 * Why precomputed rather than tagged at runtime: `pickDistractors` runs while
 * the curriculum is built at module load, on every app start. Tagging there
 * would pull `compromise` (and its data) into the client bundle and spend
 * startup time on ~2,700 questions. The tags are static content-derived facts,
 * so they are computed once here and committed.
 *
 * Re-run this whenever lesson-bank.ts gains or changes answer strings.
 *
 * Usage: bun run scripts/gen-answer-pos.ts
 */
import fs from "node:fs";
import path from "node:path";
import nlp from "compromise";
import { BANK } from "../src/data/lesson-bank";

/** Checked in order; the first match wins, so the more specific tags precede Noun. */
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

function coarsePos(phrase: string): string | null {
  const doc = nlp(phrase);
  for (const c of CATEGORIES) {
    if (doc.has(`#${c}`)) return c;
  }
  return null;
}

const answers = new Set<string>();
for (const pack of Object.values(BANK).flat()) {
  for (const line of pack.data.split("\n")) {
    const parts = line.trim().split("|");
    if (parts.length !== 2) continue;
    const answer = parts[1]!.trim();
    if (answer) answers.add(answer);
  }
}

const entries = [...answers].sort();
const tagged = entries
  .map((a) => [a, coarsePos(a)] as const)
  .filter((pair): pair is readonly [string, string] => pair[1] !== null);

const body = `// GENERATED FILE -- do not edit by hand.
// Regenerate with: bun run scripts/gen-answer-pos.ts
//
// Coarse part-of-speech tag per distinct English answer string, precomputed so
// distractor selection can prefer grammatically plausible wrong answers without
// pulling a tagging library into the client bundle or app startup path.
// Tags are advisory: a missing or wrong entry only costs distractor ordering,
// never correctness -- see src/lib/distractor-affinity.ts.

export const ANSWER_POS: Record<string, string> = {
${tagged.map(([a, p]) => `  ${JSON.stringify(a)}: ${JSON.stringify(p)},`).join("\n")}
};
`;

const out = path.resolve(import.meta.dirname, "../src/data/answer-pos.ts");
fs.writeFileSync(out, body);
console.log(`Wrote ${out}`);
console.log(`${entries.length} distinct answers, ${tagged.length} tagged, ${entries.length - tagged.length} untagged`);
