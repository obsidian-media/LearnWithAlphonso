import type { Level } from "./levels";
import type { Lesson, Question, Unit } from "./curriculum";
import { generatedUnitsFr } from "./lesson-bank-fr";

export const curriculumFr: Unit[] = generatedUnitsFr();

export type QuestionRef = { lessonId: string; unitId: string; level: Level; question: Question };

export const questionIndexFr: Record<string, QuestionRef> = (() => {
  const map: Record<string, QuestionRef> = {};
  for (const unit of curriculumFr)
    for (const lesson of unit.lessons)
      for (const question of lesson.questions)
        map[`${lesson.id}:${question.id}`] = {
          lessonId: lesson.id,
          unitId: unit.id,
          level: unit.level,
          question,
        };
  return map;
})();

export function lookupQuestionFr(key: string): QuestionRef | null {
  return questionIndexFr[key] ?? null;
}

export function unitsForLevelFr(level: Level): Unit[] {
  return curriculumFr.filter((u) => u.level === level);
}

export function findLessonFr(id: string): { unit: Unit; lesson: Lesson; index: number } | null {
  for (const unit of curriculumFr) {
    const idx = unit.lessons.findIndex((l) => l.id === id);
    if (idx >= 0) return { unit, lesson: unit.lessons[idx], index: idx };
  }
  return null;
}

export const allLessonIdsFr = curriculumFr.flatMap((u) => u.lessons.map((l) => l.id));
