/**
 * "How you spoke": the speaking notes after a rehearsal run. Pure, no I/O; the server builds them from counts and
 * the web renders them. Counts only: no learner word is ever stored or sent, and there is no score, percentage or grade.
 *
 * The server stores, per run, how many learner replies there were, how many were a full answer (measureReply: not
 * short), how many fell back to English, and how many of the brief's key phrases the learner used. The note for a run
 * compares each count with the same count from the learner's previous finished run of the same stage.
 */
import { COURSES, type Course } from "../data/course-meta";

export type SpeakingKind = "full_replies" | "english_fallback" | "key_phrases";
/** The fixed order of kinds inside a group of notes. */
export const SPEAKING_KINDS: readonly SpeakingKind[] = [
  "full_replies",
  "key_phrases",
  "english_fallback",
];
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
  const notes = ordered.slice(0, MAX_SPEAKING_NOTES);
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
    case "key_phrases":
      return `You used ${n.count} of your ${n.total} key ${n.total === 1 ? "phrase" : "phrases"}${since(n)}.`;
  }
}

export const SPEAKING_TITLES: Record<SpeakingKind, string> = {
  full_replies: "Full sentences",
  key_phrases: "Your key phrases",
  english_fallback: "Switching to English",
};
