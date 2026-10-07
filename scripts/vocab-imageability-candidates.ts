/**
 * W1: writes classification batches for every in-scope term the
 * classifier cannot decide yet (reason "not-listed" or "no-query").
 *
 *   bun scripts/vocab-imageability-candidates.ts --init-scope   # once: legacy keys -> scope-keys.json
 *   bun scripts/vocab-imageability-candidates.ts                # -> scripts/vocab-images/work/imageability/<lang>-NN.json
 */
import fs from "node:fs";
import path from "node:path";
import nlp from "compromise";
import { VOCAB_IMAGES } from "../src/data/vocab-images";
import { classifyImageability } from "../src/lib/vocab-images/imageability";
import type { CandidateBatch } from "../src/lib/vocab-images/imageability-merge";
import { vocabTermIndex } from "../src/lib/vocab-images/terms";
import { IMAGE_LANGS } from "../src/lib/vocab-images/types";

const SCOPE = path.resolve(import.meta.dirname, "vocab-images/scope-keys.json");
const OUT = path.resolve(import.meta.dirname, "vocab-images/work/imageability");
const BATCH = 150;
const index = vocabTermIndex();

if (process.argv.includes("--init-scope")) {
  if (fs.existsSync(SCOPE)) {
    console.error(
      `${SCOPE} already exists; scope is fixed once. Edit it deliberately to grow coverage.`,
    );
    process.exit(1);
  }
  const keys = [...new Set([...Object.keys(VOCAB_IMAGES), "doctor"])]
    .filter((k) => index.has(k))
    .sort();
  fs.mkdirSync(path.dirname(SCOPE), { recursive: true });
  fs.writeFileSync(SCOPE, JSON.stringify(keys, null, 2) + "\n");
  console.log(`scope: ${keys.length} keys (legacy keys that still appear in a lesson)`);
  process.exit(0);
}

const scope = new Set<string>(JSON.parse(fs.readFileSync(SCOPE, "utf8")));
const hint = (term: string): string => {
  const doc = nlp(term);
  if (doc.has("#Noun")) return "noun";
  if (doc.has("#Verb")) return "verb";
  if (doc.has("#Adjective")) return "adjective";
  return "other";
};

fs.mkdirSync(OUT, { recursive: true });
for (const lang of IMAGE_LANGS) {
  const seen = new Set<string>();
  const candidates: CandidateBatch["candidates"] = [];
  for (const [key, entry] of index) {
    if (!scope.has(key) || !entry.langs.has(lang)) continue;
    const r = classifyImageability(key, lang);
    if (r.imageable || (r.reason !== "not-listed" && r.reason !== "no-query")) continue;
    if (seen.has(r.lookup)) continue;
    seen.add(r.lookup);
    candidates.push({
      term: r.lookup,
      key,
      meaning: entry.meaning,
      enHint: lang === "en" ? hint(r.lookup) : null,
    });
  }
  candidates.sort((a, b) => (a.term < b.term ? -1 : 1));
  for (let i = 0; i < candidates.length; i += BATCH) {
    const id = `${lang}-${String(i / BATCH + 1).padStart(2, "0")}`;
    const batch: CandidateBatch = { batch: id, lang, candidates: candidates.slice(i, i + BATCH) };
    fs.writeFileSync(path.join(OUT, `${id}.json`), JSON.stringify(batch, null, 2) + "\n");
  }
  console.log(
    `${lang}: ${candidates.length} candidates in ${Math.ceil(candidates.length / BATCH)} batches`,
  );
}
