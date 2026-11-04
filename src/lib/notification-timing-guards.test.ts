import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The system notification dialog must never appear cold over the first lesson's celebration. Both app targets
// only compile in CI, so these read the source. The pure decision lives in the Kit (iOS) and core (Android).
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const between = (s: string, a: string, b: string) => {
  const at = s.indexOf(a);
  expect(at, `missing: ${a}`).toBeGreaterThan(-1);
  const end = s.indexOf(b, at + a.length);
  expect(end, `missing: ${b}`).toBeGreaterThan(-1);
  return s.slice(at, end);
};

const ios = read("ios/LearnWithAlphonso/Sources/LessonPlayerView.swift");
const android = read(
  "android/LearnWithAlphonso/app/src/main/java/com/obsidianmedia/learnwithalphonso/ui/lesson/LessonScreen.kt",
);

describe("iOS: no cold notification prompt after a lesson", () => {
  it("the post-completion scheduling never asks for authorization", () => {
    const fn = between(ios, "private func scheduleStreakReminderAfterCompletion", "\n    }\n");
    expect(fn).not.toContain("requestAuthorization");
    expect(fn).toContain("scheduleStreakReminder(");
  });

  it("the only requestAuthorization call in the lesson player is behind the card's Remind me", () => {
    expect(ios.match(/requestAuthorization\(/g)?.length).toBe(1);
    const accept = between(ios, "private func acceptReminders", "\n    }\n");
    expect(accept).toContain("requestAuthorization()");
    expect(ios).toContain("ReminderPromptPolicy.shouldShowCard(");
    expect(ios).toContain("ReminderPromptCopy.accept");
    expect(ios).toContain("recordNotNow(");
  });
});

describe("Android: no cold notification prompt after a lesson", () => {
  it("finishing a lesson only reschedules; the permission is requested from the card", () => {
    const effect = between(android, "LaunchedEffect(finished?.result", "SaveWordHost(container)");
    expect(effect).not.toContain("requestIfUndetermined");
    expect(effect).toContain("onLessonFinished(");
    expect(android.match(/requestIfUndetermined\(/g)?.length).toBe(1);
    expect(android).toContain("ReminderPromptPolicy.shouldShowCard(");
    expect(android).toContain("recordNotNow(");
  });
});
