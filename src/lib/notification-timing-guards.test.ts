import { readdirSync, readFileSync } from "node:fs";
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

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = `${dir}/${e.name}`;
    return e.isDirectory() ? walk(full) : [full];
  });
// Calls only: declarations and comments do not ask.
const callsIn = (files: string[], re: RegExp) =>
  files
    .filter((f) => /\.(swift|kt)$/.test(f))
    .filter((f) =>
      read(f)
        .split("\n")
        .some(
          (l) =>
            re.test(l) &&
            !/\b(fun|func) (requestAuthorization|requestIfUndetermined)\b/.test(l) &&
            !/^\s*(\/\/|\*|\/\*)/.test(l),
        ),
    )
    .map((f) => f.replace(/^.*\//, ""))
    .sort();

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

  it("the system permission is requested from exactly two places repo-wide: the scheduler wrapper and the card", () => {
    expect(callsIn(walk("ios/LearnWithAlphonso/Sources"), /requestAuthorization\(/)).toEqual([
      "LessonPlayerView.swift",
      "NotificationScheduler.swift",
    ]);
    const androidFiles = walk("android/LearnWithAlphonso").filter((f) => f.includes("src/main"));
    expect(callsIn(androidFiles, /requestIfUndetermined\(/)).toEqual(["LessonScreen.kt"]);
    expect(callsIn(androidFiles, /launch\(Manifest\.permission\.POST_NOTIFICATIONS\)/)).toEqual([
      "NotificationPermission.kt",
    ]);
  });
});

describe("the reminder card does not delay or leak across lessons", () => {
  it("iOS: the haptic fires before the card decision, which runs off the finish path", () => {
    const finish = between(ios, "private func finish() async", "case let .failure");
    expect(finish.indexOf("notificationOccurred")).toBeGreaterThan(-1);
    expect(finish).not.toMatch(/^\s*await decideReminderCard/m);
    expect(finish.indexOf("notificationOccurred")).toBeLessThan(
      finish.indexOf("decideReminderCard()"),
    );
    expect(finish).toMatch(/Task \{[^}]*decideReminderCard\(\)/);
  });
  it("iOS: a new lesson clears the card and a stale fetch cannot set it", () => {
    expect(between(ios, "private func continueToNextLesson", "\n    }\n")).toContain(
      "showReminderCard = false",
    );
    const decide = between(ios, "private func decideReminderCard", "\n    }\n");
    expect(decide).toContain("showReminderCard = false");
    expect(decide).toMatch(/lesson\.id == decidingFor/);
  });
  it("iOS: the card is accessible and animates only without Reduce Motion", () => {
    const card = between(ios, "if showReminderCard {", "if let onPractiseWithHector");
    expect(card).toContain(".isHeader");
    expect(card).toContain("ViewThatFits");
    expect(card).toContain(".transition(");
    expect(ios).toContain("Announcement(");
  });
  it("Android: a grant registers for push, and the card buttons can grow", () => {
    expect(android).toContain("pushRegistrar.registerIfAuthorized()");
    const card = between(android, "if (showReminderCard) {", "if (onNext != null)");
    expect(card).toContain("heightIn(min = 48.dp)");
    expect(card).not.toContain("fullWidth = false");
  });
  it("the manifest no longer claims a first-lesson ask", () => {
    expect(read("android/LearnWithAlphonso/app/src/main/AndroidManifest.xml")).not.toContain(
      "asked at the first lesson completion",
    );
  });
});
