import { describe, expect, it } from "vitest";
import { ACHIEVEMENTS } from "../data/achievements";
import { getCourse } from "../data/courses";
import { vocabForLesson } from "../data/vocab";
import {
  bigNumbers,
  friendsWeek,
  heatMap,
  hectorCard,
  leagueStatus,
  levelProgress,
  nextAchievement,
  openMemoryCategories,
  personalRecords,
  rollingWeekXp,
  streakToday,
  threeMonthsWindow,
  weakSpots,
  weekRings,
  type ProfileOverview,
} from "./profile-overview";

const ES = getCourse("es")
  .unitsForLevel("A1")[0]!
  .lessons.map((l) => l.id);
const EN = getCourse("en")
  .unitsForLevel("A1")[0]!
  .lessons.map((l) => l.id);

/** A learner with a little of everything, built from rows the way the server function returns them. */
function overview(over: Partial<ProfileOverview> = {}): ProfileOverview {
  return {
    today: "2026-11-06",
    course: "es",
    profile: {
      displayName: "Sam",
      avatarSeed: "animal:fox",
      country: "CA",
      createdAt: "2026-10-02T10:00:00Z",
    },
    courses: [
      { course: "en", xp: 300, cefrLevel: "A2", leagueTier: "silver" },
      { course: "es", xp: 4820, cefrLevel: "B1", leagueTier: "ruby" },
    ],
    progress: { streak: 12, longestStreak: 21, streakFreezes: 1 },
    completions: [
      { lessonId: ES[0]!, language: "es", correct: 8, total: 8 },
      { lessonId: ES[1]!, language: "es", correct: 6, total: 8 },
      { lessonId: EN[0]!, language: "en", correct: 8, total: 8 },
    ],
    activity: [
      { day: "2026-11-02", xp: 60 },
      { day: "2026-11-03", xp: 120 },
      { day: "2026-11-05", xp: 40 },
      { day: "2026-10-30", xp: 30 },
    ],
    bestDayXp: 180,
    speech: [
      { day: "2026-11-02", seconds: 600 },
      { day: "2026-11-06", seconds: 330 },
    ],
    weakItems: [],
    savedWords: 34,
    weaknessEvents: [],
    achievements: [],
    friends: [],
    learning: [],
    masteredWords: 0,
    league: null,
    timeZone: null,
    skills: [],
    ...over,
  };
}

describe("the learner's day is the streak's day (UTC)", () => {
  it("late evening west of UTC is already tomorrow, as it is for the streak", () => {
    // 8 pm in Vancouver on 5 November is 04:00 UTC on 6 November: activity_days books that XP on the 6th.
    expect(streakToday(new Date("2026-11-05T20:00:00-08:00"))).toBe("2026-11-06");
  });
  it("early morning east of UTC is still yesterday", () => {
    expect(streakToday(new Date("2026-11-06T01:00:00+05:00"))).toBe("2026-11-05");
  });
});

describe("the heat map spans exactly 3 months", () => {
  it("from the day after the same date 3 months ago up to today", () => {
    expect(threeMonthsWindow("2026-11-06")).toEqual({ start: "2026-08-07", end: "2026-11-06" });
  });
  it("clamps month ends (31 May minus 3 months is 28 February)", () => {
    expect(threeMonthsWindow("2027-05-31")).toEqual({ start: "2027-03-01", end: "2027-05-31" });
  });
  it("covers every day in the window once, in Monday-first weeks, and nothing outside it", () => {
    const map = heatMap("2026-11-06", []);
    const cells = map.weeks.flat();
    const inRange = cells.filter((c) => c.inRange).map((c) => c.day);
    expect(inRange[0]).toBe("2026-08-07");
    expect(inRange.at(-1)).toBe("2026-11-06");
    expect(new Set(inRange).size).toBe(92);
    // Every week is a full Monday-to-Sunday column.
    for (const w of map.weeks) {
      expect(w).toHaveLength(7);
      expect(new Date(`${w[0].day}T00:00:00Z`).getUTCDay()).toBe(1);
    }
  });
  it("puts a day's XP on that day, and ignores rows outside the window", () => {
    const map = heatMap("2026-11-06", [
      { day: "2026-11-03", xp: 120 },
      { day: "2026-11-02", xp: 30 },
      { day: "2026-08-06", xp: 999 },
    ]);
    const cells = new Map(map.weeks.flat().map((c) => [c.day, c]));
    expect(cells.get("2026-11-03")).toMatchObject({ xp: 120, level: 4 });
    expect(cells.get("2026-11-02")).toMatchObject({ xp: 30, level: 1 });
    expect(cells.get("2026-08-06")?.inRange ?? false).toBe(false);
    expect(map.activeDays).toBe(2);
  });
});

