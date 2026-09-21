import type { Level } from "./levels";
import type { Lesson, Question, Unit } from "./curriculum";
import { generatedUnitsEs } from "./lesson-bank-es";

export const curriculumEs: Unit[] = generatedUnitsEs();

export type QuestionRef = { lessonId: string; unitId: string; level: Level; question: Question };

export const questionIndexEs: Record<string, QuestionRef> = (() => {
  const map: Record<string, QuestionRef> = {};
  for (const unit of curriculumEs)
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

export function lookupQuestionEs(key: string): QuestionRef | null {
  return questionIndexEs[key] ?? null;
}

export function unitsForLevelEs(level: Level): Unit[] {
  return curriculumEs.filter((u) => u.level === level);
}

export function findLessonEs(id: string): { unit: Unit; lesson: Lesson; index: number } | null {
  for (const unit of curriculumEs) {
    const idx = unit.lessons.findIndex((l) => l.id === id);
    if (idx >= 0) return { unit, lesson: unit.lessons[idx], index: idx };
  }
  return null;
}

export const allLessonIdsEs = curriculumEs.flatMap((u) => u.lessons.map((l) => l.id));
