/**
 * Graded stories (docs/superpowers/specs/2026-11-17-graded-stories-design.md): the pure rules behind the library
 * and the read-along. The database decides what a learner may see (RLS: published only); the filter here is a second
 * line, so a draft that ever reached the client still never shows.
 */
import type { StoryGraph, StoryNode } from "./branching";
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
  /** A branching ("choose your path") story rather than a plain linear one; drives the library badge. */
  branching: boolean;
  /** Segments read so far, from the learner's saved progress; 0 when never opened. */
  segmentIndex: number;
  segmentCount: number;
  /** The best check score, or null until the check is first taken. */
  bestCorrect: number | null;
  checkTotal: number | null;
  completed: boolean;
  /** The first scene's art as a public URL, or null (a linear story, or a branching one without art): a designed fallback is drawn. */
  coverUrl: string | null;
  /** Endings in a branching story's node graph (0 for a linear story). */
  endingsTotal: number;
  /** Distinct endings this learner has reached (story_progress.endings_found), never more than endingsTotal. */
  endingsFound: number;
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

/** A branching story loaded for the reader: the node graph (with resolved art URLs) and the learner's endings. */
export type BranchingStory = {
  id: string;
  course: StoryCourse;
  level: string;
  title: string;
  branching: true;
  graph: StoryGraph;
  /** Ending ids the learner has already reached, for the endings-found tracker. */
  endingsFound: string[];
  readingCredited: boolean;
};

/** What getStory returns: a plain read-along (no `graph`) or a branching story (`graph` present). */
export type LoadedStory = Story | BranchingStory;

export const isBranchingStory = (s: LoadedStory): s is BranchingStory => "graph" in s;

export type { StoryNode };

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
  if (s.branching) return s.completed ? "Ending found — try another path" : "Choose your path";
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

/** The library's three parts: the featured story, the continue line and the cover grid. */
export type StoriesLibrary = {
  featured: StorySummary | null;
  resume: StorySummary | null;
  grid: StorySummary[];
};

/**
 * Splits the visible stories for the library. Featured is the newest branching story (the highest sort order: stories
 * are added at the end). Resume is a linear story the learner started and has not finished (its saved position is
 * stored; a branching path's position is not, so a branching story is never offered here). The grid is everything
 * except the featured story, in level then reading order.
 */
export function storiesLibrary(stories: StorySummary[], course: string): StoriesLibrary {
  const visible = visibleStories(stories, course);
  const featured =
    visible
      .filter((s) => s.branching)
      .reduce<StorySummary | null>(
        (best, s) => (best === null || s.sortOrder >= best.sortOrder ? s : best),
        null,
      ) ?? null;
  const resume = visible.find((s) => !s.branching && s.segmentIndex > 0 && !s.completed) ?? null;
  return { featured, resume, grid: visible.filter((s) => s !== featured) };
}

/** "3 of 5 endings" for a branching story, with the total never exceeded by the found count. */
export function endingsLine(s: Pick<StorySummary, "endingsFound" | "endingsTotal">): string {
  const found = Math.min(s.endingsFound, s.endingsTotal);
  return `${found} of ${s.endingsTotal} endings`;
}

/** The hero's line: "A2 · 4 endings · 1 found". */
export function heroLine(s: StorySummary): string {
  const n = s.endingsTotal;
  const found = Math.min(s.endingsFound, n);
  return `${s.level} · ${n} ${n === 1 ? "ending" : "endings"} · ${found} found`;
}

/** What a grid card says under its title: the endings progress (branching) or the read state (linear). */
export function cardCaption(s: StorySummary): string {
  return s.branching && s.endingsTotal > 0 ? endingsLine(s) : storyStatus(s);
}

/** The one full accessible name of a card or hero button. */
export function cardLabel(s: StorySummary): string {
  const parts = [s.title, s.level];
  if (s.branching) parts.push("Choose your path");
  parts.push(cardCaption(s));
  return parts.join(", ");
}

/** The scene a resume line reads: the saved segment, counted from 1. */
export function resumeLine(s: StorySummary): string {
  return `Continue · Scene ${s.segmentIndex + 1}`;
}

/** Fraction of endings found, 0..1, for the progress ring. */
export function endingsFraction(s: Pick<StorySummary, "endingsFound" | "endingsTotal">): number {
  return s.endingsTotal <= 0 ? 0 : Math.min(1, s.endingsFound / s.endingsTotal);
}
