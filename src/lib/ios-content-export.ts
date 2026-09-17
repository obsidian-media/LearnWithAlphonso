import { getCourse, type Course } from "@/data/courses";
import { SCENARIOS } from "@/data/scenarios";
import type { Unit } from "@/data/curriculum";

export type IOSContentBundle = {
  course: Course;
  units: Unit[];
};

/**
 * Extracts one course's full curriculum, unchanged, into the shape the
 * native iOS app's bundled JSON will use. This is intentionally a
 * pass-through, not a transform -- the native Swift Codable models (see
 * the native-app plan) are written to decode exactly this shape, so a
 * lesson/unit/question schema change here must be mirrored there. Real
 * export logic lives here (a pure function) so it's testable without
 * writing to disk; scripts/export-ios-content.ts is a thin CLI wrapper
 * around it.
 */
export function buildIOSContentBundle(course: Course): IOSContentBundle {
  const { curriculum } = getCourse(course);
  return { course, units: curriculum };
}

export type IOSScenario = {
  id: string;
  title: string;
  emoji: string;
  blurb: string;
  level: "Beginner" | "Intermediate" | "Advanced";
  systemPrompt: string;
  opener: string;
};

/** Same pass-through reasoning as buildIOSContentBundle, for SCENARIOS. */
export function buildIOSScenariosBundle(): IOSScenario[] {
  return SCENARIOS;
}
