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

export type Course = "en" | "fr" | "es";

export type CourseMeta = { id: Course; label: string; flag: string; targetLanguage: string };

export const COURSES: CourseMeta[] = [
  { id: "en", label: "English", flag: "🇬🇧", targetLanguage: "English" },
  { id: "fr", label: "French", flag: "🇫🇷", targetLanguage: "French" },
  { id: "es", label: "Spanish", flag: "🇪🇸", targetLanguage: "Spanish" },
];

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

export function isCourse(value: string): value is Course {
  return value === "en" || value === "fr" || value === "es";
}

const LOCALES: Record<Course, string> = { en: "en-US", fr: "fr-FR", es: "es-ES" };

/** BCP-47 locale for the Web Speech API / AVSpeechSynthesisVoice, per course. */
export function localeForCourse(course: Course): string {
  return LOCALES[course];
}
