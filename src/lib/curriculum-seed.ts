import { COURSES, getCourse, type Course } from "@/data/courses";
import { LEVELS } from "@/data/levels";
import { SCENARIOS } from "@/data/scenarios";
import { VOCAB_IMAGES } from "@/data/vocab-images";
import type { Question } from "@/data/curriculum";

/**
 * Builds the row sets for the curriculum-data tables added in
 * supabase/migrations/20260918120000_curriculum_data_tables.sql, from the
 * existing static TS data files. Pure functions, so they're testable
 * without a database -- scripts/seed-curriculum-db.ts is a thin CLI
 * wrapper that upserts what these return. Same split as
 * ios-content-export.ts (pure builder + thin script).
 *
 * Row shapes match the migration's columns exactly, including the
 * mc/fill answer_index/answer_text split enforced there by the
 * question_shape_matches_type CHECK constraint.
 */

export type LevelRow = { id: string; name: string; blurb: string; sort_order: number };

export type UnitRow = {
  id: string;
  course: Course;
  level_id: string;
  eyebrow: string;
  title: string;
  description: string;
  sort_order: number;
};

export type LessonRow = {
  id: string;
  unit_id: string;
  title: string;
  subtitle: string;
  sort_order: number;
};

export type QuestionRow = {
  lesson_id: string;
  id: string;
  type: "mc" | "fill" | "reorder" | "listening" | "speak" | "translate";
  prompt: string;
  choices: string[] | null;
  bank: string[] | null;
  answer_index: number | null;
  answer_text: string | null;
  /**
   * NOTE: there is no audio_text column, so a question's spoken text is NOT
   * persisted by the seed -- a "listening" row arrives in the DB answerable
   * only by reading its choices. This is a pre-existing gap, not new with the
   * listening type: the three legacy `mc` questions carrying `audioText`
   * already lose it here. It is harmless today because both clients read
   * content from the bundled course (getCourse / the iOS JSON), never from
   * these tables. Closing it needs a migration adding the column, which is
   * deliberately out of scope for the listening type itself.
   */
  explanation: string;
  sort_order: number;
};

export type VocabImageRow = { term: string; url: string; alt: string; credit: string };

export type PlacementQuestionRow = {
  id: string;
  course: Course;
  level_id: string;
  prompt: string;
  type: "mc" | "listening" | "translate";
  choices: string[] | null;
  answer_index: number | null;
  answer_text: string | null;
  /** Translate only: the curated wordings, same as questions.bank. */
  bank: string[] | null;
  /** Listening only: what is spoken. The questions table has no equivalent
   *  column -- a known gap noted there -- but placement gets one, because a
   *  listening row with no audio text is unanswerable from the database. */
  audio_text: string | null;
};

export type ScenarioRow = {
  id: string;
  title: string;
  emoji: string;
  blurb: string;
  level: string;
  system_prompt: string;
  opener: string;
};

export function buildLevelRows(): LevelRow[] {
  return LEVELS.map((l, i) => ({ id: l.id, name: l.name, blurb: l.blurb, sort_order: i }));
}

export function buildUnitRows(course: Course): UnitRow[] {
  const { curriculum } = getCourse(course);
  return curriculum.map((u, i) => ({
    id: u.id,
    course,
    level_id: u.level,
    eyebrow: u.eyebrow,
    title: u.title,
    description: u.description,
    sort_order: i,
  }));
}

export function buildLessonRows(course: Course): LessonRow[] {
  const { curriculum } = getCourse(course);
  return curriculum.flatMap((u) =>
    u.lessons.map((l, i) => ({
      id: l.id,
      unit_id: u.id,
      title: l.title,
      subtitle: l.subtitle,
      sort_order: i,
    })),
  );
}

