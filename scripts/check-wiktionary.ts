/**
 * Third-source check (local only, never run in CI; the data is NOT committed).
 *
 * Reads the kaikki.org Wiktionary extracts (CC BY-SA) for French and Spanish,
 * looks up every verb form and noun gender in our committed tables, and writes
 * a SUMMARY to docs/superpowers/generative-wiktionary-check.json. Only that
 * summary is committed. A test (fr-data.test.ts / es-data.test.ts) fails if a
 * table entry changes after it was checked, or if any entry disagrees.
 *
 *   bun scripts/check-wiktionary.ts --fr <fr.jsonl> --es <es.jsonl>
 *
 * Download once, outside the repo:
 *   https://kaikki.org/dictionary/French/kaikki.org-dictionary-French.jsonl
 *   https://kaikki.org/dictionary/Spanish/kaikki.org-dictionary-Spanish.jsonl
 */
import { createReadStream, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { ES_NOUNS, ES_VERBS } from "../src/data/generative/es-data";
import { FR_NOUNS, FR_VERBS } from "../src/data/generative/fr-data";

type Sense = { tags?: string[]; form_of?: { word: string }[] };
type Entry = {
  word: string;
  pos: string;
  head_templates?: { expansion?: string }[];
  senses?: Sense[];
  forms?: { form: string; tags?: string[] }[];
};

function arg(name: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  if (!v) throw new Error(`missing --${name} <file>`);
  return v;
}

async function collect(file: string, targets: Set<string>): Promise<Map<string, Entry[]>> {
  const found = new Map<string, Entry[]>();
  const escaped = [...targets].map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const prefilter = new RegExp(`"word": "(?:${escaped.join("|")})"`);
  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) {
    // Key order varies between lines, so the entry word cannot be sliced out
    // of the text safely (a nested "word" key would be picked up instead).
    // Cheap prefilter (the entry word is somewhere in the text); only lines
    // that mention a target are parsed, which keeps the run to minutes.
    if (!prefilter.test(line)) continue;
    const e = JSON.parse(line) as Entry;
    if (!targets.has(e.word)) continue;
    const list = found.get(e.word) ?? [];
    list.push(e);
    found.set(e.word, list);
  }
  return found;
}

const PERSON_TAGS: [string, string][] = [
  ["first-person", "singular"],
  ["second-person", "singular"],
  ["third-person", "singular"],
  ["first-person", "plural"],
  ["second-person", "plural"],
  ["third-person", "plural"],
];

const OTHER_TENSES = ["past", "historic", "imperfect", "future", "conditional", "subjunctive", "imperative", "preterite"];

/** True when an entry for `word` is a verb form of `lemma` carrying one of the tag sets. */
function isFormOf(entries: Entry[] | undefined, lemma: string, need: string[][]): boolean {
  for (const e of entries ?? [])
    if (e.pos === "verb")
      for (const s of e.senses ?? []) {
        if (!s.form_of?.some((f) => f.word === lemma)) continue;
        const tags = s.tags ?? [];
        if (need.some((set) => set.every((t) => tags.includes(t)))) return true;
      }
  return false;
}

/** Wiktionary sometimes tags a present form only "indicative" (e.g. choisit): accept that when no other tense is named. */
function isPresentIndicative(entries: Entry[] | undefined, lemma: string, a: string, b: string): boolean {
  for (const e of entries ?? [])
    if (e.pos === "verb")
      for (const s of e.senses ?? []) {
        if (!s.form_of?.some((f) => f.word === lemma)) continue;
        const tags = s.tags ?? [];
        if (!tags.includes("indicative") || !tags.includes(a) || !tags.includes(b)) continue;
        if (tags.includes("present") || !OTHER_TENSES.some((t) => tags.includes(t))) return true;
      }
  return false;
}

/** The lemma's (or participle's) own inflection table lists the form with these tags. */
function listedAs(entries: Entry[] | undefined, form: string, tags: string[]): boolean {
  return (entries ?? []).some((e) =>
    (e.forms ?? []).some((f) => f.form === form && tags.every((t) => f.tags?.includes(t))),
  );
}

function genders(entries: Entry[] | undefined): Set<string> {
  const out = new Set<string>();
  for (const e of entries ?? []) {
    if (e.pos !== "noun") continue;
    for (const s of e.senses ?? []) {
      for (const t of s.tags ?? []) {
        if (t === "masculine") out.add("m");
        if (t === "feminine") out.add("f");
      }
    }
    for (const h of e.head_templates ?? []) {
      const m = /^\S+(?: \S+)*? (m|f|mf|m-f)\b/.exec(h.expansion ?? "");
      if (m?.[1] === "m") out.add("m");
      if (m?.[1] === "f") out.add("f");
    }
  }
  return out;
}

const disagreements: string[] = [];

