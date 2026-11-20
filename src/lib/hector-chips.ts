/**
 * Suggestion chips under Hector's greeting: generated from the same context the greeting uses (the open weak spot,
 * the streak), with a fixed set when there is none. Tapping one sends its `message` as the learner's turn.
 *
 * Mirrored on iOS (LearnWithAlphonsoKit/HectorChips.swift) and Android (core/logic/HectorChips.kt);
 * shared/hector-chips.json holds the inputs and expected outputs all three test suites replay. Chip text is English
 * app copy; only the topic name inside a message comes from the greeting's table, so it is in the course language.
 */
import type { Course } from "@/data/courses";
import { hectorTopicLabel } from "@/lib/hector-greeting";

export type HectorChipIcon = "flame" | "coffee" | "book" | "chat";
export type HectorChip = { id: string; label: string; message: string; icon: HectorChipIcon };

const COFFEE: HectorChip = {
  id: "coffee",
  label: "Roleplay: ordering coffee",
  message: "Let's roleplay ordering coffee.",
  icon: "coffee",
};
const EXPLAIN: HectorChip = {
  id: "explain",
  label: "Explain a rule",
  message: "Can you explain a grammar rule to me?",
  icon: "book",
};
const CHAT: HectorChip = {
  id: "chat",
  label: "Just chat",
  message: "Let's just chat.",
  icon: "chat",
};
const WEAK_PLAIN: HectorChip = {
  id: "weakWords",
  label: "Practice my weak words",
  message: "Let's practice my weak words.",
  icon: "flame",
};

/** The set shown when there is no context. */
export const FALLBACK_HECTOR_CHIPS: readonly HectorChip[] = [WEAK_PLAIN, COFFEE, EXPLAIN, CHAT];

/** A roleplay tied to the weak spot's topic; a topic with none gets the coffee one. */
const ROLEPLAYS: Readonly<Record<string, HectorChip>> = {
  "past-tense": {
    id: "roleplay-weekend",
    label: "Roleplay: my weekend",
    message: "Let's roleplay: I tell you about my weekend.",
    icon: "coffee",
  },
  prepositions: {
    id: "roleplay-directions",
    label: "Roleplay: asking for directions",
    message: "Let's roleplay asking for directions.",
    icon: "coffee",
  },
  "question-formation": {
    id: "roleplay-interview",
    label: "Roleplay: a job interview",
    message: "Let's roleplay a job interview.",
    icon: "coffee",
  },
  "modal-verbs": {
    id: "roleplay-requests",
    label: "Roleplay: polite requests",
    message: "Let's roleplay making polite requests.",
    icon: "coffee",
  },
  conditionals: {
    id: "roleplay-trip",
    label: "Roleplay: planning a trip",
    message: "Let's roleplay planning a trip.",
    icon: "coffee",
  },
};

const MAX_CHIPS = 4;

export function hectorChips(input: {
  course: Course;
  weakSpot: unknown;
  streakDays: number;
}): HectorChip[] {
  const topic = hectorTopicLabel(input.course, input.weakSpot);
  const streak = Number.isFinite(input.streakDays) ? Math.floor(input.streakDays) : 0;
  const out: HectorChip[] = [];
  if (topic) {
    out.push({ ...WEAK_PLAIN, message: `Let's practice ${topic}.` });
    const key = String(input.weakSpot).trim().toLowerCase();
    out.push(Object.hasOwn(ROLEPLAYS, key) ? ROLEPLAYS[key] : COFFEE);
  }
  if (streak >= 2) {
    out.push({
      id: "streak",
      label: `Keep my ${streak}-day streak`,
      message: `Let's do a quick practice to keep my ${streak}-day streak going.`,
      icon: "flame",
    });
  }
  if (out.length === 0) return [...FALLBACK_HECTOR_CHIPS];
  for (const c of [COFFEE, EXPLAIN, CHAT]) {
    if (out.length >= MAX_CHIPS) break;
    if (!out.some((o) => o.id === c.id)) out.push(c);
  }
  return out.slice(0, MAX_CHIPS);
}
