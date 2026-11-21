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

/** The learner's place in the course the way the apps already installed show it: the first lesson not done, in the
 * curriculum's own array order (which interleaves bands), or null when everything is done. */
export function firstUndoneInCurriculumOrder(
  lessons: readonly OrderedLesson[],
  completed: ReadonlySet<string>,
): string | null {
  return lessons.find((l) => !completed.has(l.id))?.id ?? null;
}

/**
 * The lesson ids this learner may start. `lessons` is the course in CURRICULUM order (the array order). Open are:
 *  - everything up to and including the lesson after the learner's FURTHEST completion, in learning order (so a
 *    learner whose completions are out of order, or who had lessons inserted before them later, can always carry on,
 *    and every lesson they skipped is open to replay);
 *  - the first lesson of their CEFR level, and everything before it (a placement result, or the level they picked
 *    on Learn, is stored as cefr_level: it is how placement lets a learner start above A1);
 *  - the first lesson not done in curriculum order. Web used to offer that one as "where you are", and the apps
 *    already installed still do (their Continue label and Android's list), so refusing it would break their normal
 *    screens. Remove this line once those builds are gone.
 * `cefrLevel` null/unknown counts as no floor. The web screens offer only lessons from the first two bullets, so they
 * pass `{ curriculumNext: false }` to prove that; the server uses the default.
 */
export function unlockedLessonIds(
  lessons: readonly OrderedLesson[],
  completed: ReadonlySet<string>,
  cefrLevel: string | null | undefined,
  options: { curriculumNext?: boolean } = {},
): Set<string> {
  const order = lessonsInLearningOrder(lessons);
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
  const ceiling = Math.max(furthest + 1, floor);
  const open = new Set(order.slice(0, ceiling + 1).map((l) => l.id));
  const rawNext =
    options.curriculumNext === false ? null : firstUndoneInCurriculumOrder(lessons, completed);
  if (rawNext) open.add(rawNext);
  return open;
}

/** Whether `lessonId` may be started. False for a lesson that is not in `lessons`. */
export function isLessonUnlocked(
  lessons: readonly OrderedLesson[],
  completed: ReadonlySet<string>,
  cefrLevel: string | null | undefined,
  lessonId: string,
): boolean {
  return unlockedLessonIds(lessons, completed, cefrLevel).has(lessonId);
}

/**
 * The lesson the Learn map offers this learner next: the first not done at their level or above in learning order,
 * else the first not done anywhere. Always startable. null when every lesson is done.
 */
export function nextStartableLessonId(
  lessons: readonly OrderedLesson[],
  completed: ReadonlySet<string>,
  cefrLevel: string | null | undefined,
): string | null {
  const order = lessonsInLearningOrder(lessons);
  const want = cefrLevel ? levelRank(cefrLevel) : 0;
  const undone = order.filter((l) => !completed.has(l.id));
  return (undone.find((l) => levelRank(l.level) >= want) ?? undone[0])?.id ?? null;
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
