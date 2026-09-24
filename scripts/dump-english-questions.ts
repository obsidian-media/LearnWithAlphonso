/**
 * Writes the compiled English question dump used by the phase 1 content
 * audit. The audit reviews generated output (real distractors), not raw
 * pack source, because pickDistractors is what produces the wrong answers.
 *
 * Usage: bun run scripts/dump-english-questions.ts
 */
import fs from "node:fs";
import path from "node:path";
import { buildEnglishDump } from "../src/lib/english-content-dump";

const outDir = path.resolve(import.meta.dirname, "../.audit");
fs.mkdirSync(outDir, { recursive: true });

const dump = buildEnglishDump();
for (const [level, questions] of Object.entries(dump.byLevel)) {
  const out = path.join(outDir, `english-${level}.json`);
  fs.writeFileSync(out, JSON.stringify(questions, null, 2));
  console.log(`Wrote ${out} (${questions.length} questions)`);
}
const placementOut = path.join(outDir, "english-placement.json");
fs.writeFileSync(placementOut, JSON.stringify(dump.placement, null, 2));
console.log(`Wrote ${placementOut} (${dump.placement.length} questions)`);
console.log(`Totals: ${dump.totals.curriculum} curriculum, ${dump.totals.placement} placement`);
