/** The wire shape both clients render (GeneratedPracticeQuestion on iOS). */
export type PracticeQuestion = { prompt: string; choices: string[]; answerIndex: number; explanation: string };

export const MIN_DISTINCT_CHOICES = 3;

/**
 * The model sometimes repeats a choice ("go", "Go"). Both clients keyed rows by the choice text, so a
 * duplicate collided and two rows lit up on tap. Duplicates are removed here (trimmed, case-insensitive, first
 * kept), the answer index is remapped to the surviving copy, and a question left with fewer than 3 distinct
 * choices is dropped rather than shown as a two-option guess.
 */
export function normalizePracticeQuestion(q: PracticeQuestion): PracticeQuestion | null {
  if (!Number.isInteger(q.answerIndex) || q.answerIndex < 0 || q.answerIndex >= q.choices.length) return null;
  if (q.choices.some((c) => c.trim() === "")) return null;
  const answerKey = q.choices[q.answerIndex].trim().toLowerCase();
  const seen = new Set<string>();
  const choices: string[] = [];
  for (const c of q.choices) {
    const key = c.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    choices.push(c.trim() === c ? c : c.trim());
  }
  if (choices.length < MIN_DISTINCT_CHOICES) return null;
  const answerIndex = choices.findIndex((c) => c.trim().toLowerCase() === answerKey);
  return { ...q, choices, answerIndex };
}
