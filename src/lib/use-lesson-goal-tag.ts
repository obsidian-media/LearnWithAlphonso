import { getCourse, type Course } from "../data/courses";
import { lessonHasGoalVariant } from "./goal-variants";
import type { Goal } from "./learner-profile";
import { useProgress } from "./progress";
import { useLearnerGoal } from "./use-learner-goal";

/** The goal to show on a lesson card or row ("For your travel goal"), or null when that lesson has no questions written for it. */
export function lessonGoalTag(
  course: Course,
  lessonId: string | null | undefined,
  goal: Goal | null,
): Goal | null {
  if (!goal || !lessonId) return null;
  const found = getCourse(course).findLesson(lessonId);
  return found && lessonHasGoalVariant(found.lesson, goal) ? goal : null;
}

export function useLessonGoalTag(lessonId: string | null | undefined): Goal | null {
  const goal = useLearnerGoal();
  const course = useProgress((s) => s.course);
  return lessonGoalTag(course, lessonId, goal);
}