describe("week rings", () => {
  it("Monday to Sunday of this week: done on a day with XP, today marked, later days still to come", () => {
    const rings = weekRings("2026-11-06", overview().activity, overview().speech);
    expect(rings.days.map((d) => d.day)).toEqual([
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
      "2026-11-05",
      "2026-11-06",
      "2026-11-07",
      "2026-11-08",
    ]);
    expect(rings.days.map((d) => d.state)).toEqual([
      "done",
      "done",
      "missed",
      "done",
      "today",
      "future",
      "future",
    ]);
    expect(rings.activeDays).toBe(3);
  });
  it("minutes spoken this week come from speech_days, rounded to whole minutes", () => {
    // 600 s + 330 s = 15.5 min; the 30 October row is last week.
    expect(weekRings("2026-11-06", [], overview().speech).minutesSpoken).toBe(16);
  });
});

describe("the four big numbers match their sources", () => {
  const o = overview();
  const n = bigNumbers(o);
  it("streak and longest from user_progress", () => {
    expect(n.streak).toBe(12);
    expect(n.longestStreak).toBe(21);
  });
  it("XP is this course's language_progress XP; this week is activity_days since Monday", () => {
    expect(n.courseXp).toBe(4820);
    expect(n.xpThisWeek).toBe(60 + 120 + 40);
  });
  it("total XP and this week's XP share one scope (all courses), so a course with 0 XP never shows less than the week", () => {
    const fr = overview({
      course: "fr",
      courses: [{ course: "en", xp: 300, cefrLevel: "A1", leagueTier: "bronze" }],
    });
    const b = bigNumbers(fr);
    expect(b.xpThisWeek).toBeGreaterThan(0);
    expect(b.totalXp).toBe(300);
    expect(b.totalXp).toBeGreaterThanOrEqual(b.xpThisWeek);
    expect(bigNumbers(o).totalXp).toBe(4820 + 300);
  });
  it("lessons and accuracy count this course's completions only", () => {
    expect(n.lessonsDone).toBe(2);
    expect(n.accuracyPct).toBe(Math.round((100 * 14) / 16));
  });
  it("words learned are the distinct words of this course's completed lessons", () => {
    const words = new Set(
      [ES[0]!, ES[1]!].flatMap((id) => vocabForLesson(id, "es").map((v) => v.term.toLowerCase())),
    );
    expect(n.wordsLearned).toBe(words.size);
    expect(n.wordsLearned).toBeGreaterThan(0);
    expect(n.savedWords).toBe(34);
  });
  it("a new learner has zeros and no accuracy, not NaN", () => {
    const empty = bigNumbers(
      overview({
        courses: [],
        progress: { streak: 0, longestStreak: 0, streakFreezes: 0 },
        completions: [],
        activity: [],
        savedWords: 0,
      }),
    );
    expect(empty).toEqual({
      streak: 0,
      longestStreak: 0,
      courseXp: 0,
      totalXp: 0,
      xpThisWeek: 0,
      wordsLearned: 0,
      savedWords: 0,
      lessonsDone: 0,
      accuracyPct: null,
    });
  });
});

describe("personal records", () => {
  it("best day, best streak, perfect lessons across all courses", () => {
    expect(personalRecords(overview())).toEqual({
      bestDayXp: 180,
      bestStreak: 21,
      perfectLessons: 2,
    });
  });
});

describe("level progress", () => {
  it("counts this level's lessons done out of all of them", () => {
    const units = getCourse("es").unitsForLevel("A1");
    const lessons = units.flatMap((u) => u.lessons.map((l) => l.id));
    const p = levelProgress("es", "A1", [lessons[0], lessons[1]]);
    expect(p).toMatchObject({ level: "A1", next: "A2", done: 2, total: lessons.length });
    expect(p.unitsLeft).toBe(
      units.length -
        units.filter((u) => u.lessons.every((l) => [lessons[0], lessons[1]].includes(l.id))).length,
    );
  });
  it("the top level has no next level", () => {
    expect(levelProgress("en", "C1", []).next).toBeNull();
  });
});

describe("weak spots", () => {
  it("the most-missed first, three at most", () => {
    const items = [
      { label: "articles", display: "Article gender", lapses: 1, repetitions: 0 },
      { label: "ser-estar", display: "Ser or estar", lapses: 4, repetitions: 1 },
      { label: "past", display: "Past tense endings", lapses: 2, repetitions: 0 },
      { label: "por-para", display: "Por or para", lapses: 0, repetitions: 2 },
    ];
    const w = weakSpots(items);
    expect(w.top.map((x) => x.display)).toEqual([
      "Ser or estar",
      "Past tense endings",
      "Article gender",
    ]);
    expect(w.total).toBe(4);
  });
});

