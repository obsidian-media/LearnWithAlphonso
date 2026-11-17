import { getCourse, type Course } from "@/data/courses";
import { deriveVocab, type VocabItem } from "@/data/vocab";
import { normaliseSpoken } from "./spoken-answer";
import { normaliseSpokenFr } from "./spoken-answer-fr";
import { normaliseSpokenEs } from "./spoken-answer-es";
import { MAX_STARS } from "./practice-stars";

/** One session is this many pictures. */
export const ROUNDS = 8;
/** Fewer image words than this and the activity says "not enough words with pictures yet". */
export const MIN_POOL = 4;

export type PictureWord = VocabItem & { image: NonNullable<VocabItem["image"]> };

/**
 * Every word of the course that has a picture, learned or not.
 *
 * LIVE, not a list: it is derived on each call from the lessons' own vocabulary, and deriveVocab attaches the image
 * at that moment. A word that gains a photo is in the pool the next time a session starts, with no curation step.
 * Deliberately not cached across calls, so a snapshot cannot creep in.
 */
export function imageWordPool(course: Course): PictureWord[] {
  const seen = new Set<string>();
  const pool: PictureWord[] = [];
  for (const unit of getCourse(course).curriculum) {
    for (const lesson of unit.lessons) {
      for (const item of deriveVocab(lesson)) {
        const key = item.term.trim().toLowerCase();
        if (!item.image || seen.has(key)) continue;
        seen.add(key);
        pool.push(item as PictureWord);
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

const NORMALISE: Record<Course, (s: string) => string> = {
  en: normaliseSpoken,
  fr: normaliseSpokenFr,
  es: normaliseSpokenEs,
};

/**
 * Forgiving grade for one picture word. Same per-course normalisation as the speak exercise; the word counts when it
 * is the whole utterance OR appears in it as whole words ("el abogado", "a dog"), because a learner naming a picture
 * naturally adds an article. Empty speech is never a hit.
 */
export function saidThePicture(transcript: string, term: string, course: Course): boolean {
  const norm = NORMALISE[course];
  const said = norm(transcript);
  const want = norm(term);
  if (!said || !want) return false;
  return said === want || ` ${said} `.includes(` ${want} `);
}

/** Stars for a finished session: by share said first time, never below one (finishing is the point). */
export function sessionStars(correct: number, total: number): 1 | 2 | 3 {
  if (total <= 0) return 1;
  const share = correct / total;
  const n = share >= 0.75 ? 3 : share >= 0.5 ? 2 : 1;
  return Math.min(n, MAX_STARS) as 1 | 2 | 3;
}
