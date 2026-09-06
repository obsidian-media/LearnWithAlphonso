import { curriculum, type Lesson, type Question } from "./curriculum";

export type VocabItem = {
  /** The word, phrase or form to learn. */
  term: string;
  /** Short explanation of what it means / why it's used. */
  meaning: string;
  /** A model sentence showing the term in use. */
  example: string;
};

function answerOf(q: Question): string {
  return q.type === "mc" ? (q.choices[q.answer] ?? "") : q.answer;
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
    items.push({ term, meaning: q.explanation, example: exampleOf(q) });
  }
  return items;
}

const cache: Record<string, VocabItem[]> = (() => {
  const map: Record<string, VocabItem[]> = {};
  for (const unit of curriculum)
    for (const lesson of unit.lessons) map[lesson.id] = deriveVocab(lesson);
  return map;
})();

/** Every lesson in the curriculum has a vocabulary module. */
export function vocabForLesson(lessonId: string): VocabItem[] {
  return cache[lessonId] ?? [];
}
