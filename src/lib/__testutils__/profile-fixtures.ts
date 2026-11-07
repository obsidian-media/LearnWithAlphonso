import { getCourse } from "../../data/courses";
import { addDays, threeMonthsWindow, weekStart, type ProfileOverview } from "../profile-overview";

/**
 * TEST DATA for Profile: the page tests and the screenshot run (e2e/profile-shots.spec.ts) use these learners.
 * They are made up and never written to any database.
 */

const TODAY = "2026-11-06";

function lessonsOf(level: "A1" | "A2" | "B1", take?: number): string[] {
  const ids = getCourse("es")
    .unitsForLevel(level)
    .flatMap((u) => u.lessons.map((l) => l.id));
  return take === undefined ? ids : ids.slice(0, take);
}

/** About 3 months of practice with a quieter start, deterministic. */
function activity(today: string): { day: string; xp: number }[] {
  const { start } = threeMonthsWindow(today);
  const rows: { day: string; xp: number }[] = [];
  const monday = weekStart(today);
  for (let d = start, i = 0; d <= today; d = addDays(d, 1), i++) {
    const v = (i * 7 + (i % 5) * 3) % 9;
    const early = i < 21;
    if (d >= monday) {
      // This week: Mon, Tue, Thu, Fri(today) done; Wed missed.
      const dow = (new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7;
      if (dow !== 2) rows.push({ day: d, xp: [60, 120, 0, 40, 120][dow] ?? 0 });
      continue;
    }
    if ((early && v > 6) || (!early && v !== 0)) rows.push({ day: d, xp: 20 + v * 18 });
  }
  return rows.filter((r) => r.xp > 0);
}

export function richLearner(over: Partial<ProfileOverview> = {}): ProfileOverview {
  const done = [...lessonsOf("A1"), ...lessonsOf("A2"), ...lessonsOf("B1", 9)];
  const monday = weekStart(TODAY);
  return {
    today: TODAY,
    course: "es",
    profile: {
      displayName: "Sam",
      avatarSeed: "animal:fox",
      country: "CA",
      createdAt: "2026-08-02T15:00:00Z",
    },
    courses: [
      { course: "en", xp: 640, cefrLevel: "A2", leagueTier: "silver" },
      { course: "fr", xp: 90, cefrLevel: "A1", leagueTier: "bronze" },
      { course: "es", xp: 4820, cefrLevel: "B1", leagueTier: "ruby" },
    ],
    progress: { streak: 12, longestStreak: 21, streakFreezes: 1 },
    completions: done.map((lessonId, i) => ({
      lessonId,
      language: "es",
      correct: i % 4 === 0 ? 7 : 8,
      total: 8,
    })),
    activity: activity(TODAY),
    bestDayXp: 180,
    speech: [
      { day: monday, seconds: 540 },
      { day: addDays(monday, 1), seconds: 780 },
      { day: addDays(monday, 3), seconds: 420 },
      { day: TODAY, seconds: 1020 },
    ],
    weakItems: [
      { label: "ser-estar", display: "Ser or estar", lapses: 6, repetitions: 0 },
      { label: "preterite-endings", display: "Past tense endings", lapses: 4, repetitions: 1 },
      { label: "article-gender", display: "Article gender", lapses: 3, repetitions: 1 },
      { label: "por-para", display: "Por or para", lapses: 1, repetitions: 2 },
      { label: "subjunctive", display: "Subjunctive after wishes", lapses: 1, repetitions: 0 },
    ],
    savedWords: 46,
    weaknessEvents: [
      { category: "ser-estar", event_type: "detected", created_at: "2026-10-20T10:00:00Z" },
      { category: "ser-estar", event_type: "detected", created_at: "2026-11-01T10:00:00Z" },
      { category: "reflexive-verbs", event_type: "detected", created_at: "2026-11-03T10:00:00Z" },
      { category: "articles", event_type: "detected", created_at: "2026-10-01T10:00:00Z" },
      { category: "articles", event_type: "resolved", created_at: "2026-10-12T10:00:00Z" },
    ],
    achievements: [
      ["xp_100", 100, "2026-08-04"],
      ["lessons_5", 5, "2026-08-06"],
      ["perfect_1", 1, "2026-08-06"],
      ["streak_3", 3, "2026-08-20"],
      ["xp_500", 500, "2026-08-28"],
      ["streak_7", 7, "2026-09-02"],
      ["league_promote_1", 1, "2026-09-03"],
      ["perfect_10", 10, "2026-09-15"],
      ["freeze_earn_1", 1, "2026-09-20"],
      ["lessons_25", 25, "2026-10-02"],
      ["xp_2000", 2000, "2026-10-08"],
      ["league_promote_3", 3, "2026-10-30"],
    ].map(([id, progress, day]) => ({
      id: id as string,
      progress: progress as number,
      unlockedAt: `${day as string}T10:00:00Z`,
    })),
    learning: [],
    masteredWords: 3,
    league: {
      leagueTier: "silver",
      rank: 4,
      size: 12,
      weekStart: "2026-11-02",
      weekEnd: "2026-11-08",
      weekXp: 80,
    },
    timeZone: "America/Toronto",
    skills: [],
    dailyGoalMinutes: 10,
    friends: [
      { userId: "f1", displayName: "Mina", avatarSeed: "animal:owl", streak: 30, weekXp: 520 },
      { userId: "f2", displayName: "Jon", avatarSeed: "j", streak: 2, weekXp: 210 },
      { userId: "f3", displayName: "Priya", avatarSeed: "animal:panda", streak: 5, weekXp: 95 },
    ],
    ...over,
  };
}

/** Signed up today: nothing done yet, no friends, no league movement. */
export function newLearner(over: Partial<ProfileOverview> = {}): ProfileOverview {
  return {
    today: TODAY,
    course: "en",
    profile: {
      displayName: "Alex",
      avatarSeed: "a",
      country: null,
      createdAt: "2026-11-06T09:00:00Z",
    },
    courses: [{ course: "en", xp: 0, cefrLevel: "A1", leagueTier: "bronze" }],
    progress: { streak: 0, longestStreak: 0, streakFreezes: 0 },
    completions: [],
    activity: [],
    bestDayXp: 0,
    speech: [],
    weakItems: [],
    savedWords: 0,
    weaknessEvents: [],
    achievements: [],
    friends: [],
    learning: [],
    masteredWords: 0,
    league: null,
    timeZone: null,
    skills: [],
    dailyGoalMinutes: null,
    ...over,
  };
}
