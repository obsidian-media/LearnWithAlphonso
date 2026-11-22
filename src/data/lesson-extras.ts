// Listening, speak and translate questions appended to lessons that lack them (the lesson-mix
// content pass). The records are data: src/data/lesson-extras/{en,fr,es}.json. See
// src/lib/lesson-mix/extras.ts for the rules and docs/CONTENT-PLAYBOOK.md for the workflow.
import type { Unit } from "./curriculum";
import type { Course } from "./course-meta";
import { addLessonExtras, type LessonExtras } from "../lib/lesson-mix/extras";
import en from "./lesson-extras/en.json" with { type: "json" };
import fr from "./lesson-extras/fr.json" with { type: "json" };
import es from "./lesson-extras/es.json" with { type: "json" };

export const LESSON_EXTRAS: Record<Course, LessonExtras> = {
  en: en as LessonExtras,
  fr: fr as LessonExtras,
  es: es as LessonExtras,
};

/** Appends the course's extras. A course with none returns its units untouched. */
export function applyLessonExtras(units: Unit[], course: Course): Unit[] {
  return addLessonExtras(units, LESSON_EXTRAS[course]);
}
