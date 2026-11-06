import timing from "../data/lesson-timing.json";
import type { Question } from "../data/curriculum";

/**
 * A lesson's time: the honest estimate on lesson start ("About N min", from src/data/lesson-timing.json) and the
 * real time on lesson complete, counted only while the lesson is on screen.
 */

export function estimateLessonMinutes(questions: readonly Question[], newWords: number): number {
  const perQuestion = timing.secondsPerQuestion as Record<Question["type"], number>;
  const seconds =
    questions.reduce((sum, q) => sum + perQuestion[q.type], 0) +
    newWords * timing.secondsPerNewWord;
  return Math.max(1, Math.ceil(seconds / 60));
}

/** Elapsed time that stops while paused (the tab or app hidden). Times are passed in, so it is testable. */
export class ActiveTimer {
  private total = 0;
  private since: number | null;

  constructor(now: number) {
    this.since = now;
  }

  pause(now: number) {
    if (this.since === null) return;
    this.total += now - this.since;
    this.since = null;
  }

  resume(now: number) {
    if (this.since === null) this.since = now;
  }

  elapsedMs(now: number): number {
    return this.total + (this.since === null ? 0 : now - this.since);
  }
}

/** m:ss, minutes unbounded. */
export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
