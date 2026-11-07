import { describe, expect, it, vi } from "vitest";
import {
  SKILLS,
  dailyGoalProgress,
  isValidTimeZone,
  lessonSeconds,
  practiceSeconds,
  skillOfQuestionType,
  skillResults,
  skillScores,
} from "./profile-data";
import * as deno from "../../supabase/functions/_shared/profile-data";
import { recordLearningSeconds, recordLessonProfileData } from "./profile-data.server";

describe("skills", () => {
  it("maps every question type the lessons use, and nothing else", () => {
    expect(
      ["listening", "speak", "mc", "fill", "reorder", "translate"].map(skillOfQuestionType),
    ).toEqual(["listening", "speaking", "vocabulary", "grammar", "grammar", "reading"]);
    expect(skillOfQuestionType("essay")).toBeNull();
  });
  it("folds graded answers into one entry per skill, counting rights", () => {
    expect(
      skillResults([
        { type: "mc", correct: true },
        { type: "mc", correct: false },
        { type: "fill", correct: true },
        { type: "reorder", correct: false },
        { type: "speak", correct: true },
        { type: "essay", correct: true },
      ]),
    ).toEqual([
      { skill: "speaking", right: 1, total: 1 },
      { skill: "vocabulary", right: 1, total: 2 },
      { skill: "grammar", right: 1, total: 2 },
    ]);
  });
  it("scores each skill over the window only, null when never answered, always five in order", () => {
    const rows = [
      { day: "2026-11-06", skill: "listening", right: 3, total: 4 },
      { day: "2026-11-01", skill: "listening", right: 0, total: 4 },
      { day: "2026-09-01", skill: "listening", right: 0, total: 40 }, // outside 28 days
      { day: "2026-11-06", skill: "grammar", right: 2, total: 3 },
    ];
    const s = skillScores(rows, "2026-11-06");
    expect(s.map((x) => x.skill)).toEqual([...SKILLS]);
    expect(s.find((x) => x.skill === "listening")).toEqual({
      skill: "listening",
      answered: 8,
      pct: 38,
    });
    expect(s.find((x) => x.skill === "grammar")?.pct).toBe(67);
    expect(s.find((x) => x.skill === "reading")).toEqual({
      skill: "reading",
      answered: 0,
      pct: null,
    });
    // the window edge: exactly 28 days back is in, 29 is out
    const edge = (day: string) =>
      skillScores([{ day, skill: "reading", right: 1, total: 1 }], "2026-11-06")[4]!.answered;
    expect(edge("2026-10-10")).toBe(1);
    expect(edge("2026-10-09")).toBe(0);
  });
});

describe("learning seconds", () => {
  it("clamps a lesson and a practice call to 15 minutes and never goes negative", () => {
    expect(lessonSeconds(1_000, 1_000 + 120_000)).toBe(120);
    expect(lessonSeconds(0, 5 * 3_600_000)).toBe(900);
    expect(lessonSeconds(10_000, 5_000)).toBe(0);
    expect(lessonSeconds(null, 5_000)).toBe(0);
    expect(practiceSeconds("2026-11-07T10:00:00Z", "2026-11-07T10:03:30Z")).toBe(210);
    expect(practiceSeconds("2026-11-07T10:00:00Z", "2026-11-07T14:00:00Z")).toBe(900);
    expect(practiceSeconds("2026-11-07T10:00:00Z", "garbage")).toBe(0);
  });
  it("measures the daily goal in whole lesson plus practice minutes", () => {
    const rows = [{ day: "2026-11-06", lessonSeconds: 400, practiceSeconds: 230 }];
    expect(dailyGoalProgress(rows, "2026-11-06", 10)).toEqual({
      minutes: 10,
      goalMinutes: 10,
      reached: true,
    });
    expect(dailyGoalProgress(rows, "2026-11-06", 15).reached).toBe(false);
    expect(dailyGoalProgress(rows, "2026-11-05", 5)).toEqual({
      minutes: 0,
      goalMinutes: 5,
      reached: false,
    });
  });
  it("accepts real IANA names and rejects the rest", () => {
    expect(isValidTimeZone("America/Toronto")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone(5)).toBe(false);
  });
});

describe("the Edge Function mirror", () => {
  it("agrees with the web rules", () => {
    for (const t of ["listening", "speak", "mc", "fill", "reorder", "translate", "x"]) {
      expect(deno.skillOfQuestionType(t)).toBe(skillOfQuestionType(t));
    }
    expect(deno.SKILLS).toEqual(SKILLS);
    expect(deno.MAX_ACTIVITY_SECONDS).toBe(900);
    const pairs: [number | null, number][] = [
      [0, 1_000_000],
      [5_000, 125_000],
      [9_000, 1_000],
      [null, 5],
    ];
    for (const [a, b] of pairs) expect(deno.lessonSeconds(a, b)).toBe(lessonSeconds(a, b));
    const g = [
      { type: "mc", correct: true },
      { type: "speak", correct: false },
    ];
    expect(deno.skillResults(g)).toEqual(skillResults(g));
  });
});

describe("recorders", () => {
  const rpc = (error: unknown = null) => ({
    rpc: vi.fn().mockResolvedValue({ data: null, error }),
  });
  it("send the server's own numbers to the service-role functions", async () => {
    const c = rpc();
    await recordLessonProfileData(c, "u1", {
      sessionIssuedAtMs: 0,
      nowMs: 90_000,
      graded: [{ type: "listening", correct: true }],
    });
    expect(c.rpc).toHaveBeenCalledWith("add_learning_seconds", {
      _user_id: "u1",
      _lesson_seconds: 90,
      _practice_seconds: 0,
    });
    expect(c.rpc).toHaveBeenCalledWith("add_skill_results", {
      _user_id: "u1",
      _results: [{ skill: "listening", right: 1, total: 1 }],
    });
  });
  it("write nothing for zero seconds, and never throw on a failure or an undeployed function", async () => {
    const c = rpc();
    await recordLearningSeconds(c, "u1", { lesson: 0, practice: 0 });
    expect(c.rpc).not.toHaveBeenCalled();
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      recordLearningSeconds(rpc({ message: "x", code: "XX000" }), "u1", { lesson: 5 }),
    ).resolves.toBeUndefined();
    expect(quiet).toHaveBeenCalledTimes(1);
    const throwing = {
      rpc: () => {
        throw new Error("down");
      },
    };
    await expect(recordLearningSeconds(throwing, "u1", { lesson: 5 })).resolves.toBeUndefined();
    quiet.mockClear();
    await expect(
      recordLearningSeconds(rpc({ message: "x", code: "PGRST202" }), "u1", { lesson: 5 }),
    ).resolves.toBeUndefined();
    expect(quiet).not.toHaveBeenCalled();
    quiet.mockRestore();
  });
});
