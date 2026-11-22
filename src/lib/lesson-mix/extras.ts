// The lesson-mix content pass (docs/CONTENT-PLAYBOOK.md, "The lesson mix"): listening, speak and
// translate questions APPENDED to lessons that lack them. Append-only: existing ids, order and
// answers never move (learners' review history is keyed on ids; src/lib/id-parity.test.ts).
//
// Data lives in src/data/lesson-extras/{en,fr,es}.json, keyed by lesson id, one optional record per
// question type. The ids the new questions get are fixed by type ("lx1", "sx1", "tx1"), so a record is
// stable under re-generation, and they match the server's /^[a-z0-9]+$/ question-id rule.
// Pure: no network, no file access.

import { hash } from "../../data/bank-engine";
import type { Lesson, Question, Unit } from "../../data/curriculum";

export const EXTRA_TYPES = ["listening", "speak", "translate"] as const;
export type ExtraType = (typeof EXTRA_TYPES)[number];

/** The id each extra question gets inside its lesson. Unique per lesson; never reused. */
export const EXTRA_IDS: Record<ExtraType, string> = {
  listening: "lx1",
  speak: "sx1",
  translate: "tx1",
};

export type ListeningExtra = {
  /** What the learner must decide after hearing the audio. Never restates it. */
  prompt: string;
  /** The sentence the device voice reads. */
  audioText: string;
  /** Three wrong sentences, each a close variant of audioText. The answer is audioText itself. */
  wrong: string[];
  explanation: string;
};
export type SpeakExtra = { answer: string; explanation: string };
export type TranslateExtra = { prompt: string; acceptableAnswers: string[]; explanation: string };

export type LessonExtra = {
  listening?: ListeningExtra;
  speak?: SpeakExtra;
  translate?: TranslateExtra;
};
export type LessonExtras = Record<string, LessonExtra>;

export const SPEAK_PROMPT = "Say this aloud:";

/** Deterministic order of the four listening choices (the answer must not always sit first). */
function shuffleChoices(lessonId: string, answer: string, wrong: string[]): string[] {
  return [answer, ...wrong].sort(
    (a, b) => (hash(`${lessonId}:${a}`) >>> 0) - (hash(`${lessonId}:${b}`) >>> 0),
  );
}

/** The Question a record becomes. The one place a record turns into a learner-facing question. */
export function toQuestion(lessonId: string, type: ExtraType, extra: LessonExtra): Question | null {
  if (type === "listening" && extra.listening) {
    const l = extra.listening;
    return {
      id: EXTRA_IDS.listening,
      type: "listening",
      prompt: l.prompt,
      audioText: l.audioText,
      choices: shuffleChoices(lessonId, l.audioText, l.wrong),
      answer: l.audioText,
      explanation: l.explanation,
    };
  }
  if (type === "speak" && extra.speak)
    return {
      id: EXTRA_IDS.speak,
      type: "speak",
      prompt: SPEAK_PROMPT,
      answer: extra.speak.answer,
      explanation: extra.speak.explanation,
    };
  if (type === "translate" && extra.translate)
    return {
      id: EXTRA_IDS.translate,
      type: "translate",
      prompt: extra.translate.prompt,
      acceptableAnswers: extra.translate.acceptableAnswers,
      explanation: extra.translate.explanation,
    };
  return null;
}

/** The questions a lesson's record appends, in the fixed order: listening, speak, translate. */
export function extraQuestions(lessonId: string, extra: LessonExtra): Question[] {
  return EXTRA_TYPES.map((t) => toQuestion(lessonId, t, extra)).filter(
    (q): q is Question => q !== null,
  );
}

/**
 * Appends every record's questions to its lesson. A record for a lesson that does not exist, or one
 * that would reuse an id the lesson already has, throws: a silent skip would hide a typo.
 */
/** The server (complete-lesson, sync) rejects a lesson of more than this many questions. */
export const MAX_QUESTIONS_PER_LESSON = 50;

export function addLessonExtras(units: Unit[], extras: LessonExtras): Unit[] {
  const wanted = new Set(Object.keys(extras));
  if (!wanted.size) return units;
  const out = units.map((unit) => ({
    ...unit,
    lessons: unit.lessons.map((lesson): Lesson => {
      const extra = extras[lesson.id];
      if (!extra) return lesson;
      wanted.delete(lesson.id);
      const add = extraQuestions(lesson.id, extra);
      const have = new Set(lesson.questions.map((q) => q.id));
      for (const q of add)
        if (have.has(q.id)) throw new Error(`lesson ${lesson.id} already has a question ${q.id}`);
      if (lesson.questions.length + add.length > MAX_QUESTIONS_PER_LESSON)
        throw new Error(
          `lesson ${lesson.id} would have ${lesson.questions.length + add.length} questions (the server accepts at most ${MAX_QUESTIONS_PER_LESSON})`,
        );
      return add.length ? { ...lesson, questions: [...lesson.questions, ...add] } : lesson;
    }),
  }));
  if (wanted.size)
    throw new Error(`lesson-extras name lessons that do not exist: ${[...wanted].join(", ")}`);
  return out;
}

/** Which extra types a lesson still needs, by the alternate-lesson speaking rule (plan, Option A). */
export type LessonNeed = ExtraType[];

/** A lesson is eligible unless it is a dedicated listening, speak or translate pack (no mc or fill). */
export function isEligible(lesson: Lesson): boolean {
  return lesson.questions.some((q) => q.type === "mc" || q.type === "fill");
}

/**
 * Listening and translate: every eligible lesson that lacks one. Speak: "Every other lesson" (owner,
 * 2026-11-21), so `speakSlot` is true on every second ELIGIBLE lesson of the course (see courseNeeds).
 */
export function lessonNeed(lesson: Lesson, speakSlot: boolean): LessonNeed {
  if (!isEligible(lesson)) return [];
  const has = (t: string) => lesson.questions.some((q) => q.type === t);
  const need: LessonNeed = [];
  if (!has("listening")) need.push("listening");
  if (speakSlot && !has("speak")) need.push("speak");
  if (!has("translate")) need.push("translate");
  return need;
}

/**
 * What every lesson of a course needs. Speak alternates along the course's eligible lessons in
 * curriculum order (1st, 3rd, 5th ... eligible lesson), so exactly half of them, rounded up, get a
 * speak question however the units are sized.
 */
export function courseNeeds(units: Unit[]): Map<string, LessonNeed> {
  const out = new Map<string, LessonNeed>();
  let ordinal = 0;
  for (const u of units)
    for (const l of u.lessons) {
      if (!isEligible(l)) continue;
      out.set(l.id, lessonNeed(l, ordinal % 2 === 0));
      ordinal++;
    }
  return out;
}
