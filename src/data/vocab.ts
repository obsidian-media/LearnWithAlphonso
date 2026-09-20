import type { Lesson, Question } from "./curriculum";
import { getCourse, type Course } from "./courses";
import { VOCAB_IMAGES } from "./vocab-images";

export type VocabItem = {
  /** The word, phrase or form to learn. */
  term: string;
  /** Short explanation of what it means / why it's used. */
  meaning: string;
  /** A model sentence showing the term in use. */
  example: string;
  /** Stock photo illustrating the term, when one exists in VOCAB_IMAGES. */
  image?: { url: string; alt: string; credit: string };
};

/** "reorder" questions are about sentence structure, not a single
 * vocabulary term -- their (whole-sentence) answer would make a nonsense
 * vocab card, so they contribute nothing here (the empty-term guard in
 * deriveVocab below skips them). */
function answerOf(q: Question): string {
  if (q.type === "mc") return q.choices[q.answer] ?? "";
  if (q.type === "fill") return q.answer;
  return "";
}

function exampleOf(q: Question): string {
  const answer = answerOf(q);
  if (q.type === "fill") {
    const filled = q.prompt.replace("___", answer);
    return filled === q.prompt ? `${q.prompt} ${answer}` : filled;
  }
  const prompt = q.prompt.replace(/[:：]\s*$/, "");
  return `${prompt} → ${answer}`;
}

function titleCaseKey(s: string) {
  return s.trim().toLowerCase();
}

/** Builds the vocabulary module for any lesson from its own questions. */
export function deriveVocab(lesson: Lesson): VocabItem[] {
  const seen = new Set<string>();
  const items: VocabItem[] = [];
  for (const q of lesson.questions) {
    const term = answerOf(q).trim();
    if (!term) continue;
    const key = titleCaseKey(term);
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ term, meaning: q.explanation, example: exampleOf(q), image: VOCAB_IMAGES[key] });
  }
  return items;
}

// Lazy, per-lesson memoization -- deriveVocab() only ever runs for a
// lesson that's actually been opened, not for the other 658+ lessons
// across both courses that a given page view never touches.
const cache = new Map<string, VocabItem[]>();

/** Every lesson in the curriculum has a vocabulary module. */
export function vocabForLesson(lessonId: string, course: Course): VocabItem[] {
  const cacheKey = `${course}:${lessonId}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;
  const found = getCourse(course).findLesson(lessonId);
  const items = found ? deriveVocab(found.lesson) : [];
  cache.set(cacheKey, items);
  return items;
}
