import { estimateMinutes, type LessonTimingTable } from "./lesson-time";
import { maxLessonXp } from "./lesson-xp";
import type { UnitPathState } from "./unit-path";

/**
 * The Learn screen's climbing map ("Path B"), as data: one climb per unit, its lesson nodes (done / next / locked),
 * the reward chest that crowns it, the unit strip, the trailhead and the start sheet for the next lesson, and where
 * each node sits on the winding trail. No drawing here: web, iOS and Android draw the same climb from it.
 *
 * Mirrors LearnMap in the iOS Kit and LearnMap in the Android core. All three replay shared/learn-map.json.
 */

/** A lesson as the map needs it, built from the curriculum lesson the platform already has. */
export type MapLesson = {
  id: string;
  title: string;
  /** The lesson's one-line coverage ("Common greetings"): the curriculum's subtitle. */
  subtitle: string;
  /** The curriculum's question type keys ("mc", "fill"...), for the time and XP. */
  questionTypes: readonly string[];
  /** The words the lesson's deck teaches (the same count lesson start uses for its time). */
  wordCount: number;
};

/** A unit of the level on screen, in curriculum order. */
export type MapUnit = { id: string; title: string; lessons: readonly MapLesson[] };

/** A spot on the climb, as fractions of the map's width (x, from the left) and height (y, from the top). */
export type MapPoint = { x: number; y: number };

export type MapLessonNode = MapPoint & { id: string; title: string; state: UnitPathState };

/** The unit's reward chest, the top of the climb: earned once every lesson of the unit is done. */
export type MapChest = MapPoint & { earned: boolean };

/**
 * Where the climb starts. The first unit of the level (or a unit whose previous one is not finished) starts from
 * the plain trailhead; once a unit is finished, its earned chest becomes the trailhead of the next unit's climb.
 */
export type MapTrailhead = { kind: "start" } | { kind: "chest"; unitId: string };

/** "Unit N · name" with "done/total" and a thin progress bar. N is the unit's place in the level. */
export type MapUnitStrip = {
  number: number;
  count: number;
  name: string;
  done: number;
  total: number;
  /** done / total, 0 for a unit with no lessons. */
  progress: number;
};

/** The start sheet for the next lesson: name, one-line coverage, and its time / XP / word chips. */
export type MapStartSheet = {
  lessonId: string;
  title: string;
  coverage: string;
  minutes: number;
  xp: number;
  words: number;
};

export type LearnMap = {
  unitId: string;
  strip: MapUnitStrip;
  /** Bottom of the climb first. */
  nodes: MapLessonNode[];
  chest: MapChest;
  trailhead: MapTrailhead;
  /** null when the unit is finished. */
  next: MapStartSheet | null;
};

/** The trail's lowest and highest points (fractions of the height, from the top), as in the mock. */
export const TRAIL_BOTTOM = 0.9;
export const TRAIL_TOP = 0.06;
/** The winding: lesson nodes swing left, centre, right, centre, and the chest sits in the middle at the top. */
export const TRAIL_SWING = [0.36, 0.5, 0.64, 0.5] as const;
export const CHEST_X = 0.5;

/**
 * Where slot `index` of a climb with `slots` slots sits (the lessons, bottom first, then the chest as the last
 * slot). The same index and count always give the same point, so every platform draws the same climb.
 */
export function mapPoint(index: number, slots: number): MapPoint {
  // Measured down from the top, so the chest (the last slot) sits at exactly TRAIL_TOP on every platform.
  const y =
    slots <= 1
      ? TRAIL_TOP
      : TRAIL_TOP + ((TRAIL_BOTTOM - TRAIL_TOP) * (slots - 1 - index)) / (slots - 1);
  const x = index === slots - 1 ? CHEST_X : TRAIL_SWING[index % TRAIL_SWING.length]!;
  return { x, y };
}

/** The last index before `end` whose unit passes `test`, or -1. */
function lastIndexWhere(units: readonly MapUnit[], end: number, test: (u: MapUnit) => boolean) {
  for (let i = end - 1; i >= 0; i--) if (test(units[i]!)) return i;
  return -1;
}

const unitDone = (u: MapUnit, completed: ReadonlySet<string>) =>
  u.lessons.every((l) => completed.has(l.id));

/**
 * The climb for one unit of the level. Without `unitId` it is the learner's current unit: the first with a lesson
 * not done, or the last unit when the whole level is done. null for a level with no units (or an unknown unitId).
 *
 * A unit with no lessons is never a climb, a current unit or a trailhead: there is nothing to climb and no chest to
 * earn. It is skipped as if done, the same as currentUnitOf (src/lib/learn-fold.ts), which looks for the first lesson
 * not done and so passes over it. It still counts in the strip's "Unit N of M", which numbers every unit of the
 * level like Learn A does.
 */
export function learnMap(
  units: readonly MapUnit[],
  completed: ReadonlySet<string>,
  options: { unitId?: string; timing?: LessonTimingTable } = {},
): LearnMap | null {
  const climbable = (u: MapUnit) => u.lessons.length > 0;
  let index: number;
  if (options.unitId !== undefined) {
    index = units.findIndex((u) => u.id === options.unitId);
  } else {
    index = units.findIndex((u) => climbable(u) && !unitDone(u, completed));
    if (index === -1) index = lastIndexWhere(units, units.length, climbable);
  }
  if (index === -1 || !climbable(units[index]!)) return null;
  const unit = units[index]!;
  const slots = unit.lessons.length + 1;
  const nextIndex = unit.lessons.findIndex((l) => !completed.has(l.id));
  const nodes = unit.lessons.map((l, i): MapLessonNode => ({
    id: l.id,
    title: l.title,
    state: completed.has(l.id) ? "done" : i === nextIndex ? "next" : "locked",
    ...mapPoint(i, slots),
  }));
  const done = unit.lessons.filter((l) => completed.has(l.id)).length;
  const total = unit.lessons.length;
  // The trailhead looks back past empty units to the last unit that had a climb.
  const previousIndex = lastIndexWhere(units, index, climbable);
  const previous = previousIndex === -1 ? null : units[previousIndex]!;
  const nextLesson = nextIndex === -1 ? null : unit.lessons[nextIndex]!;
  return {
    unitId: unit.id,
    strip: {
      number: index + 1,
      count: units.length,
      name: unit.title,
      done,
      total,
      progress: total === 0 ? 0 : done / total,
    },
    nodes,
    chest: { earned: done === total, ...mapPoint(slots - 1, slots) },
    trailhead:
      previous && unitDone(previous, completed)
        ? { kind: "chest", unitId: previous.id }
        : { kind: "start" },
    next: nextLesson
      ? {
          lessonId: nextLesson.id,
          title: nextLesson.title,
          coverage: nextLesson.subtitle,
          minutes: estimateMinutes(nextLesson.questionTypes, nextLesson.wordCount, options.timing),
          xp: maxLessonXp(nextLesson.questionTypes.length),
          words: nextLesson.wordCount,
        }
      : null,
  };
}
