/**
 * "How you spoke": the speaking notes after a rehearsal run. Pure, no I/O; the server builds them from counts and
 * the web renders them. Counts only: no learner word is ever stored or sent, and there is no score, percentage or grade.
 *
 * The server stores, per run, how many learner replies there were, how many were a full answer (measureReply: not
 * short), how many fell back to English, and how many of the brief's key phrases the learner used. The note for a run
 * compares each count with the same count from the learner's previous finished run of the same stage.
 */
import { COURSES, type Course } from "../data/course-meta";

export type SpeakingKind = "full_replies" | "english_fallback" | "key_phrases" | "pauses";
/** The kinds a client knows. The pause note is never in a group: buildSpeaking adds it last. */
export const SPEAKING_KINDS: readonly SpeakingKind[] = [
  "full_replies",
  "key_phrases",
  "english_fallback",
  "pauses",
];

/**
 * A learner reply is "slow" when the learner took this long (or longer) to start speaking after the partner's voice
 * finished. 4 seconds is a clear hesitation in a spoken exchange and well above the normal turn gap and the tail of
 * browser audio and recorder start-up; it is a gentle prompt, never a measure of ability.
 */
export const SLOW_REPLY_MS = 4000;
/** Most latencies one recap accepts (one per learner reply) and the longest one (a minute; above that is not a reply). */
export const MAX_REPLY_LATENCIES = 60;
export const MAX_REPLY_LATENCY_MS = 60_000;
/** The pause note appears only from this many slow replies, and only when they are at least half of those measured. */
export const MIN_SLOW_FOR_NOTE = 3;

/**
 * The latencies of a request, checked: 1..60 integers, each 0..60000 ms. Anything else (wrong type, too many, one bad
 * value) is null, and the caller carries on as if none were sent: a bad shape never fails a recap.
 */
export function parseReplyLatencies(v: unknown): number[] | null {
  if (!Array.isArray(v) || v.length === 0 || v.length > MAX_REPLY_LATENCIES) return null;
  for (const n of v)
    if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > MAX_REPLY_LATENCY_MS)
      return null;
  return v as number[];
}

/** How many replies were slow. Only this number (and how many were measured) is ever stored. */
export const countSlowReplies = (latenciesMs: readonly number[]): number =>
  latenciesMs.filter((ms) => ms >= SLOW_REPLY_MS).length;
export const MAX_SPEAKING_NOTES = 3;

export type SpeakingNote = {
  kind: SpeakingKind;
  count: number;
  total: number;
  previous: number | null;
};
export type RehearsalSpeaking = { notes: SpeakingNote[] };

/** The signals of one run. */
export type SpeakingSignals = {
  replies: number;
  full: number;
  english: number;
  keyUsed: number;
  keyTotal: number;
  /** Slice B2: replies that took SLOW_REPLY_MS or more to start, of `measured` replies the client timed. Absent: none sent. */
  slow?: number;
  measured?: number;
};

/** Lowercase, accents removed, punctuation turned to spaces, spaces collapsed: the form phrases are matched in. */
export function normalizeForMatch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * How many of the brief's key phrases the learner's replies contain (each counted once). Containment on whole words,
 * so "I have experience in" matches inside a longer sentence but "in" never matches inside "pain". Only the number
 * leaves this function. `total` skips a phrase that normalises to nothing, and a repeated phrase.
 */
export function countKeyPhrases(
  phrases: readonly string[],
  learnerReplies: readonly string[],
): { used: number; total: number } {
  const haystack = ` ${learnerReplies.map(normalizeForMatch).join(" | ")} `;
  let used = 0;
  let total = 0;
  const seen = new Set<string>();
  for (const p of phrases) {
    const n = normalizeForMatch(p);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    total += 1;
    if (haystack.includes(` ${n} `)) used += 1;
  }
  return { used, total };
}

/** Positive: better than last time, or (no worse and a majority). English is the other way round: lower is better. */
export function isPositive(n: SpeakingNote): boolean {
  const { count, previous } = n;
  if (n.kind === "pauses") return false; // never a lead, so never "positive"
  if (n.kind === "english_fallback") return previous !== null && count < previous;
  if (previous !== null && count > previous) return true;
  return count * 2 >= n.total && (previous === null || count >= previous);
}

/**
 * The notes for a run, at most 3, positive ones first, then the rest, each group in the fixed kind order
 * (full replies, key phrases, English). A kind is left out when its total is 0, or when its count is 0 and it was 0 or
 * unknown last time (nothing to say). Undefined when no note is left.
 */
