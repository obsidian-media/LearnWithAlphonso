import type { Unit } from "./curriculum";
import { curriculum, questionIndex, unitsForLevel, findLesson, allLessonIds } from "./curriculum";
import {
  curriculumFr,
  questionIndexFr,
  unitsForLevelFr,
  findLessonFr,
  allLessonIdsFr,
} from "./curriculum-fr";
import { PLACEMENT_QUESTIONS } from "./placement";
import { PLACEMENT_QUESTIONS_FR } from "./placement-fr";
import type { PlacementQuestion } from "./placement";
import type { Level } from "./levels";

export type Course = "en" | "fr";

export type CourseMeta = { id: Course; label: string; flag: string; targetLanguage: string };

export const COURSES: CourseMeta[] = [
  { id: "en", label: "English", flag: "🇬🇧", targetLanguage: "English" },
  { id: "fr", label: "French", flag: "🇫🇷", targetLanguage: "French" },
];

export type QuestionRef = { lessonId: string; unitId: string; level: Level; question: Unit["lessons"][number]["questions"][number] };

type CourseBundle = {
  curriculum: Unit[];
  questionIndex: Record<string, QuestionRef>;
  unitsForLevel: (level: Level) => Unit[];
  findLesson: (id: string) => { unit: Unit; lesson: Unit["lessons"][number]; index: number } | null;
  allLessonIds: string[];
  placementQuestions: PlacementQuestion[];
};

const bundles: Record<Course, CourseBundle> = {
  en: {
    curriculum,
    questionIndex,
    unitsForLevel,
    findLesson,
    allLessonIds,
    placementQuestions: PLACEMENT_QUESTIONS,
  },
  fr: {
    curriculum: curriculumFr,
    questionIndex: questionIndexFr,
    unitsForLevel: unitsForLevelFr,
    findLesson: findLessonFr,
    allLessonIds: allLessonIdsFr,
    placementQuestions: PLACEMENT_QUESTIONS_FR,
  },
};

/** Returns the full content bundle (curriculum, indices, placement) for a course. */
export function getCourse(course: Course): CourseBundle {
  return bundles[course];
}

export function isCourse(value: string): value is Course {
  return value === "en" || value === "fr";
}
