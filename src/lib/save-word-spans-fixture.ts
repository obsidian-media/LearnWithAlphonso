import { curriculumEs } from "../data/curriculum-es";
import { curriculumFr } from "../data/curriculum-fr";
import type { Unit } from "../data/curriculum";
import { courseLanguageSpans, splitExplanation } from "./course-language-spans";

/**
 * The exact course-language spans and their positions for every French and Spanish question that has
 * any, as the web implementation produces them. The iOS Kit test asserts its own implementation
 * against a byte-identical copy of this file, so the two cannot drift. A piece is [text, 1] when it is
 * tappable course-language text and [text, 0] when it is plain; the word before an arrow is always 0.
 *
 * Regenerate with `bun scripts/export-save-word-fixtures.ts` (a test fails when this is stale).
 */
export type SaveWordSpansFixture = Record<
  "fr" | "es",
  Record<string, { spans: string[]; pieces: [string, 0 | 1][] }>
>;

function forCourse(curriculum: Unit[]): SaveWordSpansFixture["fr"] {
  const out: SaveWordSpansFixture["fr"] = {};
  for (const unit of curriculum)
    for (const lesson of unit.lessons)
      for (const q of lesson.questions) {
        const spans = courseLanguageSpans(q);
        if (spans.length === 0) continue;
        out[`${lesson.id}:${q.id}`] = {
          spans,
          pieces: splitExplanation(q.explanation, spans).map((p): [string, 0 | 1] => [
            p.text,
            p.course ? 1 : 0,
          ]),
        };
      }
  return out;
}

export function buildSaveWordSpansFixture(): SaveWordSpansFixture {
  return { fr: forCourse(curriculumFr), es: forCourse(curriculumEs) };
}

export const SAVE_WORD_SPANS_FIXTURE_JSON = () =>
  JSON.stringify(buildSaveWordSpansFixture()) + "\n";
