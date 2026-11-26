// Goal-flavoured lessons. A question may carry `goalVariants`: the same question (same id, type, skill, grammar point
// and answer shape) written for a learner's goal, e.g. a travel version of a cloze about "at". Lesson ids, question ids,
// question counts and order never change, so progress, reviews and old app builds are untouched: a build that does not
// know the field simply shows the base question.
//
// Three rules live here, all pure:
//   resolveForGoal      what the player shows for a goal (the base question when there is no variant);
//   variantsOf          every question a grader should also accept an answer for (the base and each variant);
//   variantProblems     the data rules (shape, and no answer that is right in one version and wrong in another).
//
// Grading accepts a match against the canonical question OR the one version the client says it showed (`variantGoal`;
// srs.ts and supabase/functions/_shared/answer-correctness.ts, kept in step), never another goal's: a different meaning
// is not right. For mc and fill the disjointness rule below keeps a wrong choice of the version on screen from being
// the right answer of the base.
// Import-free of runtime code on purpose (srs.ts, the review route and the practice fallback all load it).

import type { GoalVariantBody, Question, Unit } from "../data/curriculum";
import type { Goal } from "./learner-profile";

/** The goals a variant may be written for (learner-profile.ts GOALS; a test keeps the two in step). */
export const VARIANT_GOALS: readonly Goal[] = ["travel", "work", "school", "family", "exam", "fun"];

/** The fields a variant may override, by question type. `answer` and its options always travel together. */
export const VARIANT_FIELDS: Record<Question["type"], readonly (keyof GoalVariantBody)[]> = {
  mc: ["prompt", "choices", "answer", "explanation"],
  fill: ["prompt", "bank", "answer", "explanation"],
  listening: ["prompt", "audioText", "choices", "answer", "explanation"],
  speak: ["prompt", "answer", "explanation"],
  translate: ["prompt", "acceptableAnswers", "explanation"],
  reorder: [],
};

/** Fields describing the BASE answer's vocab card; a variant with a different answer must not keep them. */
const CARD_FIELDS = ["term", "meaning", "example", "imageKey"] as const;

/** The question with a variant's fields laid over it. The variants stay on it so grading still sees them. */
export function applyVariantBody(q: Question, body: GoalVariantBody): Question {
  const allowed = VARIANT_FIELDS[q.type];
  const next: Record<string, unknown> = { ...q };
  for (const key of allowed) {
    const value = body[key];
    if (value !== undefined) next[key] = value;
  }
  if ((q.type === "mc" || q.type === "fill") && answerText(next as Question) !== answerText(q))
    for (const f of CARD_FIELDS) delete next[f];
  return next as Question;
}

/** What the player shows a learner with this goal: the variant when the question has one, else the question itself. */
export function resolveForGoal(q: Question, goal: Goal | null | undefined): Question {
  const body = goal ? q.goalVariants?.[goal] : undefined;
  return body ? applyVariantBody(q, body) : q;
}

/** Whether any question in the lesson has a variant for this goal (the "For your goal" tag). */
export function lessonHasGoalVariant(
  lesson: { questions: Question[] },
  goal: Goal | null | undefined,
): boolean {
  return !!goal && lesson.questions.some((q) => !!q.goalVariants?.[goal]);
}

/**
 * The version a learner was shown, named by the goal the client sends with its answer (`variantGoal`; null or absent
 * for the base question, which is all a build that predates variants ever shows). Null when the question has no
 * variant for that goal. Grading accepts the base question and THIS version only, never another goal's sentence: a
 * different meaning must not be marked right.
 */
export function shownVariant(q: Question, variantGoal: string | null | undefined): Question | null {
  const body = variantGoal ? q.goalVariants?.[variantGoal as Goal] : undefined;
  return body ? applyVariantBody(q, body) : null;
}

/** The accepted translation wordings of the base and the shown version, in that order, without repeats. */
export function allAcceptableAnswers(q: Question, variantGoal?: string | null): string[] {
  if (q.type !== "translate") return [];
  const out = [...q.acceptableAnswers];
  const v = shownVariant(q, variantGoal);
  if (v && v.type === "translate")
    for (const a of v.acceptableAnswers) if (!out.includes(a)) out.push(a);
  return out;
}

// ---- The data rules ---------------------------------------------------------------------------------

