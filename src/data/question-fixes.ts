import type { Question, Unit } from "./curriculum";
import { FIXES_A1A2 } from "./question-fixes-a1a2";

/**
 * Hand-reviewed rewrites of single questions, applied on top of the built
 * curriculum. Keyed `lessonId/questionId`.
 *
 * Why an overlay and not an edit of the pack lines: the English bank draws wrong
 * answers from a pack's other lines, which cannot express "this wrong answer is a
 * learner error, not a neighbour". A fix replaces the wrong options in order and
 * optionally rewrites the prompt (usually to add a context clue), and it can never
 * change what a saved answer refers to: question ids, the answer text and, for
 * multiple choice, the answer index all stay as they were.
 */
export type QuestionFix = {
  /** New prompt, usually the old one plus a clue. Must keep the blank if the old one had it. */
  prompt?: string;
  /** Replacement wrong options, in order. Exactly as many as the question has now. */
  wrong?: string[];
  /** One line for the review table: what was wrong with the old question. */
  why: string;
};

export const QUESTION_FIXES: Record<string, QuestionFix> = { ...FIXES_A1A2 };

function fixQuestion(key: string, q: Question, fix: QuestionFix): Question {
  if (q.type !== "mc" && q.type !== "fill") throw new Error(`${key}: only mc/fill can be fixed`);
  const prompt = fix.prompt ?? q.prompt;
  if (q.prompt.includes("___") && !prompt.includes("___"))
    throw new Error(`${key}: prompt lost its blank`);
  if (!fix.wrong) return { ...q, prompt };
  const answerText = q.type === "mc" ? q.choices[q.answer]! : q.answer;
  const options = q.type === "mc" ? q.choices : q.bank;
  const slots = options.filter((o) => o !== answerText).length;
  if (fix.wrong.length !== slots)
    throw new Error(`${key}: needs ${slots} wrong options, got ${fix.wrong.length}`);
  if (fix.wrong.some((w) => w === answerText))
    throw new Error(`${key}: a wrong option repeats the answer`);
  const lower = fix.wrong.map((w) => w.toLowerCase());
  if (new Set(lower).size !== lower.length) throw new Error(`${key}: duplicate wrong options`);
  let next = 0;
  const replaced = options.map((o) => (o === answerText ? o : fix.wrong![next++]!));
  return q.type === "mc" ? { ...q, prompt, choices: replaced } : { ...q, prompt, bank: replaced };
}

export function applyQuestionFixes(
  units: Unit[],
  fixes: Record<string, QuestionFix> = QUESTION_FIXES,
): Unit[] {
  const pending = new Set(Object.keys(fixes));
  const out = units.map((unit) => ({
    ...unit,
    lessons: unit.lessons.map((lesson) => ({
      ...lesson,
      questions: lesson.questions.map((q) => {
        const key = `${lesson.id}/${q.id}`;
        const fix = fixes[key];
        if (!fix) return q;
        pending.delete(key);
        return fixQuestion(key, q, fix);
      }),
    })),
  }));
  if (pending.size) throw new Error(`no question for fix: ${[...pending].join(", ")}`);
  return out;
}