function questionRow(lessonId: string, q: Question, sortOrder: number): QuestionRow {
  const base = {
    lesson_id: lessonId,
    id: q.id,
    prompt: q.prompt,
    explanation: q.explanation,
    sort_order: sortOrder,
  };
  if (q.type === "mc") {
    return {
      ...base,
      type: "mc",
      choices: q.choices,
      bank: null,
      answer_index: q.answer,
      answer_text: null,
    };
  }
  if (q.type === "reorder") {
    return {
      ...base,
      type: "reorder",
      choices: null,
      bank: q.tokens,
      answer_index: null,
      answer_text: q.answer,
    };
  }
  if (q.type === "speak") {
    // A fourth row shape: answer_text alone. No options to choose between and
    // no word bank -- only the phrase the learner is expected to say.
    return {
      ...base,
      type: "speak",
      choices: null,
      bank: null,
      answer_index: null,
      answer_text: q.answer,
    };
  }
  if (q.type === "listening") {
    // Stored like an mc row (it has `choices`) but with answer_text rather
    // than answer_index, matching the variant's text answer.
    return {
      ...base,
      type: "listening",
      choices: q.choices,
      bank: null,
      answer_index: null,
      answer_text: q.answer,
    };
  }
  if (q.type === "translate") {
    // A fifth row shape, and deliberately built from columns that already
    // exist: the curated phrasings ride in `bank` (already a jsonb string[]
    // for fill/reorder) and the canonical one in `answer_text`. That means
    // grade-review's generic non-mc path still has something sane to compare
    // against even before its translate branch lands.
    return {
      ...base,
      type: "translate",
      choices: null,
      bank: q.acceptableAnswers,
      answer_index: null,
      answer_text: q.acceptableAnswers[0] ?? "",
    };
  }
  return {
    ...base,
    type: "fill",
    choices: null,
    bank: q.bank,
    answer_index: null,
    answer_text: q.answer,
  };
}

export function buildQuestionRows(course: Course): QuestionRow[] {
  const { curriculum } = getCourse(course);
  return curriculum.flatMap((u) =>
    u.lessons.flatMap((l) => l.questions.map((q, i) => questionRow(l.id, q, i))),
  );
}

/** VOCAB_IMAGES is global (not course-scoped), so this takes no course argument. */
export function buildVocabImageRows(): VocabImageRow[] {
  return Object.entries(VOCAB_IMAGES).map(([term, img]) => ({
    term,
    url: img.url,
    alt: img.alt,
    credit: img.credit,
  }));
}

export function buildPlacementQuestionRows(course: Course): PlacementQuestionRow[] {
  const { placementPool } = getCourse(course);
  return placementPool.map((p) => {
    const base = { id: p.id, course, level_id: p.level, prompt: p.prompt, type: p.type };
    // Mirrors the questions table's shapes: mc keeps choices + an index,
    // listening keeps choices but answers with text, translate carries its
    // wordings in `bank` with the canonical one in answer_text. See migration
    // 20260927010000, which widens the columns to allow it.
    if (p.type === "mc") {
      return {
        ...base,
        choices: p.choices,
        answer_index: p.answer,
        answer_text: null,
        bank: null,
        audio_text: null,
      };
    }
    if (p.type === "listening") {
      return {
        ...base,
        choices: p.choices,
        answer_index: null,
        answer_text: p.answer,
        bank: null,
        audio_text: p.audioText,
      };
    }
    return {
      ...base,
      choices: null,
      answer_index: null,
      answer_text: p.acceptableAnswers[0] ?? "",
      bank: p.acceptableAnswers,
      audio_text: null,
    };
  });
}

/** SCENARIOS is course-agnostic (no French variant exists today). */
export function buildScenarioRows(): ScenarioRow[] {
  return SCENARIOS.map((s) => ({
    id: s.id,
    title: s.title,
    emoji: s.emoji,
    blurb: s.blurb,
    level: s.level,
    system_prompt: s.systemPrompt,
    opener: s.opener,
  }));
}

export type CurriculumSeed = {
  levels: LevelRow[];
  units: UnitRow[];
  lessons: LessonRow[];
  questions: QuestionRow[];
  vocabImages: VocabImageRow[];
  placementQuestions: PlacementQuestionRow[];
  scenarios: ScenarioRow[];
};

/** All rows for every course, in FK-safe insert order. */
export function buildFullSeed(): CurriculumSeed {
  const courses = COURSES.map((c) => c.id);
  return {
    levels: buildLevelRows(),
    units: courses.flatMap(buildUnitRows),
    lessons: courses.flatMap(buildLessonRows),
    questions: courses.flatMap(buildQuestionRows),
    vocabImages: buildVocabImageRows(),
    placementQuestions: courses.flatMap(buildPlacementQuestionRows),
    scenarios: buildScenarioRows(),
  };
}
