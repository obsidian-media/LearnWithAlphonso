import type { Unit } from "./curriculum";
import { curriculum, questionIndex, unitsForLevel, findLesson, allLessonIds } from "./curriculum";
import {
  curriculumFr,
  questionIndexFr,
  unitsForLevelFr,
  findLessonFr,
  allLessonIdsFr,
} from "./curriculum-fr";
import {
  curriculumEs,
  questionIndexEs,
  unitsForLevelEs,
  findLessonEs,
  allLessonIdsEs,
} from "./curriculum-es";
import { PLACEMENT_QUESTIONS, pickPlacementSet, playablePool } from "./placement";
import { PLACEMENT_QUESTIONS_FR } from "./placement-fr";
import { PLACEMENT_QUESTIONS_ES } from "./placement-es";
import type { PlacementQuestion } from "./placement";
import type { Level } from "./levels";

import type { Course } from "./course-meta";

// Ids, labels and locales live in ./course-meta (no curriculum) so every-page code can import them cheaply.
export { COURSES, isCourse, localeForCourse } from "./course-meta";
export type { Course, CourseMeta } from "./course-meta";

export type QuestionRef = {
  lessonId: string;
  unitId: string;
  level: Level;
  question: Unit["lessons"][number]["questions"][number];
};

type CourseBundle = {
  curriculum: Unit[];
  questionIndex: Record<string, QuestionRef>;
  unitsForLevel: (level: Level) => Unit[];
  findLesson: (id: string) => { unit: Unit; lesson: Unit["lessons"][number]; index: number } | null;
  allLessonIds: string[];
  /** Full placement-question pool for this course (9 per CEFR band). */
  placementPool: PlacementQuestion[];
  /**
   * Randomly samples a fresh 15-question placement set (3 per band) from the
   * pool. `canPlayAudio` is threaded in rather than read here so the filtering
   * happens before the draw -- see playablePool for why the order is
   * load-bearing -- and so this module stays free of browser globals.
   */
  pickPlacement: (canPlayAudio?: boolean) => PlacementQuestion[];
};

const bundles: Record<Course, CourseBundle> = {
  en: {
    curriculum,
    questionIndex,
    unitsForLevel,
    findLesson,
    allLessonIds,
    placementPool: PLACEMENT_QUESTIONS,
    pickPlacement: (canPlayAudio = true) =>
      pickPlacementSet(playablePool(PLACEMENT_QUESTIONS, canPlayAudio)),
  },
  fr: {
    curriculum: curriculumFr,
    questionIndex: questionIndexFr,
    unitsForLevel: unitsForLevelFr,
    findLesson: findLessonFr,
    allLessonIds: allLessonIdsFr,
    placementPool: PLACEMENT_QUESTIONS_FR,
    pickPlacement: (canPlayAudio = true) =>
      pickPlacementSet(playablePool(PLACEMENT_QUESTIONS_FR, canPlayAudio)),
  },
  es: {
    curriculum: curriculumEs,
    questionIndex: questionIndexEs,
    unitsForLevel: unitsForLevelEs,
    findLesson: findLessonEs,
    allLessonIds: allLessonIdsEs,
    placementPool: PLACEMENT_QUESTIONS_ES,
    pickPlacement: (canPlayAudio = true) =>
      pickPlacementSet(playablePool(PLACEMENT_QUESTIONS_ES, canPlayAudio)),
  },
};

/** Returns the full content bundle (curriculum, indices, placement) for a course. */
export function getCourse(course: Course): CourseBundle {
  return bundles[course];
}
