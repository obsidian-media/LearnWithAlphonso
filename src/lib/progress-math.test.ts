import { describe, expect, it } from "vitest";
import {
  computeLeaguePromotion,
  computeLessonReplayXp,
  computeStreakUpdate,
  computeXpGain,
  deriveLessonCompletion,
  LEAGUES,
} from "./progress-math";

describe("computeXpGain", () => {
  it("awards 10 xp per correct answer", () => {
    expect(computeXpGain(3, 5)).toBe(30);
  });

  it("adds a 20xp perfect-lesson bonus when every answer is correct", () => {
    expect(computeXpGain(5, 5)).toBe(70);
  });

  it("awards nothing for zero correct answers", () => {
    expect(computeXpGain(0, 6)).toBe(0);
  });
});

describe("computeStreakUpdate", () => {
  const base = { today: "2026-09-13", streak: 4, longestStreak: 10, freezes: 1 };

  it("makes no change on a repeat activity the same day", () => {
    const result = computeStreakUpdate({ ...base, lastActiveDate: "2026-09-13" });
    expect(result).toEqual({ streak: 4, longestStreak: 10, freezes: 1 });
  });

  it("starts a new streak at 1 on first-ever activity", () => {
    const result = computeStreakUpdate({ ...base, lastActiveDate: null });
    expect(result.streak).toBe(1);
    expect(result.freezes).toBe(1);
  });

  it("extends the streak by one on a consecutive day", () => {
    const result = computeStreakUpdate({ ...base, lastActiveDate: "2026-09-12" });
    expect(result.streak).toBe(5);
    expect(result.longestStreak).toBe(10);
  });

  it("bridges a missed day by spending a freeze when one is available", () => {
    const result = computeStreakUpdate({ ...base, lastActiveDate: "2026-09-11" });
    expect(result.streak).toBe(5);
    expect(result.freezes).toBe(0);
  });

  it("resets to 1 across a missed day with no freeze available", () => {
    const result = computeStreakUpdate({ ...base, lastActiveDate: "2026-09-11", freezes: 0 });
    expect(result.streak).toBe(1);
    expect(result.freezes).toBe(0);
  });

  it("resets to 1 after a gap wider than 2 days regardless of freezes", () => {
    const result = computeStreakUpdate({ ...base, lastActiveDate: "2026-09-01" });
    expect(result.streak).toBe(1);
  });

  it("raises longestStreak when the new streak exceeds it", () => {
    const result = computeStreakUpdate({
      ...base,
      streak: 10,
      longestStreak: 10,
      lastActiveDate: "2026-09-12",
    });
    expect(result.longestStreak).toBe(11);
  });

  it("awards a bonus freeze on every 10th streak day", () => {
    const result = computeStreakUpdate({
      today: "2026-09-13",
      streak: 9,
      longestStreak: 9,
      freezes: 0,
      lastActiveDate: "2026-09-12",
    });
    expect(result.streak).toBe(10);
    expect(result.freezes).toBe(1);
  });

  it("does not award a freeze when the streak resets on a milestone-adjacent count", () => {
    const result = computeStreakUpdate({
      today: "2026-09-13",
      streak: 9,
      longestStreak: 9,
      freezes: 0,
      lastActiveDate: "2026-09-01",
    });
    expect(result.streak).toBe(1);
    expect(result.freezes).toBe(0);
  });
});

describe("computeLeaguePromotion", () => {
  it("stays in bronze below the first threshold", () => {
    expect(computeLeaguePromotion(50, 0)).toEqual({ leagueTier: "bronze", newIdx: 0 });
  });

  it("promotes to the highest league whose threshold is met", () => {
    expect(computeLeaguePromotion(3200, 0)).toEqual({ leagueTier: "ruby", newIdx: 3 });
  });

  it("promotes all the way to diamond at the top threshold", () => {
    expect(computeLeaguePromotion(8000, 0)).toEqual({ leagueTier: "diamond", newIdx: 4 });
  });

  it("never demotes even if xp math were to imply a lower league", () => {
    const diamondIdx = LEAGUES.indexOf("diamond");
    expect(computeLeaguePromotion(0, diamondIdx)).toEqual({
      leagueTier: "diamond",
      newIdx: diamondIdx,
    });
  });
});

describe("deriveLessonCompletion", () => {
  const lesson = { questions: [{ id: "q1" }, { id: "q2" }, { id: "q3" }] };

  it("derives correct as total minus the real missed questions", () => {
    expect(deriveLessonCompletion(lesson, 3, ["q2"])).toEqual({ correct: 2 });
  });

  it("dedupes repeated missed-question ids before deriving correct", () => {
    expect(deriveLessonCompletion(lesson, 3, ["q2", "q2", "q2"])).toEqual({ correct: 2 });
  });

  it("treats zero misses as a perfect score", () => {
    expect(deriveLessonCompletion(lesson, 3, [])).toEqual({ correct: 3 });
  });

  it("treats every question missed as a zero score", () => {
    expect(deriveLessonCompletion(lesson, 3, ["q1", "q2", "q3"])).toEqual({ correct: 0 });
  });

  it("rejects a total that doesn't match the lesson's real question count", () => {
    expect(() => deriveLessonCompletion(lesson, 5, [])).toThrow(
      "Invalid lesson completion payload",
    );
  });

  it("rejects a missed-question id that doesn't belong to this lesson", () => {
    expect(() => deriveLessonCompletion(lesson, 3, ["not-a-real-question"])).toThrow(
      "Invalid lesson completion payload",
    );
  });

  it("rejects more distinct missed ids than the lesson has questions", () => {
    const tiny = { questions: [{ id: "q1" }] };
    expect(() => deriveLessonCompletion(tiny, 1, ["q1", "not-a-real-question"])).toThrow(
      "Invalid lesson completion payload",
    );
  });
});

describe("computeLessonReplayXp", () => {
  it("awards full XP for a genuine first completion", () => {
    // 5/5 correct: computeXpGain(5,5) = 5*10 + 20 = 70
    expect(computeLessonReplayXp(null, 5, 5)).toEqual({
      bestCorrect: 5,
      bestXp: 70,
      xpGain: 70,
    });
  });

  it("awards zero XP on an exact repeat of the same score -- the replay-farming fix", () => {
    // Previously completeLessonRemote had no dedup check at all, so a
    // scripted loop of the same completion farmed 70 XP every call.
    expect(computeLessonReplayXp({ correct: 5, xpEarned: 70 }, 5, 5)).toEqual({
      bestCorrect: 5,
      bestXp: 70,
      xpGain: 0,
    });
  });

  it("awards zero XP on a worse repeat, and keeps the previous best score", () => {
    expect(computeLessonReplayXp({ correct: 5, xpEarned: 70 }, 2, 5)).toEqual({
      bestCorrect: 5,
      bestXp: 70,
      xpGain: 0,
    });
  });

  it("awards only the delta when a repeat improves on the previous best", () => {
    // First attempt 2/5 = 20xp; this attempt 5/5 = 70xp -- only +50 owed.
    expect(computeLessonReplayXp({ correct: 2, xpEarned: 20 }, 5, 5)).toEqual({
      bestCorrect: 5,
      bestXp: 70,
      xpGain: 50,
    });
  });

  it("never awards negative XP even if xpEarned somehow exceeds the recomputed best", () => {
    expect(computeLessonReplayXp({ correct: 5, xpEarned: 999 }, 5, 5)).toEqual({
      bestCorrect: 5,
      bestXp: 70,
      xpGain: 0,
    });
  });
});
