import type { Unit } from "./curriculum";
import type { PlacementQuestion } from "./placement";
import EN from "./review-fixes/en.json";
import ES from "./review-fixes/es.json";
import FR from "./review-fixes/fr.json";

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
 * checks. An entry that matches nothing throws, so a stale fix cannot sit here silently.
 */
export type ReviewFix = {
  patch: Record<string, string | string[]>;
  reason: string;
  keyChange?: boolean;
};
export type ReviewFixes = Record<string, ReviewFix>;
type Course = "en" | "fr" | "es";

export const REVIEW_FIXES: Record<Course, ReviewFixes> = {
  en: EN as ReviewFixes,
  fr: FR as ReviewFixes,
  es: ES as ReviewFixes,
};

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
            // A card comes from the FIRST question with its term (vocab.ts skips later repeats).
            const term = termOf(q);
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
  if (unused.length)
    throw new Error(`review fixes match nothing: ${unused.slice(0, 5).join(", ")}`);
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
  if (pending.size)
    throw new Error(`placement review fixes match nothing: ${[...pending].slice(0, 5).join(", ")}`);
  return out;
}
