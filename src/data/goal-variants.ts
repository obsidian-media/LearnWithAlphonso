// Goal-flavoured question variants (see src/lib/goal-variants.ts for the rules). The records are data:
// src/data/goal-variants/{en,fr,es}.json, keyed lessonId -> questionId -> goal -> variant. Same pattern as
// lesson-extras.ts: a side file laid over the built curriculum, so the lessons themselves never change.
import type { Unit } from "./curriculum";
import type { Course } from "./course-meta";
import { addGoalVariants, type GoalVariantFile } from "../lib/goal-variants";
import en from "./goal-variants/en.json" with { type: "json" };
import fr from "./goal-variants/fr.json" with { type: "json" };
import es from "./goal-variants/es.json" with { type: "json" };

export const GOAL_VARIANTS: Record<Course, GoalVariantFile> = {
  en: en as GoalVariantFile,
  fr: fr as GoalVariantFile,
  es: es as GoalVariantFile,
};

/** Lays the course's variants over its units. A course with none returns its units untouched. */
export function applyGoalVariants(units: Unit[], course: Course): Unit[] {
  return addGoalVariants(units, GOAL_VARIANTS[course]);
}