async function main() {
  // ---- French
  const frTargets = new Set<string>();
  for (const v of FR_VERBS) {
    v.present.forEach((f) => frTargets.add(f));
    frTargets.add(v.participle);
    frTargets.add(v.inf);
    if (v.pcEtre) Object.values(v.pcEtre).forEach((f) => frTargets.add(f.split(" ")[1]!));
  }
  FR_NOUNS.forEach((n) => frTargets.add(n.key));
  const fr = await collect(arg("fr"), frTargets);

  const frVerbs: Record<string, unknown> = {};
  for (const v of FR_VERBS) {
    const problems: string[] = [];
    v.present.forEach((form, p) => {
      const [a, b] = PERSON_TAGS[p]!;
      if (!isPresentIndicative(fr.get(form), v.inf, a, b) && !listedAs(fr.get(v.inf), form, ["present", "indicative", a, b]))
        problems.push(`present ${p} "${form}"`);
    });
    const participles = v.pcEtre
      ? Object.values(v.pcEtre).map((f) => f.split(" ")[1]!)
      : [v.participle];
    if (v.pcEtre) {
      const [ms, fs, mp, fp] = participles as [string, string, string, string];
      if (!isFormOf(fr.get(ms), v.inf, [["participle", "past"], ["participle"]]))
        problems.push(`participle "${ms}"`);
      const chain = (form: string, base: string, tags: string[]) =>
        isFormOf(fr.get(form), base, [tags]) || listedAs(fr.get(base), form, tags);
      if (!chain(fs, ms, ["feminine", "singular"])) problems.push(`participle "${fs}"`);
      if (!chain(mp, ms, ["plural"])) problems.push(`participle "${mp}"`);
      if (!chain(fp, ms, ["feminine", "plural"])) problems.push(`participle "${fp}"`);
    } else if (!isFormOf(fr.get(v.participle), v.inf, [["participle", "past"], ["participle"]])) {
      problems.push(`participle "${v.participle}"`);
    }
    if (problems.length) disagreements.push(`fr verb ${v.inf}: ${problems.join(", ")}`);
    frVerbs[v.inf] = {
      present: [...v.present],
      participles,
      status: problems.length ? "disagree" : "agree",
    };
  }
  const frNouns: Record<string, unknown> = {};
  for (const n of FR_NOUNS) {
    const g = genders(fr.get(n.key));
    const ok = g.has(n.gender);
    if (!ok) disagreements.push(`fr noun ${n.key}: table ${n.gender}, wiktionary [${[...g]}]`);
    frNouns[n.key] = { gender: n.gender, status: ok ? "agree" : "disagree", wiktionary: [...g] };
  }

  // ---- Spanish
  const esTargets = new Set<string>();
  for (const v of ES_VERBS) {
    esTargets.add(v.inf);
    v.present.forEach((f) => esTargets.add(f));
    v.preterite?.forEach((f) => esTargets.add(f));
  }
  ES_NOUNS.forEach((n) => esTargets.add(n.key));
  const es = await collect(arg("es"), esTargets);

  const esVerbs: Record<string, unknown> = {};
  for (const v of ES_VERBS) {
    const problems: string[] = [];
    v.present.forEach((form, p) => {
      const [a, b] = PERSON_TAGS[p]!;
      if (!isPresentIndicative(es.get(form), v.inf, a, b) && !listedAs(es.get(v.inf), form, ["present", "indicative", a, b]))
        problems.push(`present ${p} "${form}"`);
    });
    v.preterite?.forEach((form, p) => {
      const [a, b] = PERSON_TAGS[p]!;
      if (
        !isFormOf(es.get(form), v.inf, [
          ["preterite", "indicative", a, b],
          ["past", "indicative", a, b],
        ])
      )
        problems.push(`preterite ${p} "${form}"`);
    });
    if (problems.length) disagreements.push(`es verb ${v.inf}: ${problems.join(", ")}`);
    esVerbs[v.inf] = {
      present: [...v.present],
      preterite: v.preterite ? [...v.preterite] : [],
      status: problems.length ? "disagree" : "agree",
    };
  }
  const esNouns: Record<string, unknown> = {};
  for (const n of ES_NOUNS) {
    const g = genders(es.get(n.key));
    const ok = g.has(n.gender);
    if (!ok) disagreements.push(`es noun ${n.key}: table ${n.gender}, wiktionary [${[...g]}]`);
    esNouns[n.key] = { gender: n.gender, status: ok ? "agree" : "disagree", wiktionary: [...g] };
  }

  const summary = {
    generated: new Date().toISOString().slice(0, 10),
    source:
      "kaikki.org Wiktionary extracts (CC BY-SA 4.0), run locally by scripts/check-wiktionary.ts; the data is not committed",
    fr: { verbs: frVerbs, nouns: frNouns },
    es: { verbs: esVerbs, nouns: esNouns },
    disagreements,
  };
  writeFileSync(
    "docs/superpowers/generative-wiktionary-check.json",
    JSON.stringify(summary, null, 2) + "\n",
  );
  console.log(
    `fr verbs ${FR_VERBS.length}, fr nouns ${FR_NOUNS.length}, es verbs ${ES_VERBS.length}, es nouns ${ES_NOUNS.length}; disagreements: ${disagreements.length}`,
  );
  for (const d of disagreements) console.log("  " + d);
}

main();
