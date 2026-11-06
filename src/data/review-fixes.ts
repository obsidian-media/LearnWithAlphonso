import type { Unit } from "./curriculum";
import type { PlacementQuestion } from "./placement";
import EN from "./review-fixes/en.json" with { type: "json" };
import ES from "./review-fixes/es.json" with { type: "json" };
import FR from "./review-fixes/fr.json" with { type: "json" };

/**
 * Fixes from the full content review (docs/CONTENT-PLAYBOOK.md, section 9), applied on top of the
 * built content. Keyed by the review's item ids (src/lib/content-review/inventory.ts):
 *
 *   "<course>:question:<lessonId>/<questionId>"  -> fields of that question
 *   "<course>:card:<lessonId>/<term>"            -> meaning/example of the question the card comes from
 *   "<course>:lesson-meta:<lessonId>"            -> title/subtitle
 *   "<course>:unit-meta:<unitId>"                -> title/description
 *   "<course>:placement:<id>"                    -> fields of that placement question
 *
 * Every entry was checked by src/lib/content-review/fixes.ts before it was written here: ids, types,
 * option counts and the answer's position never change, and the answer only on a reviewed wrong-key
 * ruling. The files are written by `run.ts route`; do not hand-edit them without re-running the
 * checks. An entry that matches nothing is recorded in REVIEW_FIXES_UNMATCHED, which review-fixes.test.ts holds empty.
 */
export type ReviewFix = {
  patch: Record<string, string | string[] | number>;
  reason: string;
  keyChange?: boolean;
};
export type ReviewFixes = Record<string, ReviewFix>;
type Course = "en" | "fr" | "es";

/** Fixes the built content did not match (see applyReviewFixes). review-fixes.test.ts holds it empty. */
export const REVIEW_FIXES_UNMATCHED: string[] = [];

/**
 * LWA_REVIEW_OVERLAY=off builds the content without the overlay: the review pipeline checks and
 * routes fixes against the original content (scripts/content-review/run.ts). Never set in the app.
 */
const OVERLAY_OFF = typeof process !== "undefined" && process.env?.LWA_REVIEW_OVERLAY === "off";

export const REVIEW_FIXES: Record<Course, ReviewFixes> = OVERLAY_OFF
  ? { en: {}, fr: {}, es: {} }
  : { en: EN as ReviewFixes, fr: FR as ReviewFixes, es: ES as ReviewFixes };

const QUESTION_FIELDS = new Set([
  "prompt",
  "choices",
  "bank",
  "answer",
  "explanation",
  "acceptableAnswers",
  "audioText",
  "tokens",
  "meaning",
  "example",
]);

function patchOf(key: string, fix: ReviewFix, allowed: Set<string>) {
  for (const k of Object.keys(fix.patch))
    if (!allowed.has(k)) throw new Error(`review fix ${key}: field "${k}" cannot be patched here`);
  return fix.patch;
}

/** The card's term for a question, as vocab.ts derives it (authored term, else the answer text). */
function termOf(q: Unit["lessons"][number]["questions"][number]): string {
  if (q.type === "mc") return (q.term ?? q.choices[q.answer] ?? "").trim().toLowerCase();
  if (q.type === "fill") return (q.term ?? q.answer).trim().toLowerCase();
  return "";
}

export function applyReviewFixes(
  units: Unit[],
  course: Course,
  fixes: ReviewFixes = REVIEW_FIXES[course],
  /**
   * strict false: a fix that matches nothing is ignored (tests comparing partial content). By
   * default it is recorded in REVIEW_FIXES_UNMATCHED, which a test holds at zero: the app never
   * fails to load over a stale fix, and CI never lets one in.
   */
  opts: { strict?: boolean } = {},
): Unit[] {
  const keys = Object.keys(fixes);
  if (!keys.length) return units;
  const pending = new Set(keys);
  const take = (key: string) => {
    const f = fixes[key];
    if (f) pending.delete(key);
    return f;
  };
  const out = units.map((unit) => {
    const um = take(`${course}:unit-meta:${unit.id}`);
    const unitPatch = um
      ? patchOf(`${course}:unit-meta:${unit.id}`, um, new Set(["title", "description"]))
      : {};
    return {
      ...unit,
      ...(unitPatch as Partial<Unit>),
      lessons: unit.lessons.map((lesson) => {
        const lm = take(`${course}:lesson-meta:${lesson.id}`);
        const lessonPatch = lm
          ? patchOf(`${course}:lesson-meta:${lesson.id}`, lm, new Set(["title", "subtitle"]))
          : {};
        const cardTerms = new Set<string>();
        return {
          ...lesson,
          ...lessonPatch,
          questions: lesson.questions.map((q) => {
            let next = q;
            const qk = `${course}:question:${lesson.id}/${q.id}`;
            const qf = take(qk);
            if (qf) next = { ...next, ...patchOf(qk, qf, QUESTION_FIELDS) } as typeof q;
            // A card comes from the FIRST question with its term (vocab.ts skips later repeats), as
            // the question reads after its own fix (a key change gives the card a new term).
            const term = termOf(next);
            if (term && !cardTerms.has(term)) {
              cardTerms.add(term);
              const ck = `${course}:card:${lesson.id}/${term}`;
              const cf = take(ck);
              if (cf)
                next = { ...next, ...patchOf(ck, cf, new Set(["meaning", "example"])) } as typeof q;
            }
            return next;
          }),
        };
      }),
    };
  });
  const unused = [...pending].filter((k) => !k.includes(":placement:"));
  if (opts.strict !== false) REVIEW_FIXES_UNMATCHED.push(...unused);
  return out;
}

export function applyPlacementReviewFixes(
  questions: PlacementQuestion[],
  course: Course,
  fixes: ReviewFixes = REVIEW_FIXES[course],
): PlacementQuestion[] {
  const keys = Object.keys(fixes).filter((k) => k.includes(":placement:"));
  if (!keys.length) return questions;
  const pending = new Set(keys);
  const out = questions.map((q) => {
    const key = `${course}:placement:${q.id}`;
    const f = fixes[key];
    if (!f) return q;
    pending.delete(key);
    return {
      ...q,
      ...patchOf(
        key,
        f,
        new Set(["prompt", "choices", "answer", "acceptableAnswers", "audioText"]),
      ),
    } as PlacementQuestion;
  });
  REVIEW_FIXES_UNMATCHED.push(...pending);
  return out;
}

/**
 * A pack question as the learner gets it: with its review fix applied. Gates that read the banks
 * directly (romance-conjugation.test.ts, the review's own flags) use this so a fix counts. Pack
 * question ids are unique within a course, so the fix is found by its id suffix.
 */
export function withReviewFix<Q extends { id: string }>(course: Course, q: Q): Q {
  const fixes = REVIEW_FIXES[course];
  const index = (fixIndex[course] ??= new Map(
    Object.entries(fixes)
      .filter(([k]) => k.startsWith(`${course}:question:`))
      .map(([k, f]) => [k.slice(k.lastIndexOf("/") + 1), f]),
  ));
  const f = index.get(q.id);
  return f ? ({ ...q, ...f.patch } as Q) : q;
}
const fixIndex: Partial<Record<Course, Map<string, ReviewFix>>> = {};

/** One lesson question with its review fix applied (for tests that compare built lessons). */
export function patchQuestion<Q extends { id: string }>(course: Course, lessonId: string, q: Q): Q {
  const f = REVIEW_FIXES[course][`${course}:question:${lessonId}/${q.id}`];
  return f ? ({ ...q, ...f.patch } as Q) : q;
}
