import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SCENARIO_FOCUS, SCENE_ROOMS } from "./practice-catalog";
import { STAR_RULE_LINES } from "./practice-stars";

const ios = readFileSync(
  "ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/PracticeHub.swift",
  "utf8",
);
const android = readFileSync(
  "android/LearnWithAlphonso/core/src/main/kotlin/com/obsidianmedia/learnwithalphonso/core/logic/PracticeHub.kt",
  "utf8",
);
const words = (text: string) => [...text.matchAll(/"([^"]+)"/g)].map((m) => m[1]);

describe("native Practice catalog parity with the approved web hub", () => {
  it("keeps every campaign scene in the same painted room", () => {
    const swift = Object.fromEntries(
      [...ios.matchAll(/"([^"\n]+\/[^"\n]+)": "([^"]+)"/g)].map((m) => [m[1], m[2]]),
    );
    const kotlin = Object.fromEntries(
      [...android.matchAll(/"([^"\n]+\/[^"\n]+)" to "([^"]+)"/g)].map((m) => [m[1], m[2]]),
    );
    expect(swift).toEqual(SCENE_ROOMS);
    expect(kotlin).toEqual(SCENE_ROOMS);
  });

  it("matches the scenario focus catalog, including spelling for the skip guard to exercise", () => {
    const swift = Object.fromEntries(
      [...ios.matchAll(/"([\w-]+)": \[([^\]]*)\]/g)].map((m) => [m[1], words(m[2])]),
    );
    const kotlin = Object.fromEntries(
      [...android.matchAll(/"([\w-]+)" to listOf\(([^)]*)\)/g)].map((m) => [m[1], words(m[2])]),
    );
    expect(swift).toEqual(SCENARIO_FOCUS);
    expect(kotlin).toEqual(SCENARIO_FOCUS);
  });

  it("words the star rules exactly as the server's web constants", () => {
    for (const [, line] of STAR_RULE_LINES) {
      expect(ios).toContain(JSON.stringify(line));
      expect(android).toContain(JSON.stringify(line));
    }
  });
});
