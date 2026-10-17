/**
 * Prints a human-readable spot-check sample of the generated French/Spanish
 * sentences with their English meaning, for the owner to read. The English is
 * built from the lexicon's own glosses and is NEVER written into the course
 * banks (the explanation line has no slot for it).
 *
 *   bun scripts/romance-sample.ts --lang fr|es [--count 40] [--seed 1] [--all]
 */
import { hash } from "../src/data/bank-engine";
import { ROMANCE_PACK_SPECS, buildRomancePack } from "../src/data/generative/romance-packs";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

const lang = arg("lang", "fr");
const count = Number(arg("count", "40"));
const seed = arg("seed", "1");
const all = process.argv.includes("--all");

const rows = ROMANCE_PACK_SPECS.filter((s) => s.lang === lang).flatMap((spec) =>
  buildRomancePack(spec).items.map((item) => ({ pack: spec.id, item })),
);
const picked = all
  ? rows
  : [...rows]
      .sort((a, b) => hash(`${seed}:${a.item.line}`) - hash(`${seed}:${b.item.line}`))
      .slice(0, count);

console.log(`| Pack | Sentence | Answer | English |`);
console.log(`| --- | --- | --- | --- |`);
for (const { pack, item } of picked) {
  const sentence = item.prompt.replace("___", `**${item.answer}**`);
  console.log(`| ${pack} | ${sentence} | ${item.answer} | ${item.en} |`);
}
console.error(`${picked.length} of ${rows.length} generated sentences`);
