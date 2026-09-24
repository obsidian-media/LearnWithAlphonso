/**
 * Writes the compiled question dump used by the phase 1 content audit. The
 * audit reviews generated output (real distractors), not raw pack source,
 * because pickDistractors is what produces the wrong answers.
 *
 * Usage: bun run scripts/dump-english-questions.ts [course]
 * `course` is "en" (default), "fr", or "es".
 */
import fs from "node:fs";
import path from "node:path";
import { buildCourseDump } from "../src/lib/english-content-dump";
import type { Course } from "../src/data/courses";

const PREFIXES: Record<Course, string> = { en: "english", fr: "french", es: "spanish" };

const course = (process.argv[2] ?? "en") as Course;
if (!(course in PREFIXES)) {
  console.error(`Unknown course "${course}" -- expected en, fr, or es.`);
  process.exit(1);
}
const prefix = PREFIXES[course];

const outDir = path.resolve(import.meta.dirname, "../.audit");
fs.mkdirSync(outDir, { recursive: true });

const dump = buildCourseDump(course);
for (const [level, questions] of Object.entries(dump.byLevel)) {
  const out = path.join(outDir, `${prefix}-${level}.json`);
  fs.writeFileSync(out, JSON.stringify(questions, null, 2));
  console.log(`Wrote ${out} (${questions.length} questions)`);
}
const placementOut = path.join(outDir, `${prefix}-placement.json`);
fs.writeFileSync(placementOut, JSON.stringify(dump.placement, null, 2));
console.log(`Wrote ${placementOut} (${dump.placement.length} questions)`);
console.log(`Totals: ${dump.totals.curriculum} curriculum, ${dump.totals.placement} placement`);
