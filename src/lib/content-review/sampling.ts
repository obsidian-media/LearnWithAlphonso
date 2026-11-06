// Who gets a second opinion, which items the final blind check reads, and how an error rate and
// its uncertainty are reported. Seeded and deterministic: the same seed draws the same items.

import { hash } from "../../data/bank-engine";
import type { Course } from "../../data/courses";
import type { ReviewItem } from "./inventory";
import type { Verdict } from "./review";

const bySeed = (seed: string) => (a: ReviewItem, b: ReviewItem) =>
  (hash(`${seed}:${a.id}`) >>> 0) - (hash(`${seed}:${b.id}`) >>> 0);

/** Proportional draw over strata (largest remainder), each stratum in seeded order. */
export function stratifiedDraw(
  items: ReviewItem[],
  n: number,
  seed: string,
  stratum: (it: ReviewItem) => string,
): ReviewItem[] {
  if (n >= items.length) return [...items];
  const groups = new Map<string, ReviewItem[]>();
  for (const it of items) groups.set(stratum(it), [...(groups.get(stratum(it)) ?? []), it]);
  const shares = [...groups.values()].map((g) => ({
    g: [...g].sort(bySeed(seed)),
    exact: (g.length / items.length) * n,
  }));
  const base = shares.map((s) => Math.floor(s.exact));
  let left = n - base.reduce((a, b) => a + b, 0);
  shares
    .map((s, i) => ({ i, r: s.exact - base[i]! }))
    .sort((a, b) => b.r - a.r || a.i - b.i)
    .forEach(({ i }) => {
      if (left > 0) {
        base[i]!++;
        left--;
      }
    });
  return shares.flatMap((s, i) => s.g.slice(0, base[i]));
}

/**
 * Deterministic flags that force a second opinion. The rewrite-class flags (generic explanation,
 * cloze-from-pool, drill-non-form) do not: those items are rewritten in phase 6 and re-reviewed in
 * phase 7, so judging their current text would pay twice for one fix.
 */
export const FORCE_SECOND_OPINION = new Set(["known-second-answer"]);

/**
 * Phase 4: every item Claude flagged or gave no verdict, every item with a forcing flag, plus
 * `rate` of the items Claude passed (stratified by course and kind) to measure how much Claude
 * misses.
 */
export function secondOpinionSet(
  items: ReviewItem[],
  claude: Map<string, Verdict>,
  rate: number,
  seed: string,
): { flagged: ReviewItem[]; control: ReviewItem[] } {
  if (!(rate >= 0 && rate <= 1)) throw new Error(`rate ${rate} is not between 0 and 1`);
  const flagged: ReviewItem[] = [];
  const passed: ReviewItem[] = [];
  for (const it of items) {
    const v = claude.get(it.id);
    if (!v || v.verdict === "defect" || it.flags?.some((f) => FORCE_SECOND_OPINION.has(f)))
      flagged.push(it);
    else passed.push(it);
  }
  const control = stratifiedDraw(
    passed,
    Math.round(passed.length * rate),
    seed,
    (it) => `${it.course}|${it.kind}`,
  );
  return { flagged, control };
}

/**
 * Phase 7: the blind sample. At least `perCourse` items per course, drawn across kinds in
 * proportion, from the content as it is AFTER the fixes. Its verdicts are the published error rate.
 */
export function blindSample(items: ReviewItem[], perCourse: number, seed: string): ReviewItem[] {
  const courses: Course[] = ["en", "fr", "es"];
  return courses.flatMap((c) =>
    stratifiedDraw(
      items.filter((it) => it.course === c),
      perCourse,
      `${seed}:${c}`,
      (it) => (it.kind === "question" ? `question|${it.subtype}` : it.kind),
    ),
  );
}

/** Wilson score interval, 95% by default: an honest range for a small-sample proportion. */
export function wilson(
  defects: number,
  n: number,
  z = 1.96,
): { rate: number; low: number; high: number } {
  if (n <= 0) return { rate: NaN, low: 0, high: 1 };
  const p = defects / n;
  const z2 = z * z;
  const centre = (p + z2 / (2 * n)) / (1 + z2 / n);
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n);
  return { rate: p, low: Math.max(0, centre - half), high: Math.min(1, centre + half) };
}

/**
 * Claude's estimated miss rate: of the control items Claude passed, the share the judge confirmed
 * as defects (a Mistral flag the judge rejected is not a miss). Extrapolated to every passed item.
 */
export function missEstimate(
  controlIds: string[],
  confirmedDefects: Set<string>,
  passedTotal: number,
) {
  const misses = controlIds.filter((id) => confirmedDefects.has(id)).length;
  const w = wilson(misses, controlIds.length);
  return {
    misses,
    sampled: controlIds.length,
    ...w,
    projectedMissed: Math.round(w.rate * passedTotal),
  };
}