describe("Hector noticed", () => {
  const weak = [{ label: "ser-estar", display: "Ser or estar", lapses: 3, repetitions: 0 }];
  const memory = [
    { category: "conditionals", event_type: "detected", created_at: "2026-11-01T00:00:00Z" },
    { category: "ser-estar", event_type: "detected", created_at: "2026-11-02T00:00:00Z" },
  ];

  it("a Pro learner sees what Hector is primed with: the open weakness categories", () => {
    const card = hectorCard({ pro: true, weakItems: weak, weaknessEvents: memory });
    expect(card).toEqual({ kind: "pro", topics: ["ser estar", "conditionals"] });
  });

  it("a free learner's teaser names only their real weak spots, never Hector's memory", () => {
    const card = hectorCard({ pro: false, weakItems: weak, weaknessEvents: memory });
    expect(card).toEqual({ kind: "teaser", topics: ["Ser or estar"] });
    expect(JSON.stringify(card)).not.toContain("conditionals");
  });

  it("a free learner with no weak spots gets no card, even when memory exists", () => {
    expect(hectorCard({ pro: false, weakItems: [], weaknessEvents: memory })).toBeNull();
  });

  it("a Pro learner with nothing open gets no invented observation", () => {
    const resolved = [
      ...memory,
      { category: "conditionals", event_type: "resolved", created_at: "2026-11-03T00:00:00Z" },
      { category: "ser-estar", event_type: "resolved", created_at: "2026-11-03T00:00:00Z" },
    ];
    expect(hectorCard({ pro: true, weakItems: [], weaknessEvents: resolved })).toBeNull();
  });

  it("open categories cancel detected against resolved", () => {
    expect(
      openMemoryCategories([
        { category: "a", event_type: "detected", created_at: "2026-11-01T00:00:00Z" },
        { category: "a", event_type: "resolved", created_at: "2026-11-02T00:00:00Z" },
        { category: "b", event_type: "detected", created_at: "2026-11-01T00:00:00Z" },
      ]),
    ).toEqual(["b"]);
  });
});

describe("achievements", () => {
  it("the next in reach is the locked one closest to done", () => {
    const next = nextAchievement(
      { streak: 12, xp: 4820, perfect: 2, lessons: 2, league: 0, freeze: 1 },
      ACHIEVEMENTS.filter((a) => a.category === "streak" && a.threshold <= 7).map((a) => a.id),
    );
    // streak 12/30 = 0.4; xp 4820/5000 would be closer if such a badge exists: check against the catalog itself.
    const candidates = ACHIEVEMENTS.filter(
      (a) => a.category !== "team" && !(a.category === "streak" && a.threshold <= 7),
    )
      .map((a) => {
        const v = { streak: 12, xp: 4820, perfect: 2, lessons: 2, league: 0, freeze: 1 }[
          a.category as "streak"
        ];
        return { a, r: v / a.threshold };
      })
      .filter((c) => c.r < 1)
      .sort((x, y) => y.r - x.r);
    expect(next?.achievement.id).toBe(candidates[0].a.id);
  });
  it("never offers the server-only team badge", () => {
    const allButTeam = ACHIEVEMENTS.filter((a) => a.category !== "team").map((a) => a.id);
    expect(
      nextAchievement(
        { streak: 0, xp: 0, perfect: 0, lessons: 0, league: 0, freeze: 0 },
        allButTeam,
      ),
    ).toBeNull();
  });
});

describe("league", () => {
  it("names the next tier and the XP to it from the promotion thresholds", () => {
    // ruby -> diamond at 8000 XP (progress-math LEAGUE_THRESHOLDS).
    expect(leagueStatus("ruby", 4820)).toMatchObject({
      tier: "ruby",
      next: "diamond",
      xpToNext: 3180,
    });
    expect(leagueStatus("diamond", 9000).next).toBeNull();
  });
});

describe("friends this week", () => {
  it("my XP uses the friends board's rule: the last 7 days including today", () => {
    // Friday 6 November: the 7 days are Saturday 31 October to today, across the Monday that starts the ISO week.
    const rows = [
      { day: "2026-10-30", xp: 500 }, // 8 days ago: out
      { day: "2026-10-31", xp: 25 }, // last Saturday: in, though it is last ISO week
      { day: "2026-11-01", xp: 15 }, // last Sunday: in
      { day: "2026-11-02", xp: 60 },
      { day: "2026-11-06", xp: 40 },
    ];
    expect(rollingWeekXp("2026-11-06", rows)).toBe(25 + 15 + 60 + 40);
  });
  it("ranks me among friends by that number", () => {
    const rows = friendsWeek(
      [
        { userId: "a", displayName: "Mina", avatarSeed: "x", streak: 3, weekXp: 520 },
        { userId: "b", displayName: "Jon", avatarSeed: "y", streak: 1, weekXp: 10 },
      ],
      { displayName: "Sam", avatarSeed: "animal:fox", weekXp: 250 },
    );
    expect(rows.map((r) => [r.displayName, r.isYou])).toEqual([
      ["Mina", false],
      ["Sam", true],
      ["Jon", false],
    ]);
  });
});
