/**
 * Writes the committed id baseline the phase 1 audit is checked against.
 * Run ONCE before any content edits; never re-run to "fix" a failing
 * parity check -- a failure means real users' review items would be
 * repointed (see the design doc's id-stability constraint).
 *
 * Usage: bun run scripts/snapshot-english-ids.ts [course]
 * `course` is "en" (default), "fr", or "es". Kept as "english-ids.json" for
 * English's filename specifically so the existing committed baseline stays
 * valid (see docs/superpowers/specs/2026-09-24-french-content-audit-design.md
 * section 9).
 */
import fs from "node:fs";
import path from "node:path";
import { collectCourseIds } from "../src/lib/id-parity";
import type { Course } from "../src/data/courses";

const BASELINE_FILENAMES: Record<Course, string> = {
  en: "english-ids.json",
  fr: "french-ids.json",
  es: "spanish-ids.json",
};

const course = (process.argv[2] ?? "en") as Course;
if (!(course in BASELINE_FILENAMES)) {
  console.error(`Unknown course "${course}" -- expected en, fr, or es.`);
  process.exit(1);
}

const outDir = path.resolve(import.meta.dirname, "../.audit-baseline");
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, BASELINE_FILENAMES[course]);
const ids = collectCourseIds(course);
fs.writeFileSync(out, JSON.stringify(ids, null, 2));
console.log(`Wrote ${out} (${ids.length} ids)`);
