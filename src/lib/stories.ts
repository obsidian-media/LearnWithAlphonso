/**
 * Graded stories (docs/superpowers/specs/2026-11-17-graded-stories-design.md): the pure rules behind the library
 * and the read-along. The database decides what a learner may see (RLS: published only); the filter here is a second
 * line, so a draft that ever reached the client still never shows.
 */
import type { QuizQuestion } from "./podcast-quiz-run";

export type StoryCourse = "en" | "fr" | "es";

export type StorySummary = {
  id: string;
  course: StoryCourse;
  level: string;
  slug: string;
  title: string;
  sortOrder: number;
  published: boolean;
  /** Segments read so far, from the learner's saved progress; 0 when never opened. */
  segmentIndex: number;
  segmentCount: number;
  /** The best check score, or null until the check is first taken. */
  bestCorrect: number | null;
  checkTotal: number | null;
  completed: boolean;
};

export type Story = {
  id: string;
  course: StoryCourse;
  level: string;
  title: string;
  segments: string[];
  questions: QuizQuestion[];
  /** Where the learner left off. */
  segmentIndex: number;
};

export const isStoryCourse = (c: unknown): c is StoryCourse =>
  c === "en" || c === "fr" || c === "es";

/** Only published stories in the learner's course, in a stable order. */
export function visibleStories(stories: StorySummary[], course: string): StorySummary[] {
  return stories
    .filter((s) => s.published === true && s.course === course)
    .sort(
      (a, b) =>
        a.level.localeCompare(b.level) ||
        a.sortOrder - b.sortOrder ||
        a.title.localeCompare(b.title),
    );
}

export type LevelGroup = { level: string; stories: StorySummary[] };

/** Stories grouped by level (A1 before A2), each group in reading order. */
export function groupByLevel(stories: StorySummary[]): LevelGroup[] {
  const groups = new Map<string, StorySummary[]>();
  for (const s of stories) groups.set(s.level, [...(groups.get(s.level) ?? []), s]);
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([level, list]) => ({ level, stories: list }));
}

const LEVEL_LABELS: Record<string, string> = {
  A1: "A1 · Beginner",
  A2: "A2 · Elementary",
  B1: "B1 · Intermediate",
  B2: "B2 · Upper intermediate",
  C1: "C1 · Advanced",
};
export const levelLabel = (level: string) => LEVEL_LABELS[level] ?? level;

/** A short status for a library row. */
export function storyStatus(s: StorySummary): string {
  if (s.checkTotal !== null && s.bestCorrect !== null)
    return `Best: ${s.bestCorrect} of ${s.checkTotal}`;
  if (s.segmentIndex > 0 && !s.completed) return "Continue reading";
  return "New";
}

/**
 * The segment to narrate after `index` ends, or null at the end of the story. Out-of-range input is treated as the end
 * so a stale index can never loop or run past the text.
 */
export function nextSegment(index: number, count: number): number | null {
  if (!Number.isInteger(index) || index < 0 || index + 1 >= count) return null;
  return index + 1;
}

/** A saved resume point, clamped into the text (a story can be re-edited shorter than a saved position). */
export function clampSegment(index: number, count: number): number {
  if (!Number.isFinite(index) || index <= 0 || count <= 0) return 0;
  return Math.min(Math.floor(index), count - 1);
}
