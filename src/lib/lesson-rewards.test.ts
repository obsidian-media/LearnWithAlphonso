import { describe, expect, it } from "vitest";
import { lessonRewardChips } from "./lesson-rewards";

const values = (input: Parameters<typeof lessonRewardChips>[0]) =>
  lessonRewardChips(input).map((c) => `${c.kind}:${c.value}`);

describe("lesson reward chips", () => {
  it("xp, streak and accuracy chips", () => {
    expect(values({ xp: 20, streak: 12, correct: 11, total: 12 })).toEqual([
      "xp:+20",
      "streak:12",
      "accuracy:92%",
    ]);
    expect(
      lessonRewardChips({ xp: 20, streak: 12, correct: 11, total: 12 }).map((c) => c.emoji),
    ).toEqual(["⭐", "🔥", "🎯"]);
  });

  it("offline: no streak chip", () => {
    expect(values({ xp: 15, streak: null, correct: 3, total: 4 })).toEqual([
      "xp:+15",
      "accuracy:75%",
    ]);
  });

  it("zero streak: no streak chip", () => {
    expect(values({ xp: 10, streak: 0, correct: 4, total: 4 })).toEqual([
      "xp:+10",
      "accuracy:100%",
    ]);
  });

  it("no questions: no accuracy chip, and nothing divides by zero", () => {
    expect(values({ xp: 5, streak: 2, correct: 0, total: 0 })).toEqual(["xp:+5", "streak:2"]);
  });

  it("rounds accuracy to a whole percent", () => {
    expect(values({ xp: 0, streak: null, correct: 2, total: 3 })).toEqual([
      "xp:+0",
      "accuracy:67%",
    ]);
  });
});
