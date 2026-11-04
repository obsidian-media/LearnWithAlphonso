import type { Lesson, Question } from "./curriculum";
import { getCourse, type Course } from "./courses";
import { VOCAB_IMAGES, type VocabImage } from "./vocab-images";

export type VocabItem = {
  /** The word, phrase or form to learn. */
  term: string;
  /** Short explanation of what it means / why it's used. */
  meaning: string;
  /** A model sentence showing the term in use. */
  example: string;
  /** Self-hosted, reviewed photo illustrating the term, when one exists in VOCAB_IMAGES. */
  image?: VocabImage;
};

/** "reorder", "listening" and "speak" questions are about sentence structure,
 * comprehension and production, not a single vocabulary term -- their
 * (whole-sentence) answer would make a nonsense vocab card, so they contribute
 * nothing here (the empty-term guard in deriveVocab below skips them). A
 * listening or speaking lesson therefore has no vocabulary step and goes
 * straight from overview to quiz, which is deliberate rather than a gap. */
function answerOf(q: Question): string {
  if (q.type === "mc") return q.choices[q.answer] ?? "";
  if (q.type === "fill") return q.answer;
  return "";
}

/** Quiz instructions and pair-drill stems: filling their blank gives a label, not a sentence. */
const STEM =
  /^(choose|which|select|complete|fill|plural of|opposite of|past (simple )?of|female form|male form|comparative|superlative|what is|what does|match)\b/i;

/**
 * A model sentence for the card, or "" when there is none to show.
 *
 * Only a cloze sentence with the answer put back in the blank counts
 * ("She ___ happy." -> "She is happy."). A pair-drill stem ('Plural of "baby":
 * ___') or an instruction is not a sentence, and showing 'Plural of "baby": ___ ->
 * babies' as an "example" was the defect this replaces. Empty is honest; the
 * card hides an empty slot.
 */
function exampleOf(q: Question): string {
  if (q.type !== "mc" && q.type !== "fill") return "";
  const answer = answerOf(q);
  const blank = q.prompt.indexOf("___");
  if (blank < 0 || !answer || STEM.test(q.prompt.trim())) return "";
  if (/[:?…"“]$/.test(q.prompt.slice(0, blank).trim())) return "";
  // Tidy the join. Drop every bracket hint after the blank ("Je ___ (boire) ...",
  // "C'est mon livre (à moi).", "... six. (30 min)"), and the space the
  // data leaves between the blank and its punctuation ("taken ?"). French keeps its
  // own spaces before ? and ! elsewhere in the sentence; only the join is tidied.
  const after = q.prompt
    .slice(blank + 3)
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/^\s+(?=[?!.,;:])/, "");
  const sentence = q.prompt.slice(0, blank) + answer + after;
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

function titleCaseKey(s: string) {
  return s.trim().toLowerCase();
}

/**
 * Builds the vocabulary module for any lesson from its own questions.
 *
 * `meaning` is always "" today. The questions carry an explanation of why the
 * answer was right ("'am' is correct here. Match the verb form to the subject."),
 * never a gloss of the word, and printing that under the word as its meaning was
 * wrong. A real meaning needs authored data (see docs/content-audit-2026-11.md).
 */
export function deriveVocab(lesson: Lesson): VocabItem[] {
  return deriveVocabWithContext(lesson).map(({ context: _context, ...item }) => item);
}

/**
 * deriveVocab plus the quiz explanation each card came from, as `context`. The
 * context is for tooling only (the image pipeline uses it to disambiguate a
 * term); it is never shown to a learner.
 */
export function deriveVocabWithContext(lesson: Lesson): (VocabItem & { context: string })[] {
  const seen = new Set<string>();
  const items: (VocabItem & { context: string })[] = [];
  for (const q of lesson.questions) {
    const term = answerOf(q).trim();
    if (!term) continue;
    const key = titleCaseKey(term);
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      term,
      meaning: "",
      example: exampleOf(q),
      image: VOCAB_IMAGES[key],
      context: q.explanation,
    });
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