const norm = (s: string): string =>
  s
    .normalize("NFC")
    .replace(/[‘’‚‛ʼʹ′´`＇]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

function answerText(q: Question): string | null {
  if (q.type === "mc") return q.choices[q.answer] ?? null;
  if (q.type === "fill" || q.type === "listening" || q.type === "speak") return q.answer;
  return null;
}

/** The choices that are wrong for this version (empty for speak and translate, which have none). */
function wrongTexts(q: Question): string[] {
  const right = answerText(q);
  if (q.type === "mc" || q.type === "listening")
    return q.choices.filter((c) => norm(c) !== norm(right ?? ""));
  if (q.type === "fill") return q.bank.filter((c) => norm(c) !== norm(right ?? ""));
  return [];
}

const isStr = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const isStrList = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);

/** The shape rules: a variant must be a complete, well-formed version of ITS question's type. */
export function variantShapeProblems(q: Question, body: GoalVariantBody): string[] {
  const allowed = VARIANT_FIELDS[q.type];
  if (!allowed.length) return [`a ${q.type} question cannot have variants`];
  const out: string[] = [];
  for (const key of Object.keys(body))
    if (!(allowed as readonly string[]).includes(key))
      out.push(`"${key}" is not a field a ${q.type} variant may set`);
  if (!isStr(body.prompt)) out.push("a variant needs its own prompt");
  if (!isStr(body.explanation)) out.push("a variant needs its own explanation");
  if (q.type === "mc") {
    const { choices, answer } = body;
    if (!isStrList(choices) || choices.length !== q.choices.length)
      out.push(`mc choices must be ${q.choices.length} non-empty strings`);
    else if (new Set(choices.map(norm)).size !== choices.length)
      out.push("two choices are the same");
    if (
      typeof answer !== "number" ||
      !Number.isInteger(answer) ||
      !isStrList(choices) ||
      answer < 0 ||
      answer >= choices.length
    )
      out.push("mc answer must be an index into the variant's choices");
  } else if (q.type === "fill") {
    const { bank, answer } = body;
    if (!isStrList(bank) || bank.length !== q.bank.length)
      out.push(`fill bank must be ${q.bank.length} non-empty strings`);
    else if (new Set(bank.map(norm)).size !== bank.length) out.push("two bank words are the same");
    if (!isStr(answer) || !isStrList(bank) || !bank.some((b) => norm(b) === norm(answer)))
      out.push("fill answer must be one of the variant's bank words");
    if (isStr(body.prompt) && !body.prompt.includes("___"))
      out.push("a fill prompt needs a ___ blank");
  } else if (q.type === "listening") {
    const { choices, answer, audioText } = body;
    if (!isStr(audioText)) out.push("a listening variant needs audioText");
    if (!isStrList(choices) || choices.length !== q.choices.length)
      out.push(`listening choices must be ${q.choices.length} non-empty strings`);
    else if (new Set(choices.map(norm)).size !== choices.length)
      out.push("two choices are the same");
    if (!isStr(answer) || !isStrList(choices) || !choices.some((c) => c === answer))
      out.push("listening answer must be the exact text of one choice");
    if (isStr(answer) && isStr(audioText) && norm(answer) !== norm(audioText))
      out.push("a listening variant's answer is its audioText");
  } else if (q.type === "speak") {
    if (!isStr(body.answer)) out.push("a speak variant needs an answer phrase");
  } else if (q.type === "translate") {
    if (!isStrList(body.acceptableAnswers) || body.acceptableAnswers.length === 0)
      out.push("a translate variant needs acceptableAnswers");
  }
  return out;
}

/**
 * The disjointness rule, over the base and every variant of one question: no text may be the RIGHT answer of one
 * version and a WRONG choice of another. Grading accepts the base and the shown version, so a text that is wrong
 * where the learner saw it but right in the other would be marked correct on a miss.
 */
export function variantSetProblems(q: Question): string[] {
  const versions: { label: string; q: Question }[] = [{ label: "the base question", q }];
  for (const [goal, body] of Object.entries(q.goalVariants ?? {}))
    if (body) versions.push({ label: `the ${goal} variant`, q: applyVariantBody(q, body) });
  const out: string[] = [];
  for (const a of versions)
    for (const b of versions) {
      if (a === b) continue;
      const right = answerText(a.q);
      if (right === null) continue;
      if (wrongTexts(b.q).some((w) => norm(w) === norm(right)))
        out.push(`"${right}" is the right answer of ${a.label} but a wrong choice of ${b.label}`);
    }
  return out;
}

/** Shape and disjointness for one question's variants; empty means the data is sound. */
export function variantProblems(q: Question): string[] {
  const out: string[] = [];
  for (const [goal, body] of Object.entries(q.goalVariants ?? {})) {
    if (!VARIANT_GOALS.includes(goal as Goal)) out.push(`"${goal}" is not a goal`);
    else if (body) for (const p of variantShapeProblems(q, body)) out.push(`${goal}: ${p}`);
  }
  if (!out.length) out.push(...variantSetProblems(q));
  return out;
}

/** The side file's shape: lesson id -> question id -> goal -> variant. */
export type GoalVariantFile = Record<
  string,
  Record<string, Partial<Record<Goal, GoalVariantBody>>>
>;

/**
 * Lays a course's side file onto its units as each question's `goalVariants`. Like applyLessonExtras it throws on a
 * record for a lesson or question that does not exist (a silent skip would hide a typo), and it also throws on any
 * shape or disjointness problem, so unsound variant content can never reach a learner. Nothing is added to
 * a question the file does not name, and a course with no file returns its units untouched.
 */
export function addGoalVariants(units: Unit[], file: GoalVariantFile): Unit[] {
  const wanted = new Set(Object.keys(file));
  if (!wanted.size) return units;
  const out = units.map((unit) => ({
    ...unit,
    lessons: unit.lessons.map((lesson) => {
      const forLesson = file[lesson.id];
      if (!forLesson) return lesson;
      wanted.delete(lesson.id);
      const left = new Set(Object.keys(forLesson));
      const questions = lesson.questions.map((q) => {
        const variants = forLesson[q.id];
        if (!variants) return q;
        left.delete(q.id);
        const next: Question = { ...q, goalVariants: variants };
        const problems = variantProblems(next);
        if (problems.length)
          throw new Error(`goal variants for ${lesson.id}:${q.id}: ${problems.join("; ")}`);
        return next;
      });
      if (left.size)
        throw new Error(
          `goal variants name questions that do not exist in ${lesson.id}: ${[...left].join(", ")}`,
        );
      return { ...lesson, questions };
    }),
  }));
  if (wanted.size)
    throw new Error(`goal variants name lessons that do not exist: ${[...wanted].join(", ")}`);
  return out;
}
