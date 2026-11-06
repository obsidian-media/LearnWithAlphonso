/**
 * Counts the French and Spanish A1/A2 option defects that a script can see, in a built curriculum
 * bundle, so main and a branch are measured the same way:
 *
 *   bun scripts/romance-option-audit.ts ios/LearnWithAlphonso/Resources/curriculum-fr.json [--seed 3911104] [--sample 60]
 *
 * Classes (the ones the #391 review named, docs/distractor-policy.md):
 *   conjugation  a drill line ("Je ___ (parler)") offers an option that is not a form of its verb
 *   polite       the answer is the only option ending in "please" / "thanks"
 *   possessive   a possessive blank with no clue saying whose it is
 * It prints the population counts and the same counts on a seeded sample of A1/A2 mc/fill questions.
 * Judgement defects (naturalness, register, a second right answer) need a reader; see
 * scripts/content-panel/.
 */
import fs from "node:fs";
import { hash } from "../src/data/bank-engine";
import { isFormOf } from "../src/data/conjugation-form-check";

type Q = {
  id: string;
  type: string;
  prompt: string;
  choices?: string[];
  bank?: string[];
  answer?: number | string;
};

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

const file = process.argv[2];
if (!file) throw new Error("usage: bun scripts/romance-option-audit.ts <curriculum-xx.json>");
const seed = arg("seed", "3911104");
const sampleSize = Number(arg("sample", "60"));

const questions: Q[] = [];
(function walk(x: unknown): void {
  if (Array.isArray(x)) x.forEach(walk);
  else if (x && typeof x === "object") {
    const o = x as Record<string, unknown>;
    if (typeof o.id === "string" && typeof o.type === "string" && "prompt" in o)
      questions.push(o as Q);
    else Object.values(o).forEach(walk);
  }
})(JSON.parse(fs.readFileSync(file, "utf8")));

const A1A2 = /^(fr|es)a[12]p\d+q\d+$/;
const INF = { fr: /^(se\s+|s')?[\p{L}]+(er|ir|re)$/u, es: /^[\p{L}]*(ar|er|ir|ír)(se)?$/u };
/** Same rule as the gate: a pack is a drill when at least 5 of its lines are ("(quarter)" twice is not). */
const MIN_DRILL_LINES = 5;
const packOf = (id: string) => id.replace(/q\d+$/, "");
const TAG = /,\s*(s'il vous plaît|s'il te plaît|merci|por favor|gracias)\s*[?.!]*$/i;
const POSS =
  /^(mon|ma|mes|ton|ta|tes|son|sa|ses|notre|nos|votre|vos|leur|leurs|mi|mis|tus|su|sus|nuestro|nuestra|nuestros|nuestras)$/i;

function drillLine(q: Q): string | null {
  const options = q.type === "mc" ? q.choices! : q.bank!;
  const answer = q.type === "mc" ? options[q.answer as number]! : (q.answer as string);
  const verb = q.prompt.match(/\(([^)]+)\)/)?.[1]?.trim();
  const lang = q.id.startsWith("fr") ? "fr" : "es";
  return verb && INF[lang].test(verb) && isFormOf(answer, verb) ? verb : null;
}
const drillCount = new Map<string, number>();
const isDrill = (q: Q) => (drillCount.get(packOf(q.id)) ?? 0) >= MIN_DRILL_LINES && drillLine(q);

function defects(q: Q): string[] {
  const options = q.type === "mc" ? q.choices! : q.bank!;
  const answer = q.type === "mc" ? options[q.answer as number]! : (q.answer as string);
  const wrong = options.filter((o) => o !== answer);
  const out: string[] = [];
  const verb = isDrill(q);
  if (verb && wrong.some((w) => !isFormOf(w, verb))) out.push("conjugation");
  const tag = answer.replace(/[’]/g, "'").match(TAG)?.[1]?.toLowerCase();
  if (tag && !wrong.some((w) => w.replace(/[’]/g, "'").match(TAG)?.[1]?.toLowerCase() === tag))
    out.push("polite");
  if (POSS.test(answer) && q.prompt.includes("___") && !/\([^)]+\)/.test(q.prompt))
    out.push("possessive");
  return out;
}

const pool = questions.filter((q) => A1A2.test(q.id) && (q.type === "mc" || q.type === "fill"));
for (const q of pool)
  if (drillLine(q)) drillCount.set(packOf(q.id), (drillCount.get(packOf(q.id)) ?? 0) + 1);
const count = (qs: Q[]) => {
  const by: Record<string, number> = { conjugation: 0, polite: 0, possessive: 0 };
  let any = 0;
  for (const q of qs) {
    const d = defects(q);
    if (d.length) any++;
    for (const k of d) by[k] = (by[k] ?? 0) + 1;
  }
  return { any, ...by };
};
const sample = [...pool]
  .sort((a, b) => hash(`${seed}:${a.id}`) - hash(`${seed}:${b.id}`))
  .slice(0, sampleSize);
if (process.argv.includes("--list"))
  for (const q of pool) {
    const d = defects(q);
    if (d.length) console.log(q.id, d.join(","), q.prompt, "|", (q.choices ?? q.bank)!.join(" / "));
  }
console.log(
  JSON.stringify({
    file,
    seed,
    population: pool.length,
    all: count(pool),
    sample: { n: sample.length, ...count(sample) },
  }),
);
