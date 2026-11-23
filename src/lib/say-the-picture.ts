import { getCourse, type Course } from "@/data/courses";
import { deriveVocab, type VocabItem } from "@/data/vocab";
import { isPicturable } from "./vocab-images/picturable";
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
 * Every word of the course that has a picture a learner can name, learned or not. Action words and the shared deny
 * list (shared/say-the-picture-deny.json) are left out: their photos read as other words. They keep their photo on
 * the lesson card, where the word is printed beside it.
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
        if (!item.image || seen.has(key) || !isPicturable(item.term, course)) continue;
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

/** How one picture ended: said right first time, or taught after a miss (or "Show me the word"). */
export type RoundResult = "first" | "missed";

/** Alphonso's in-pose reactions, by file name under /figures (alphonso-<pose>.webp). */
export type StpPose =
  "explaining-pointer" | "listening-headphones" | "thinking-temple" | "levelup-cheer";

/**
 * Which pose Alphonso is in. Asking he explains, while the learner holds the mic he listens, after a miss (the word is
 * being taught) he thinks it through with them, and on a win he cheers.
 */
export function poseFor(phase: "ask" | "right" | "reveal" | "done", listening: boolean): StpPose {
  if (phase === "right") return "levelup-cheer";
  if (listening) return "listening-headphones";
  if (phase === "reveal") return "thinking-temple";
  return "explaining-pointer";
}

/** The run of first-time wins ending at the latest result ("3 in a row"). */
export function comboCount(results: readonly RoundResult[]): number {
  let n = 0;
  for (let i = results.length - 1; i >= 0 && results[i] === "first"; i--) n++;
  return n;
}

/** The words that were missed, in session order (what the summary's cross-links carry). */
export function missedWords<T>(rounds: readonly T[], results: readonly RoundResult[]): T[] {
  return rounds.filter((_, i) => results[i] === "missed");
}

/** The sentence the save-word route needs: the model sentence when it holds the word, else the word on its own. */
export function saveSentence(word: { term: string; example: string }): string {
  const fold = (s: string) => s.toLowerCase().replace(/’/g, "'");
  const hit = ` ${fold(word.example)} `
    .replace(/[^\p{L}'-]+/gu, " ")
    .includes(` ${fold(word.term)} `);
  return hit ? word.example.trim() : word.term;
}

/** The mic ring fills over this long; when it is full the recording stops and is sent. Same on iOS and Android. */
export const MAX_RECORD_MS = 6000;
