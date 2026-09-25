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
 *   - Only cloze packs provide a sentence, so only they yield a TAGGED tag.
 *     Pair packs contribute a DECLARED one instead -- see
 *     src/data/pair-answer-class.ts -- read off the prompt template, which is
 *     the author's own statement of the answer's class ("Which verb goes with
 *     ...?" cannot be answered by a noun). No tagger runs on a pair answer,
 *     because both automated options were measured and both are unsafe: bare
 *     words call `square`, `circle` and `cube` verbs, and dropping the answer
 *     into a synthetic frame imposes a class rather than reading one (`They X.`
 *     turns 16 of this corpus's nouns into verbs). An earlier note here claimed
 *     pair pools are "semantically coherent by construction, so part-of-speech
 *     adds little" -- that was wrong, and a1p15 is the counterexample: 23 of its
 *     25 questions offered a distractor from the other class.
 *   - If a word is tagged differently in different sentences, or declared
 *     differently by two packs, it is genuinely ambiguous in this corpus and is
 *     dropped rather than arbitrated. Sentence evidence and declared evidence go
 *     into the same map deliberately, so neither can override the other.
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
import { DECLARED_BY_PACK, DECLARED_BY_TEMPLATE } from "../src/data/pair-answer-class";

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
/**
 * The same evidence with pair declarations withheld. Its only purpose is to
 * report what adding them cost: a word a sentence tagged one way and a template
 * declares another is dropped, and a dropped tag is a preference the ranking
 * layer loses. Reported rather than assumed harmless.
 */
const clozeOnlyObserved = new Map<string, Set<string>>();
let clozeLines = 0;
let pairOnly = 0;
let pairDeclared = 0;

function record(answer: string, tag: string, alsoClozeOnly = false) {
  for (const map of alsoClozeOnly ? [observed, clozeOnlyObserved] : [observed]) {
    if (!map.has(answer)) map.set(answer, new Set());
    map.get(answer)!.add(tag);
  }
}

for (const pack of Object.values(BANK).flat()) {
  for (const line of pack.data.split("\n")) {
    const parts = line.trim().split("|");
    if (parts.length !== 2) continue;
    const [left, answer] = [parts[0]!.trim(), parts[1]!.trim()];
    if (!answer) continue;

    if (pack.kind !== "cloze" || !left.includes("___")) {
      // No sentence to read, so take the template's declaration if it makes
      // one. Multi-word answers are excluded: tagInContext reads the answer's
      // first word, which for a gloss ("every single time") says nothing.
      const declared =
        DECLARED_BY_PACK[pack.id]?.[answer] ??
        (pack.kind === "pair" ? DECLARED_BY_TEMPLATE[pack.prompt ?? ""] : null);
      if (declared && !/\s/.test(answer)) {
        record(answer, declared);
        pairDeclared++;
      } else {
        pairOnly++;
      }
      continue;
    }
    clozeLines++;
    const tag = tagInContext(left.replace("___", answer), answer);
    if (!tag) continue;
    record(answer, tag, true);
  }
}

const stable = [...observed.entries()]
  .filter(([, tags]) => tags.size === 1)
  .map(([answer, tags]) => [answer, [...tags][0]!] as const)
  .sort((a, b) => a[0].localeCompare(b[0]));

const dropped = [...observed.values()].filter((t) => t.size > 1).length;

const stableOf = (map: Map<string, Set<string>>) =>
  new Map(
    [...map.entries()].filter(([, tags]) => tags.size === 1).map(([a, tags]) => [a, [...tags][0]!]),
  );
const before = stableOf(clozeOnlyObserved);
const after = stableOf(observed);
// A word whose tag CHANGED would mean a declaration overrode a sentence, which
// the agree-or-drop rule forbids; it must always be zero. A word whose tag was
// LOST is a homograph this corpus uses both ways -- acceptable, and cheaper than
// arbitrating -- but it is a preference given up, so it is printed by name.
const lost = [...before.keys()].filter((w) => !after.has(w));
const changed = [...after.entries()].filter(([w, t]) => before.has(w) && before.get(w) !== t);

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
  `${clozeLines} cloze lines tagged, ${pairDeclared} pair lines declared, ` +
    `${pairOnly} lines skipped, ${stable.length} answers tagged, ` +
    `${dropped} dropped as ambiguous`,
);
console.log(
  `map ${before.size} (sentences only) -> ${after.size}; ` +
    `${changed.length} tags changed (must be 0); ${lost.length} lost to conflict`,
);
if (lost.length) console.log(`  lost: ${lost.join(", ")}`);
if (changed.length) {
  console.error("A declaration overrode sentence evidence -- this must never happen:");
  for (const [w, t] of changed) console.error(`  ${w}: ${before.get(w)} -> ${t}`);
  process.exitCode = 1;
}
const counts = stable.reduce<Record<string, number>>((acc, [, p]) => {
  acc[p] = (acc[p] ?? 0) + 1;
  return acc;
}, {});
console.log("distribution:", counts);
