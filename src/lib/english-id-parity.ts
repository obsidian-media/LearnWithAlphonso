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
