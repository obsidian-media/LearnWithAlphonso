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
 *   - Only cloze packs provide a sentence, so only they yield a tag here. An
 *     answer seen solely in "pair" packs stays out of ANSWER_POS. An earlier
 *     note claimed that was harmless because pair pools are "semantically
 *     coherent by construction" -- wrong, and a1p15 "Shapes & Sizes" is the
 *     counterexample: it mixes shape nouns with size adjectives, and 23 of its 25
 *     questions offered a distractor from the other class. Packs like that are
 *     handled by PACK_ANSWER_POS below, not here.
 *   - If a word is tagged differently in different sentences it is dropped rather
 *     than arbitrated. That rule is doing two jobs: it declines to guess at a
 *     genuine homograph, AND it filters tagger errors, because a word this
 *     tagger reads inconsistently is a word it is probably reading wrongly
 *     somewhere. Removing the second job has a measurable cost -- scoping the
 *     whole map per pack was tried and it tagged `coins` a Verb from "Can I pay
 *     in ___ instead of cash?", which promoted it into a1p11's verb slot. The
 *     corpus-wide check had been masking that.
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
import { HAND_LABELLED_PACKS } from "../src/data/pair-answer-class";
// Imported only for the baseline diff at the bottom: at module load this is
// still the previous run's committed output, which is what we want to compare.
import { ANSWER_POS as PREVIOUS_ANSWER_POS } from "../src/data/answer-pos";

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
let pairDeclared = 0;

function record(answer: string, tag: string) {
  if (!observed.has(answer)) observed.set(answer, new Set());
  observed.get(answer)!.add(tag);
}

for (const pack of Object.values(BANK).flat()) {
  for (const line of pack.data.split("\n")) {
    const parts = line.trim().split("|");
    if (parts.length !== 2) continue;
    const [left, answer] = [parts[0]!.trim(), parts[1]!.trim()];
    if (!answer) continue;

    if (pack.kind !== "cloze" || !left.includes("___")) {
      // Hand labels do NOT go into `observed`. They are emitted separately as
      // per-pack overrides, for two reasons. They are ground truth, so putting
      // them where the agree-or-drop rule can discard them would be perverse --
      // and worse than perverse, because discarding a tag PROMOTES that word
      // (distractor-affinity's rank() resolves an untagged candidate to the
      // answer's own class). Feeding declarations into this map cost 12 words
      // their tags and degraded 43 questions across 11 packs, to fix one.
      if (HAND_LABELLED_PACKS[pack.id]?.[answer]) pairDeclared++;
      else pairOnly++;
      continue;
    }
    clozeLines++;
    const tag = tagInContext(left.replace("___", answer), answer);
    if (!tag) continue;
    record(answer, tag);
  }
}

const stable = [...observed.entries()]
  .filter(([, tags]) => tags.size === 1)
  .map(([answer, tags]) => [answer, [...tags][0]!] as const)
  .sort((a, b) => a[0].localeCompare(b[0]));

const dropped = [...observed.values()].filter((t) => t.size > 1).length;
const nextTags = new Map(stable);

// Diffed against the map already committed, which is imported at the top of this
// file and therefore still holds the PREVIOUS run's values here.
//
// This replaces a check that could not fail. It compared this run's output
// against a shadow copy of a SUBSET of its own inputs, so "0 tags changed" was a
// tautology -- and it was quoted as measured reassurance in the audit log while
// 12 words were silently losing their tags in the same run. Losing a tag is not
// a neutral loss of preference: rank() resolves an untagged candidate to the
// answer's own class, so a word that loses its tag is PROMOTED into every pool
// it appears in. Those 12 degraded 43 questions across 11 packs.
const lost = Object.keys(PREVIOUS_ANSWER_POS).filter((w) => !nextTags.has(w));
const changed = [...nextTags.entries()].filter(
  ([w, t]) => w in PREVIOUS_ANSWER_POS && PREVIOUS_ANSWER_POS[w] !== t,
);

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

// Hand-labelled word classes for packs whose answer pool genuinely mixes
// classes, scoped to the pack and consulted BEFORE the map above.
//
// Scoped, because a pack's distractors only ever come from its own pool, so that
// is the only scope in which tags are compared. Not merged into ANSWER_POS,
// because a hand label is ground truth and the merge rule there drops any word
// two sources disagree about -- which would discard the label, and discarding is
// not neutral: an untagged candidate is treated by rank() as the answer's own
// class, i.e. as a perfect distractor. \`light\` is a noun in a1p18 ("bright
// light") and an adjective in a1p15 ("is not heavy"); both are right, and
// scoping is what lets both be true at once.
export const PACK_ANSWER_POS: Record<string, Record<string, string>> = {
${Object.entries(HAND_LABELLED_PACKS)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(
    ([packId, words]) =>
      `  ${objectKey(packId)}: {\n` +
      Object.entries(words)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([w, t]) => `    ${objectKey(w)}: ${JSON.stringify(t)},`)
        .join("\n") +
      `\n  },`,
  )
  .join("\n")}
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
  `vs committed map: ${stable.length} tags, ${lost.length} lost, 
   ${changed.length} changed`,
);
if (lost.length) console.log(`  LOST (each one PROMOTES that word): ${lost.join(", ")}`);
for (const [w, t] of changed) console.log(`  CHANGED ${w}: ${PREVIOUS_ANSWER_POS[w]} -> ${t}`);
if (lost.length || changed.length) {
  console.error(
    "Tags were lost or changed. Neither is necessarily wrong, but both change which " +
      "distractors learners see -- read the content diff before committing.",
  );
  process.exitCode = 1;
}
const counts = stable.reduce<Record<string, number>>((acc, [, p]) => {
  acc[p] = (acc[p] ?? 0) + 1;
  return acc;
}, {});
console.log("distribution:", counts);
