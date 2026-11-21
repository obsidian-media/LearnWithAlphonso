// The one rule for which lessons a learner may START. Used by the Learn map (src/lib/learn-map.ts), by the web
// server (startLessonSession in sync.functions.ts) and, as a byte-identical copy, by the start-lesson-session Edge
// Function (supabase/functions/_shared/lesson-unlock.ts; src/lib/lesson-unlock.test.ts fails if the two differ).
// Pure and import-free on purpose: Edge Functions bundle each directory alone, so nothing here may import.

/** CEFR bands in learning order. Units sit in these bands; a band's units keep their curriculum order. */
export const LEVEL_ORDER = ["A1", "A2", "B1", "B2", "C1"] as const;

export type OrderedLesson = { id: string; level: string };

/** A level the rule does not know sorts after every known one. */
function levelRank(level: string | null | undefined): number {
  const i = LEVEL_ORDER.indexOf(level as (typeof LEVEL_ORDER)[number]);
  return i === -1 ? LEVEL_ORDER.length : i;
}

/**
 * A course's lessons in LEARNING order: band by band (A1 first), curriculum order within a band. The English
 * curriculum array interleaves bands, so the array order is not the learning order; the Learn map has always
 * climbed one band at a time, and this is that order.
 */
export function lessonsInLearningOrder<T extends OrderedLesson>(lessons: readonly T[]): T[] {
  return lessons
    .map((lesson, i) => ({ lesson, i }))
    .sort((a, b) => levelRank(a.lesson.level) - levelRank(b.lesson.level) || a.i - b.i)
    .map((x) => x.lesson);
}

/**
 * The last position (in learning order) the learner may start. Everything up to and including it is open:
 *  - the lesson after their FURTHEST completion (so a learner whose completions are out of order, or who had
 *    lessons inserted before them later, can always carry on, and every lesson they skipped is open to replay);
 *  - the first lesson of their CEFR level (a placement result, or the level they picked on Learn, is stored as
 *    cefr_level: it is how placement lets a learner start above A1), and everything before it.
 * `cefrLevel` null/unknown counts as no floor.
 */
export function unlockCeiling(
  order: readonly OrderedLesson[],
  completed: ReadonlySet<string>,
  cefrLevel: string | null | undefined,
): number {
  let furthest = -1;
  order.forEach((l, i) => {
    if (completed.has(l.id)) furthest = i;
  });
  let floor = 0;
  if (cefrLevel) {
    const want = levelRank(cefrLevel);
    const at = order.findIndex((l) => levelRank(l.level) >= want);
    floor = at === -1 ? 0 : at;
  }
  return Math.max(furthest + 1, floor);
}

/** Whether `lessonId` may be started. False for a lesson that is not in `order`. */
export function isLessonUnlocked(
  order: readonly OrderedLesson[],
  completed: ReadonlySet<string>,
  cefrLevel: string | null | undefined,
  lessonId: string,
): boolean {
  const at = order.findIndex((l) => l.id === lessonId);
  return at !== -1 && at <= unlockCeiling(order, completed, cefrLevel);
}

export type PathState = "done" | "next" | "locked";

/**
 * The states a unit's path draws: completed lessons are "done" wherever they sit, the first not yet done is
 * "next" (the one the map offers), the rest "locked". The "next" lesson is always inside unlockCeiling.
 */
export function pathStates(
  lessonIds: readonly string[],
  completed: ReadonlySet<string>,
): PathState[] {
  const nextIndex = lessonIds.findIndex((id) => !completed.has(id));
  return lessonIds.map((id, i) =>
    completed.has(id) ? "done" : i === nextIndex ? "next" : "locked",
  );
}
