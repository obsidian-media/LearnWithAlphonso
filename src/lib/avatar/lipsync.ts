import type { Course } from "@/data/courses";
import { visemeSequence, type Viseme } from "./visemes";

export type Brows = "neutral" | "raised" | "lowered";

/** One mouth shape held from `start` to `end` (seconds from the start of the spoken reply). */
export type MouthCue = { start: number; end: number; viseme: Viseme };

/** A stretch of the reply with the brows raised. */
export type BrowSpan = { start: number; end: number };

/**
 * When each mouth shape and brow position happens during one spoken reply. Built once from the reply's text and
 * the length of its audio, then read with the audio element's currentTime. Pure and deterministic.
 */
export type LipSyncPlan = { cues: MouthCue[]; raisedBrows: BrowSpan[] };

export const EMPTY_PLAN: LipSyncPlan = { cues: [], raisedBrows: [] };

/** A shape is held at least this long (except when a word itself is shorter), so the mouth never flickers. */
export const MINIMUM_HOLD = 0.07;
/** How long the brows stay up at the start of a greeting, at most. */
export const GREETING_BROW_HOLD = 0.6;

const GREETINGS = new Set([
  "hello",
  "hi",
  "hey",
  "hola",
  "bonjour",
  "salut",
  "bonsoir",
  "buenas",
  "buenos",
]);
const CLOSERS = new Set(['"', "'", "”", "’", ")", "]", "»"]);
const SENTENCE_END = ".!?…";

/** The mouth at `time`. Closed outside the plan, so a player that has not started or has finished shows a closed mouth. */
export function visemeAt(plan: LipSyncPlan, time: number): Viseme {
  const { cues } = plan;
  if (cues.length === 0) return "closed";
  if (!(time >= cues[0].start && time < cues[cues.length - 1].end)) return "closed";
  let low = 0;
  let high = cues.length - 1;
  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2);
    if (cues[mid].start <= time) low = mid;
    else high = mid - 1;
  }
  return cues[low].viseme;
}

export function browsAt(plan: LipSyncPlan, time: number): Brows {
  return plan.raisedBrows.some((s) => time >= s.start && time < s.end) ? "raised" : "neutral";
}

type Word = {
  letters: number;
  shapes: Viseme[];
  /** Pause after the word, in letter units (0 for the last word). */
  gapUnits: number;
  endsSentence: boolean;
  endsQuestion: boolean;
  isGreeting: boolean;
};

const isLetter = (c: string) => /^\p{L}$/u.test(c);
const hasLetter = (s: string) => /\p{L}/u.test(s);
const countLetters = (s: string) => [...s].filter(isLetter).length;

/** Keeps evenly spaced shapes so each is held at least MINIMUM_HOLD where the word allows. */
function thin(shapes: Viseme[], wordDuration: number): Viseme[] {
  const allowed = Math.max(1, Math.floor(wordDuration / MINIMUM_HOLD + 1e-9));
  if (shapes.length <= allowed) return shapes;
  return Array.from(
    { length: allowed },
    (_, i) => shapes[Math.floor((i * shapes.length) / allowed)],
  );
}

/**
 * Spreads the reply's words over `duration` seconds in proportion to their letters, with a one-letter gap between
 * words, a longer one after a comma, a longer still after a full stop. The mouth closes in the gaps.
 */
export function lipSyncPlan(text: string, course: Course, duration: number): LipSyncPlan {
  if (!(duration > 0)) return EMPTY_PLAN;
  const tokens = text.split(/\s+/u);
  const words: Word[] = [];
  tokens.forEach((token, index) => {
    const letters = countLetters(token);
    if (letters === 0) return;
    const trimmed = [...token];
    while (trimmed.length > 0 && CLOSERS.has(trimmed[trimmed.length - 1])) trimmed.pop();
    const end = trimmed.length > 0 ? trimmed[trimmed.length - 1] : undefined;
    const hasMoreWords = tokens.slice(index + 1).some(hasLetter);
    let gap = 0;
    if (hasMoreWords) {
      gap = 1;
      if (end !== undefined && ",;:".includes(end)) gap += 3;
      if (end !== undefined && SENTENCE_END.includes(end)) gap += 5;
    }
    const bare = [...token.toLowerCase()].filter(isLetter).join("");
    words.push({
      letters,
      shapes: visemeSequence(token, course),
      gapUnits: gap,
      endsSentence: !hasMoreWords || (end !== undefined && SENTENCE_END.includes(end)),
      endsQuestion: end === "?",
      isGreeting: words.length === 0 && GREETINGS.has(bare),
    });
  });
  if (words.length === 0) return EMPTY_PLAN;

  const totalUnits = words.reduce((sum, w) => sum + w.letters + w.gapUnits, 0);
  const unit = duration / totalUnits;

  const cues: MouthCue[] = [];
  const append = (start: number, end: number, shape: Viseme) => {
    if (!(end > start)) return;
    const last = cues[cues.length - 1];
    if (last && last.viseme === shape)
      cues[cues.length - 1] = { start: last.start, end, viseme: shape };
    else cues.push({ start, end, viseme: shape });
  };

  let t = 0;
  const wordTimes: { start: number; end: number }[] = [];
  words.forEach((word, i) => {
    const wordStart = t;
    const isLast = i === words.length - 1;
    const wordEnd = isLast ? duration : t + word.letters * unit;
    const picked = thin(word.shapes, wordEnd - wordStart);
    if (picked.length === 0) {
      append(wordStart, wordEnd, "closed");
    } else {
      const each = (wordEnd - wordStart) / picked.length;
      let cursor = wordStart;
      picked.forEach((shape, k) => {
        const shapeEnd = k === picked.length - 1 ? wordEnd : cursor + each;
        append(cursor, shapeEnd, shape);
        cursor = shapeEnd;
      });
    }
    wordTimes.push({ start: wordStart, end: wordEnd });
    t = wordEnd;
    if (!isLast) {
      const gapEnd = t + word.gapUnits * unit;
      append(t, gapEnd, "closed");
      t = gapEnd;
    }
  });

  const raisedBrows: BrowSpan[] = [];
  if (words[0].isGreeting) {
    raisedBrows.push({ start: 0, end: Math.min(GREETING_BROW_HOLD, duration * 0.25) });
  }
  words.forEach((word, i) => {
    if (!word.endsQuestion) return;
    // The last (up to) three words of the question sentence.
    let first = i;
    while (first > 0 && i - first < 2 && !words[first - 1].endsSentence) first -= 1;
    raisedBrows.push({ start: wordTimes[first].start, end: wordTimes[i].end });
  });
  return { cues, raisedBrows };
}
