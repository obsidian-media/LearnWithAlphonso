import { DAILY_MINUTES, GOALS, INTERESTS } from "./learner-profile";

/** The words on What Alphonso remembers. Pure, so the page and its tests agree. */

const DAY = 86_400_000;

/** "today", "yesterday", "2 days ago", "last week", "3 weeks ago", "2 months ago". */
export function agoLabel(iso: string, now: number = Date.now()): string {
  const days = Math.floor((now - Date.parse(iso)) / DAY);
  if (!Number.isFinite(days) || days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "last week";
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}

/** "Seen in 4 calls, last 2 days ago". */
export function mistakeNote(m: { seenCount: number; lastSeenAt: string }, now?: number): string {
  const calls = m.seenCount === 1 ? "1 call" : `${m.seenCount} calls`;
  const ago = agoLabel(m.lastSeenAt, now);
  // "last 2 days ago", "last week", "most recently today".
  const when =
    ago === "today" || ago === "yesterday"
      ? `most recently ${ago}`
      : ago.startsWith("last")
        ? ago
        : `last ${ago}`;
  return `Seen in ${calls}, ${when}`;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "3 mistakes, 4 phrases, 3 goals." */
export function memorySummary(counts: {
  mistakes: number;
  phrases: number;
  goals: number;
}): string {
  return `${plural(counts.mistakes, "mistake", "mistakes")}, ${plural(counts.phrases, "phrase", "phrases")}, ${plural(counts.goals, "goal", "goals")}.`;
}

export const GOAL_LABEL: Record<(typeof GOALS)[number], string> = {
  travel: "Travel",
  work: "Work",
  school: "School",
  family: "Family",
  exam: "An exam",
  fun: "Just for fun",
};
export const INTEREST_LABEL: Record<(typeof INTERESTS)[number], string> = {
  food: "Food",
  travel: "Travel",
  sport: "Sport",
  music: "Music",
  movies: "Movies and TV",
  business: "Business",
  tech: "Tech",
  nature: "Nature",
  art: "Art",
  family: "Family",
};

export type GoalLine = {
  /** Which answer it clears when removed. */
  key: "goal" | "dailyMinutes" | "interests";
  title: string;
  note: string;
};

export type Goals = { goal: string | null; dailyMinutes: number | null; interests: string[] };

/** "Food and music", "Food, music and art". */
function joinWords(words: string[]): string {
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}

/** The learner's own first-run answers as lines, in their words. Nothing is inferred. */
export function goalLines(g: Goals): GoalLine[] {
  const out: GoalLine[] = [];
  if (g.goal && g.goal in GOAL_LABEL) {
    out.push({
      key: "goal",
      title: GOAL_LABEL[g.goal as keyof typeof GOAL_LABEL],
      note: "You chose this when you started",
    });
  }
  if (g.dailyMinutes && (DAILY_MINUTES as readonly number[]).includes(g.dailyMinutes)) {
    out.push({
      key: "dailyMinutes",
      title: `${g.dailyMinutes} minutes a day`,
      note: "You chose this when you started",
    });
  }
  const interests = g.interests.filter(
    (i): i is keyof typeof INTEREST_LABEL => i in INTEREST_LABEL,
  );
  if (interests.length > 0) {
    const names = interests.map((i, k) =>
      k === 0 ? INTEREST_LABEL[i] : INTEREST_LABEL[i].toLowerCase(),
    );
    out.push({ key: "interests", title: joinWords(names), note: "Topics you picked" });
  }
  return out;
}

/** The patch that removes one goal line (the server clears that answer). */
export function removeGoalPatch(key: GoalLine["key"]) {
  return { clear: [key] };
}

/** Presets the learner can add from: only what they have not already answered. Never free text. */
export function addableGoals(g: Goals) {
  return {
    goals: g.goal ? [] : GOALS.map((id) => ({ id, label: GOAL_LABEL[id] })),
    minutes: g.dailyMinutes
      ? []
      : DAILY_MINUTES.map((m) => ({ id: m, label: `${m} minutes a day` })),
    interests: INTERESTS.filter((i) => !g.interests.includes(i)).map((id) => ({
      id,
      label: INTEREST_LABEL[id],
    })),
  };
}
