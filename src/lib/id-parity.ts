/**
 * Question-id stability checks for ALL THREE courses.
 *
 * Renamed from `english-id-parity.ts` on 2026-09-25: it grew a per-course bank
 * map and `collectCourseIds(course)` serves en/fr/es, so the prefix had become
 * misleading. Documents written before that date cite the old path and were
 * deliberately left alone -- a plan or audit report should keep saying what it
 * said at the time. This note is here so a search from one of them lands.
 *
 * Its siblings `english-content-dump.ts` and `scripts/snapshot-english-ids.ts`
 * are misnamed the same way and for the same reason (both take a `course`
 * argument); not renamed here to keep one content PR from turning into a
 * repo-wide path sweep.
 */
import { buildCourseDump } from "./english-content-dump";
import { BANK } from "@/data/lesson-bank";
import { BANK_FR } from "@/data/lesson-bank-fr";
import { BANK_ES } from "@/data/lesson-bank-es";
import type { Course } from "@/data/courses";

/**
 * Raw pack collections, keyed by course. English's own `Pack` type
 * (lesson-bank.ts) is a separate declaration from bank-engine.ts's `Pack`
 * (spec 2026-09-24-french-content-audit-design.md 2.2) -- both are
 * structurally `{id, data}[]`, which is all packLineStats() needs.
 */
const PACKS_BY_COURSE: Record<Course, Record<string, { id: string; data: string }[]>> = {
  en: BANK,
  fr: BANK_FR,
  es: BANK_ES,
};

export function collectCourseIds(course: Course = "en"): string[] {
  const dump = buildCourseDump(course);
  return Object.values(dump.byLevel)
    .flat()
    .map((q) => q.key)
    .sort();
}

export function diffIds(baseline: string[], current: string[]) {
  const b = new Set(baseline);
  const c = new Set(current);
  return {
    added: current.filter((id) => !b.has(id)).sort(),
    removed: baseline.filter((id) => !c.has(id)).sort(),
  };
}

export function packLineStats(
  course: Course = "en",
): Record<string, { lines: number; malformed: string[] }> {
  const out: Record<string, { lines: number; malformed: string[] }> = {};
  for (const pack of Object.values(PACKS_BY_COURSE[course]).flat()) {
    const lines = pack.data
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const malformed = lines.filter((l) => l.split("|").length !== 2);
    out[pack.id] = { lines: lines.length, malformed };
  }
  return out;
}
