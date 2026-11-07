import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import timing from "../data/lesson-timing.json";
import { ActiveTimer, estimateLessonMinutes, formatElapsed } from "./lesson-time";
import type { Question } from "../data/curriculum";

const q = (type: Question["type"]) => ({ type }) as Question;

describe("estimateLessonMinutes", () => {
  it("adds the configured seconds per question type and per new word, rounded up to whole minutes", () => {
    const qs = [q("mc"), q("mc"), q("fill"), q("translate")];
    const seconds =
      2 * timing.secondsPerQuestion.mc +
      timing.secondsPerQuestion.fill +
      timing.secondsPerQuestion.translate +
      3 * timing.secondsPerNewWord;
    expect(estimateLessonMinutes(qs, 3)).toBe(Math.ceil(seconds / 60));
  });

  it("every question type has a time in the config", () => {
    for (const t of ["mc", "fill", "reorder", "listening", "speak", "translate"] as const)
      expect(timing.secondsPerQuestion[t], t).toBeGreaterThan(0);
  });

  it("a slower kind of question makes the estimate longer", () => {
    const mcs = Array.from({ length: 8 }, () => q("mc"));
    const writes = Array.from({ length: 8 }, () => q("translate"));
    expect(estimateLessonMinutes(writes, 0)).toBeGreaterThan(estimateLessonMinutes(mcs, 0));
  });

  it("is never under a minute", () => {
    expect(estimateLessonMinutes([q("mc")], 0)).toBe(1);
  });
});

describe("ActiveTimer", () => {
  it("counts only the time the lesson is on screen: a hidden tab pauses it", () => {
    const t = new ActiveTimer(1_000);
    t.pause(31_000); // 30 s on screen, then hidden
    t.resume(600_000); // ten minutes away
    expect(t.elapsedMs(615_000)).toBe(45_000);
  });

  it("pausing twice or resuming while running changes nothing", () => {
    const t = new ActiveTimer(0);
    t.resume(5_000);
    t.pause(10_000);
    t.pause(20_000);
    expect(t.elapsedMs(50_000)).toBe(10_000);
  });
});

describe("formatElapsed", () => {
  it("reads m:ss", () => {
    expect(formatElapsed(222_000)).toBe("3:42");
    expect(formatElapsed(5_000)).toBe("0:05");
    expect(formatElapsed(3_725_000)).toBe("62:05");
  });
});

describe("native copies of the timing rules", () => {
  // iOS (LessonTiming.bundled) and Android (LessonTiming.fromJson) read these, so "About N min" agrees everywhere.
  // Written by bun scripts/export-ios-content.ts / export-android-content.ts.
  it.each([
    "ios/LearnWithAlphonso/Resources/lesson-timing.json",
    "ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/Resources/lesson-timing.json",
    "android/LearnWithAlphonso/app/src/main/assets/content/lesson-timing.json",
  ])("%s carries the same rules", (rel) => {
    const file = path.join(import.meta.dirname, "../..", rel);
    expect(fs.existsSync(file), rel).toBe(true);
    expect(JSON.parse(fs.readFileSync(file, "utf8"))).toEqual(timing);
  });
});