export function buildSpeaking(
  now: SpeakingSignals,
  prev: Partial<Record<SpeakingKind, number | null>> | null,
): RehearsalSpeaking | undefined {
  const raw: SpeakingNote[] = [
    {
      kind: "full_replies",
      count: now.full,
      total: now.replies,
      previous: prev?.full_replies ?? null,
    },
    {
      kind: "key_phrases",
      count: now.keyUsed,
      total: now.keyTotal,
      previous: prev?.key_phrases ?? null,
    },
    {
      kind: "english_fallback",
      count: now.english,
      total: now.replies,
      previous: prev?.english_fallback ?? null,
    },
  ];
  const kept = raw.filter(
    (n) =>
      Number.isInteger(n.count) &&
      n.total > 0 &&
      n.count >= 0 &&
      n.count <= n.total &&
      !(n.count === 0 && !n.previous),
  );
  const ordered = [...kept.filter(isPositive), ...kept.filter((n) => !isPositive(n))];
  let notes = ordered.slice(0, MAX_SPEAKING_NOTES);
  // The pause note (slice B2): only a strong signal, never the lead, always after the others. When three other notes
  // already fill the cap, the LAST of them (the least positive) yields its place; the first two stay.
  const { slow, measured } = now;
  if (
    notes.length > 0 &&
    slow !== undefined &&
    measured !== undefined &&
    Number.isInteger(slow) &&
    Number.isInteger(measured) &&
    slow >= MIN_SLOW_FOR_NOTE &&
    slow * 2 >= measured &&
    slow <= measured
  ) {
    const pauses: SpeakingNote = {
      kind: "pauses",
      count: slow,
      total: measured,
      previous: prev?.pauses ?? null,
    };
    notes = [...ordered.slice(0, MAX_SPEAKING_NOTES - 1), pauses];
  }
  return notes.length ? { notes } : undefined;
}

/** The notes of an answer, checked; null when the shape is wrong or nothing valid is left. */
export function parseSpeaking(v: unknown): RehearsalSpeaking | null {
  const notes = (v as { notes?: unknown } | null)?.notes;
  if (!Array.isArray(notes)) return null;
  const out: SpeakingNote[] = [];
  for (const n of notes.slice(0, MAX_SPEAKING_NOTES)) {
    const o = n as Partial<SpeakingNote> | null;
    if (
      !o ||
      !SPEAKING_KINDS.includes(o.kind as SpeakingKind) ||
      !Number.isInteger(o.count) ||
      !Number.isInteger(o.total) ||
      (o.previous !== null && !Number.isInteger(o.previous))
    )
      continue;
    out.push({ kind: o.kind!, count: o.count!, total: o.total!, previous: o.previous! });
  }
  return out.length ? { notes: out } : null;
}

export type Trend = "up" | "down" | "same" | null;
export const trendOf = (n: SpeakingNote): Trend =>
  n.previous === null ? null : n.count > n.previous ? "up" : n.count < n.previous ? "down" : "same";

/** What to try saying while thinking, in the course's language. */
const FILLERS: Record<Course, string> = {
  en: "Let me think…",
  fr: "Laissez-moi réfléchir…",
  es: "Déjeme pensar…",
};

const times = (c: number) => (c === 1 ? "once" : c === 2 ? "twice" : `${c} times`);
const since = (n: SpeakingNote) => {
  const t = trendOf(n);
  return t === null
    ? ""
    : t === "same"
      ? ", the same as last time"
      : `, ${t} from ${n.previous} last time`;
};

/** The plain sentence for a note. Neutral wording for a lower number: no blame. */
export function speakingSentence(n: SpeakingNote, course: Course = "en"): string {
  switch (n.kind) {
    case "full_replies":
      return `You answered in full sentences ${n.count} of ${n.total} times${since(n)}.`;
    case "english_fallback":
      return n.count === 0
        ? `You stayed in ${COURSES.find((c) => c.id === course)?.targetLanguage ?? "English"} the whole time${since(n)}.`
        : `You switched to English ${times(n.count)}${since(n)}.`;
    case "pauses":
      return `You took a moment before ${n.count} of ${n.total} answers. That's fine; next time try starting with “${FILLERS[course]}”.`;
    case "key_phrases":
      return `You used ${n.count} of your ${n.total} key ${n.total === 1 ? "phrase" : "phrases"}${since(n)}.`;
  }
}

export const SPEAKING_TITLES: Record<SpeakingKind, string> = {
  full_replies: "Full sentences",
  key_phrases: "Your key phrases",
  english_fallback: "Switching to English",
  pauses: "Taking a moment",
};
