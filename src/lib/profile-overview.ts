import {
  ACHIEVEMENTS,
  LEAGUE_TIERS,
  type Achievement,
  type LeagueTier,
} from "../data/achievements";
import { getCourse, type Course } from "../data/courses";
import type { Level } from "../data/levels";
import { vocabForLesson } from "../data/vocab";
import { LEVEL_ORDER } from "./learning-goal";
import { LEAGUE_THRESHOLDS } from "./progress-math";
import { dailyGoalProgress } from "./profile-data";
import type { LearningDayRow, LeagueStanding, SkillDayRow } from "./profile-data";

/**
 * The Profile (visual round 6, BACKLOG 0.0-bi): the rows the server function reads (profile.functions.ts), and the
 * pure rules that turn them into what the page shows. Every number on Profile comes through here from a row; none is
 * typed in (src/lib/profile-no-hardcoded-values.test.ts).
 *
 * The day: the streak, activity_days and speech_days all book a day as the UTC date of the server clock
 * (sync.functions.ts todayStr, 20261106100000_speech_days.sql). The learner's calendar on Profile uses that same day,
 * so the heat map, the week rings and the streak can never disagree about which day a lesson counted for.
 */

export type ActivityRow = { day: string; xp: number };
export type SpeechRow = { day: string; seconds: number };
export type CompletionRow = { lessonId: string; language: string; correct: number; total: number };
export type WeakItem = { label: string; display: string; lapses: number; repetitions: number };
export type WeaknessEventRow = { category: string; event_type: string; created_at: string };
export type FriendRow = {
  userId: string;
  displayName: string;
  avatarSeed: string;
  streak: number;
  weekXp: number;
};

export type ProfileOverview = {
  /** The server's streak day (UTC), so the page and the rows agree on "today". */
  today: string;
  course: Course;
  profile: {
    displayName: string | null;
    avatarSeed: string | null;
    /** Set only while the learner's flag is on (learner-profile.functions.ts keeps it that way). */
    country: string | null;
    createdAt: string | null;
  };
  courses: { course: Course; xp: number; cefrLevel: string; leagueTier: LeagueTier }[];
  progress: { streak: number; longestStreak: number; streakFreezes: number };
  completions: CompletionRow[];
  /** activity_days in the heat-map window (and so this week). */
  activity: ActivityRow[];
  /** The learner's best single day of XP, ever. */
  bestDayXp: number;
  /** speech_days for this week. */
  speech: SpeechRow[];
  /** This course's open weak-spot review items. */
  weakItems: WeakItem[];
  /** This course's saved words still in review. */
  savedWords: number;
  /** weakness_events: what Hector is primed with (TutorMemoryContext). */
  weaknessEvents: WeaknessEventRow[];
  achievements: { id: string; progress: number; unlockedAt: string | null }[];
  friends: FriendRow[];
  /** lesson and practice seconds per day this week (learning_days). */
  learning: LearningDayRow[];
  /** This course's saved words that review retired and the learner mastered (kept in mastered_words). */
  masteredWords: number;
  /** This week's rank among the learner's league tier on this course; null when there is no progress row yet. */
  league: LeagueStanding | null;
  /** The learner's stored IANA time zone; null until a device reports one. Streaks and days stay UTC. */
  timeZone: string | null;
  /** Right and total answers per skill per day over SKILL_WINDOW_DAYS (skill_days); score them with skillScores. */
  skills: SkillDayRow[];
  /** The daily minutes the learner chose in first run (learner_profile.dailyMinutes: 5, 10, 15 or 20); null if never chosen. */
  dailyGoalMinutes: number | null;
};

const DAY_MS = 86_400_000;
const dayNum = (day: string) => Math.floor(Date.parse(`${day}T00:00:00Z`) / DAY_MS);
const fromNum = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10);
export const addDays = (day: string, n: number) => fromNum(dayNum(day) + n);

