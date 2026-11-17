import { getCourse, type Course } from "@/data/courses";
import { deriveVocab, type VocabItem } from "@/data/vocab";
import { normaliseSpoken } from "./spoken-answer";
import { normaliseSpokenFr } from "./spoken-answer-fr";
import { normaliseSpokenEs } from "./spoken-answer-es";
import { MAX_STARS } from "./practice-stars";

/** One session is this many words. */
export const ROUNDS = 8;
/** Fewer learned words than this and the drill says "learn a few words first". */
export const MIN_POOL = 4;
/** At or above this utterance confidence (0-1), a matching transcript is "Great". Tunable: the one place it lives. */
export const HIGH_CONFIDENCE = 0.85;
/** At or above this (and below HIGH), a matching transcript is "Almost"; below it, "Try again". Tunable. */
export const LOW_CONFIDENCE = 0.6;
/** A longer phrase is not a word to drill. */
const MAX_TARGET_WORDS = 4;

export type Verdict = "great" | "almost" | "again";

const NORMALISE: Record<Course, (s: string) => string> = {
  en: normaliseSpoken,
  fr: normaliseSpokenFr,
  es: normaliseSpokenEs,
};

/** Same forgiving whole-word comparison as Say the picture, over the per-course speak normalisers. */
export function matchesTarget(transcript: string, term: string, course: Course): boolean {
  const norm = NORMALISE[course];
  const said = norm(transcript);
  const want = norm(term);
  if (!said || !want) return false;
  return said === want || ` ${said} `.includes(` ${want} `);
}

/**
 * The verdict for one attempt from Deepgram's `{ text, confidence }`. A match with HIGH confidence is great; a match
 * with middling confidence is almost; no match, or a match the recogniser was unsure of, is try again. A match with no
 * confidence value (null) is great: nothing says it was unclear. It reflects being understood, not which sound was off.
 */
export function judgeAttempt(
  transcript: string,
  confidence: number | null,
  term: string,
  course: Course,
): Verdict {
  if (!matchesTarget(transcript, term, course)) return "again";
  if (confidence === null || confidence >= HIGH_CONFIDENCE) return "great";
  if (confidence >= LOW_CONFIDENCE) return "almost";
  return "again";
}

/** A usable drill target: a real word or short phrase that normalises to something. */
export function usableTarget(term: string, course: Course): boolean {
  const norm = NORMALISE[course](term);
  if (!norm) return false;
  return norm.split(" ").length <= MAX_TARGET_WORDS;
}

/**
 * The learner's LEARNED words: the vocabulary of every lesson they have completed.
 *
 * LIVE, not a list: derived on each call from the live curriculum and the learner's completed-lesson ids, nothing
 * cached across calls, so finishing another lesson grows the pool the next time a session starts. Words with no
 * usable target are excluded, and terms are de-duplicated.
 */
export function learnedWordPool(
  course: Course,
  completedLessonIds: readonly string[],
): VocabItem[] {
  const done = new Set(completedLessonIds);
  const seen = new Set<string>();
  const pool: VocabItem[] = [];
  for (const unit of getCourse(course).curriculum) {
    for (const lesson of unit.lessons) {
      if (!done.has(lesson.id)) continue;
      for (const item of deriveVocab(lesson)) {
        const key = item.term.trim().toLowerCase();
        if (seen.has(key) || !usableTarget(item.term, course)) continue;
        seen.add(key);
        pool.push(item);
      }
    }
  }
  return pool;
}

/** `count` distinct words drawn from the pool (all of it when it is smaller). `rng` is injectable for tests. */
export function drawRounds<T>(
  pool: readonly T[],
  count = ROUNDS,
  rng: () => number = Math.random,
): T[] {
  const a = [...pool];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, count);
}

/** Stars for a finished session: by share of first-attempt greats, never below one (finishing is the point). */
export function sessionStars(great: number, total: number): 1 | 2 | 3 {
  if (total <= 0) return 1;
  const share = great / total;
  const n = share >= 0.75 ? 3 : share >= 0.5 ? 2 : 1;
  return Math.min(n, MAX_STARS) as 1 | 2 | 3;
}