/** Today as the streak counts it: the UTC calendar date. */
export function streakToday(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Monday of the ISO week holding `day`. */
export function weekStart(day: string): string {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
  return addDays(day, -((dow + 6) % 7));
}

/** The heat map's span, in calendar months (owner decision, BACKLOG 0.0-bi). */
export const HEAT_MAP_MONTHS = 3;
/** The friends board's week: get_friends_progress sums the last 7 days including today. */
export const FRIENDS_WEEK_DAYS = 7;

/** Exactly HEAT_MAP_MONTHS calendar months ending today: the day after the same date 3 months ago (clamped to the month's end). */
export function threeMonthsWindow(today: string): { start: string; end: string } {
  const [y, m, d] = today.split("-").map(Number) as [number, number, number];
  const monthIndex = m - 1 - HEAT_MAP_MONTHS;
  const lastDay = new Date(Date.UTC(y, monthIndex + 1, 0)).getUTCDate();
  const back = new Date(Date.UTC(y, monthIndex, Math.min(d, lastDay))).toISOString().slice(0, 10);
  return { start: addDays(back, 1), end: today };
}

export type HeatCell = { day: string; xp: number; level: 0 | 1 | 2 | 3 | 4; inRange: boolean };

/** Monday-first week columns over the 3-month window. Level is the day's XP against the learner's best day in it. */
export function heatMap(
  today: string,
  rows: ActivityRow[],
): { weeks: HeatCell[][]; activeDays: number; start: string; end: string } {
  const { start, end } = threeMonthsWindow(today);
  const xpByDay = new Map<string, number>();
  for (const r of rows) {
    if (r.day >= start && r.day <= end) xpByDay.set(r.day, (xpByDay.get(r.day) ?? 0) + r.xp);
  }
  const max = Math.max(0, ...xpByDay.values());
  const weeks: HeatCell[][] = [];
  for (let w = weekStart(start); w <= end; w = addDays(w, 7)) {
    weeks.push(
      Array.from({ length: 7 }, (_, i) => {
        const day = addDays(w, i);
        const inRange = day >= start && day <= end;
        const xp = inRange ? (xpByDay.get(day) ?? 0) : 0;
        const level =
          xp > 0 && max > 0 ? (Math.min(4, Math.max(1, Math.ceil((4 * xp) / max))) as 1) : 0;
        return { day, xp, level, inRange };
      }),
    );
  }
  const activeDays = [...xpByDay.values()].filter((xp) => xp > 0).length;
  return { weeks, activeDays, start, end };
}

export type RingDay = {
  day: string;
  xp: number;
  seconds: number;
  state: "done" | "missed" | "today" | "future";
};

/** This week, Monday to Sunday. A day is done when it earned XP: the same rule that keeps the streak alive. */
export function weekRings(
  today: string,
  activity: ActivityRow[],
  speech: SpeechRow[],
): { days: RingDay[]; activeDays: number; minutesSpoken: number } {
  const monday = weekStart(today);
  const xp = new Map(activity.map((r) => [r.day, r.xp]));
  const spoken = new Map(speech.map((r) => [r.day, r.seconds]));
  const days = Array.from({ length: 7 }, (_, i): RingDay => {
    const day = addDays(monday, i);
    const dayXp = xp.get(day) ?? 0;
    const state = day > today ? "future" : dayXp > 0 ? "done" : day === today ? "today" : "missed";
    return { day, xp: dayXp, seconds: day > today ? 0 : (spoken.get(day) ?? 0), state };
  });
  const seconds = days.reduce((s, d) => s + d.seconds, 0);
  return {
    days,
    activeDays: days.filter((d) => d.xp > 0).length,
    minutesSpoken: Math.round(seconds / 60),
  };
}

/**
 * This week's rings against the learner's own daily goal in learning minutes (lesson + practice time, learning_days).
 * A day is done when its minutes reach the goal. The streak is NOT computed here: it keeps its XP rule.
 */
export function goalRings(
  today: string,
  learning: LearningDayRow[],
  goalMinutes: number,
): { days: GoalRingDay[]; metDays: number } {
  const monday = weekStart(today);
  const days = Array.from({ length: 7 }, (_, i): GoalRingDay => {
    const day = addDays(monday, i);
    const p = dailyGoalProgress(learning, day, goalMinutes);
    const state = day > today ? "future" : p.reached ? "done" : day === today ? "today" : "missed";
    return { day, minutes: day > today ? 0 : p.minutes, goalMinutes, state };
  });
  return { days, metDays: days.filter((d) => d.state === "done").length };
}
export type GoalRingDay = {
  day: string;
  minutes: number;
  goalMinutes: number;
  state: "done" | "missed" | "today" | "future";
};

export type BigNumbers = {
  streak: number;
  longestStreak: number;
  courseXp: number;
  /** XP across every course: the same scope as xpThisWeek (activity_days is account-wide), so the two always agree. */
  totalXp: number;
  xpThisWeek: number;
  wordsLearned: number;
  /** Saved words that review retired and the learner mastered (mastered_words). */
  masteredWords: number;
  savedWords: number;
  lessonsDone: number;
  accuracyPct: number | null;
};

export function bigNumbers(o: ProfileOverview): BigNumbers {
  const mine = o.completions.filter((c) => c.language === o.course);
  const correct = mine.reduce((s, c) => s + c.correct, 0);
  const total = mine.reduce((s, c) => s + c.total, 0);
  const words = new Set(
    mine.flatMap((c) => vocabForLesson(c.lessonId, o.course).map((v) => v.term.toLowerCase())),
  );
  const monday = weekStart(o.today);
  return {
    streak: o.progress.streak,
    longestStreak: o.progress.longestStreak,
    courseXp: o.courses.find((c) => c.course === o.course)?.xp ?? 0,
    totalXp: o.courses.reduce((s, c) => s + c.xp, 0),
    xpThisWeek: o.activity
      .filter((r) => r.day >= monday && r.day <= o.today)
      .reduce((s, r) => s + r.xp, 0),
    wordsLearned: words.size,
    masteredWords: o.masteredWords,
    savedWords: o.savedWords,
    lessonsDone: mine.length,
    accuracyPct: total > 0 ? Math.round((100 * correct) / total) : null,
  };
}

export function personalRecords(o: ProfileOverview) {
  return {
    bestDayXp: o.bestDayXp,
    bestStreak: o.progress.longestStreak,
    perfectLessons: o.completions.filter((c) => c.total > 0 && c.correct === c.total).length,
  };
}

export type LevelProgress = {
  level: Level;
  next: Level | null;
  done: number;
  total: number;
  pct: number;
  unitsLeft: number;
};

/** This level's lessons done out of all of them, and the units not yet finished. */
export function levelProgress(course: Course, cefr: string, completedIds: string[]): LevelProgress {
  const level = (LEVEL_ORDER as string[]).includes(cefr) ? (cefr as Level) : "A1";
  const done = new Set(completedIds);
  const units = getCourse(course).unitsForLevel(level);
  const lessons = units.flatMap((u) => u.lessons);
  const finished = lessons.filter((l) => done.has(l.id)).length;
  return {
    level,
    next: LEVEL_ORDER[LEVEL_ORDER.indexOf(level) + 1] ?? null,
    done: finished,
    total: lessons.length,
    pct: lessons.length ? Math.round((100 * finished) / lessons.length) : 0,
    unitsLeft: units.filter((u) => !u.lessons.every((l) => done.has(l.id))).length,
  };
}

/** The weak spots to fix first: the most-missed, then the least-practiced. */
export function weakSpots(items: WeakItem[], n = 3): { top: WeakItem[]; total: number } {
  const sorted = [...items].sort((a, b) => b.lapses - a.lapses || a.repetitions - b.repetitions);
  return { top: sorted.slice(0, n), total: items.length };
}

/** Open weakness categories, most open first (the getWeaknessTrend rule: detected minus resolved). */
export function openMemoryCategories(events: WeaknessEventRow[]): string[] {
  const by = new Map<string, { open: number; last: string }>();
  for (const e of events) {
    const v = by.get(e.category) ?? { open: 0, last: e.created_at };
    v.open += e.event_type === "detected" ? 1 : -1;
    v.last = e.created_at > v.last ? e.created_at : v.last;
    by.set(e.category, v);
  }
  return [...by.entries()]
    .filter(([, v]) => v.open > 0)
    .sort((a, b) => b[1].open - a[1].open || b[1].last.localeCompare(a[1].last))
    .map(([c]) => c);
}

export type HectorCard =
  { kind: "pro"; topics: string[] } | { kind: "teaser"; topics: string[] } | null;

/**
 * "Hector noticed". Pro: the open weakness categories Hector is primed with between calls (TutorMemoryContext).
 * Free: a teaser built ONLY from the learner's own weak spots on this course; it never reads Hector's memory, and
 * with no weak spot there is nothing true to say, so there is no card.
 */
export function hectorCard(input: {
  pro: boolean;
  weakItems: WeakItem[];
  weaknessEvents: WeaknessEventRow[];
}): HectorCard {
  if (input.pro) {
    const topics = openMemoryCategories(input.weaknessEvents)
      .slice(0, 2)
      .map((c) => c.replace(/-/g, " "));
    return topics.length ? { kind: "pro", topics } : null;
  }
  const topics = weakSpots(input.weakItems, 2).top.map((w) => w.display);
  return topics.length ? { kind: "teaser", topics } : null;
}

/** "a", "a and b". */
export function joinTopics(topics: string[]): string {
  return topics.length <= 1
    ? (topics[0] ?? "")
    : `${topics.slice(0, -1).join(", ")} and ${topics.at(-1)}`;
}

export type AchievementStats = Record<
  "streak" | "xp" | "perfect" | "lessons" | "league" | "freeze",
  number
>;

export function achievementStats(o: ProfileOverview): AchievementStats {
  const leagueProgress = Math.max(
    0,
    ...o.achievements.filter((a) => a.id.startsWith("league_")).map((a) => a.progress),
  );
  return {
    streak: o.progress.streak,
    // A badge unlocks when any one course's XP passes the threshold (completeLessonRemote's stats.xp).
    xp: Math.max(0, ...o.courses.map((c) => c.xp)),
    perfect: personalRecords(o).perfectLessons,
    lessons: o.completions.length,
    league: leagueProgress,
    freeze: o.progress.streakFreezes,
  };
}

/** The locked badge closest to done. The team badge is granted by the server only, so it is never "in reach". */
export function nextAchievement(
  stats: AchievementStats,
  unlocked: string[],
): { achievement: Achievement; value: number } | null {
  const have = new Set(unlocked);
  let best: { achievement: Achievement; value: number; ratio: number } | null = null;
  for (const a of ACHIEVEMENTS) {
    if (a.category === "team" || have.has(a.id)) continue;
    const value = stats[a.category];
    const ratio = value / a.threshold;
    if (ratio >= 1) continue;
    if (!best || ratio > best.ratio) best = { achievement: a, value, ratio };
  }
  return best && { achievement: best.achievement, value: best.value };
}

/** League tiers are promoted by this course's XP passing LEAGUE_THRESHOLDS, never demoted. */
export function leagueStatus(tier: LeagueTier, courseXp: number) {
  const idx = LEAGUE_TIERS.indexOf(tier);
  const next = LEAGUE_TIERS[idx + 1] ?? null;
  return {
    tier,
    next,
    xpToNext: next ? Math.max(0, LEAGUE_THRESHOLDS[idx + 1]! - courseXp) : 0,
  };
}

/** The friends board's week (get_friends_progress): the last 7 days including today. */
export function rollingWeekXp(today: string, activity: ActivityRow[]): number {
  const from = addDays(today, -(FRIENDS_WEEK_DAYS - 1));
  return activity.filter((r) => r.day >= from && r.day <= today).reduce((s, r) => s + r.xp, 0);
}

export type FriendWeekRow = {
  key: string;
  displayName: string;
  avatarSeed: string;
  weekXp: number;
  isYou: boolean;
};

export function friendsWeek(
  friends: FriendRow[],
  me: { displayName: string; avatarSeed: string; weekXp: number },
  max = 5,
): FriendWeekRow[] {
  const rows: FriendWeekRow[] = [
    ...friends.map((f) => ({
      key: f.userId,
      displayName: f.displayName,
      avatarSeed: f.avatarSeed,
      weekXp: f.weekXp,
      isYou: false,
    })),
    { key: "you", ...me, isYou: true },
  ].sort((a, b) => b.weekXp - a.weekXp || Number(b.isYou) - Number(a.isYou));
  if (rows.length <= max) return rows;
  const you = rows.findIndex((r) => r.isYou);
  return you < max ? rows.slice(0, max) : [...rows.slice(0, max - 1), rows[you]!];
}
