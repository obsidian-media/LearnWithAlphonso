import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Lesson order (#688) on iOS: start-lesson-session refuses a lesson the learner has not unlocked (409 lesson-locked).
 * The SwiftUI cannot run here (the app target only compiles in CI), so the wiring is read from the source, and each
 * check is proved to go red when its fix is taken out:
 *   1. the player shows "Finish the earlier lessons first" INSTEAD of the lesson, with a way back to Learn;
 *   2. the level picker's save is retried and put back when it fails (LevelSave), not fire-and-forget;
 *   3. the course's Continue reads the units in learning order (band by band), as the server opens them.
 * The Android twin is LessonLockedSourceGuardsTest.kt; the Kit's behaviour is pinned by its own XCTests.
 */
const root = path.resolve(import.meta.dirname, "../..");
const SRC = "ios/LearnWithAlphonso/Sources";
const read = (p: string) => fs.readFileSync(path.join(root, SRC, p), "utf8").replace(/\r\n/g, "\n");

/** Code only: comments may describe other behaviour. */
const code = (text: string) =>
  text
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");

/** The text from the first `a` to the next `b` after it ("" when either is missing). */
function between(text: string, a: string, b: string): string {
  const i = text.indexOf(a);
  if (i < 0) return "";
  const j = text.indexOf(b, i + a.length);
  return j < 0 ? "" : text.slice(i, j);
}

function playerProblems(playerText: string, lockedText: string): string[] {
  const player = code(playerText);
  const out: string[] = [];
  const open = between(player, "private func openLessonSession() async", "private func block(");
  if (!/catch ProgressSyncError\.lessonLocked \{[\s\S]*?lessonLocked = true/.test(open))
    out.push("the session open does not catch lesson-locked");
  const stage = between(player, "private func stage(topInset: CGFloat)", "case .overview:");
  if (!/^\s*if lessonLocked \{\s*\n\s*LessonLockedView\(onBack: \{ dismiss\(\) \}\)/m.test(stage))
    out.push("the locked screen is not the first thing the stage checks");
  if (!/private var onStage: Bool \{\s*!lessonLocked &&/.test(player))
    out.push("the locked screen counts as the stage, so its navigation bar (and Back) is hidden");
  const locked = code(lockedText);
  for (const part of [
    "LessonLockedCopy.title",
    "LessonLockedCopy.message",
    "Button(LessonLockedCopy.backTitle, action: onBack)",
  ]) {
    if (!locked.includes(part)) out.push(`the locked screen lacks ${part}`);
  }
  return out;
}

function levelSaveProblems(browserText: string): string[] {
  const browser = code(browserText);
  const out: string[] = [];
  const save = between(browser, "private func saveLevel(", "private func loadChallenges");
  if (!save.includes("await LevelSave.run { try await client.setCefrLevel("))
    out.push("the save is not retried");
  if (/try\? await client\.setCefrLevel/.test(save)) out.push("the save is fire-and-forget");
  if (!/selectedLevel = back\n\s*levelSaveMessage = LevelSave\.failedMessage/.test(save))
    out.push("a failed save does not put the picker back and say so");
  if (!browser.includes("saveLevel(newLevel, previous: oldLevel)"))
    out.push("picks do not reach saveLevel");
  return out;
}

function continueProblems(browserText: string): string[] {
  const loop = between(
    code(browserText),
    "private var courseContinueLessonID: String? {",
    "return nil",
  );
  return loop.includes(
    "for unit in LearnFold.inLearningOrder(contentStore.bundle(for: course).units, level: \\.level)",
  )
    ? []
    : ["Continue reads the course in raw curriculum order"];
}

describe("lesson order on iOS", () => {
  const player = read("LessonPlayerView.swift");
  const locked = read("LessonLockedView.swift");
  const browser = read("LessonBrowserView.swift");

  it("1. a locked lesson shows the locked screen before play, with a way back to Learn", () => {
    expect(playerProblems(player, locked)).toEqual([]);
  });
  it("2. the level picker's save is retried, and put back when it fails", () => {
    expect(levelSaveProblems(browser)).toEqual([]);
  });

  it("3. Continue reads the course in learning order", () => {
    expect(continueProblems(browser)).toEqual([]);
  });

  it("goes red when each fix is taken out", () => {
    const mutate = (text: string, from: string | RegExp, to: string) => {
      const next = text.replace(from, to);
      expect(next).not.toBe(text);
      return next;
    };
    expect(
      playerProblems(
        mutate(
          player,
          "catch ProgressSyncError.lessonLocked {",
          "catch ProgressSyncError.badResponse {",
        ),
        locked,
      ),
    ).toContain("the session open does not catch lesson-locked");
    expect(
      playerProblems(
        mutate(
          player,
          /if lessonLocked \{\n\s*LessonLockedView\(onBack: \{ dismiss\(\) \}\)\n\s*\} else if let result \{/,
          "if let result {",
        ),
        locked,
      ),
    ).toContain("the locked screen is not the first thing the stage checks");
    expect(
      playerProblems(
        player,
        mutate(locked, "Button(LessonLockedCopy.backTitle, action: onBack)", "EmptyView()"),
      ),
    ).toContain("the locked screen lacks Button(LessonLockedCopy.backTitle, action: onBack)");
    const fireAndForget = mutate(
      browser,
      "await LevelSave.run { try await client.setCefrLevel(course: savingCourse, level: level) }",
      "(try? await client.setCefrLevel(course: savingCourse, level: level)) != nil",
    );
    expect(levelSaveProblems(fireAndForget)).toEqual(
      expect.arrayContaining(["the save is not retried", "the save is fire-and-forget"]),
    );
    expect(
      levelSaveProblems(
        mutate(
          browser,
          /selectedLevel = back\n(\s*)levelSaveMessage = LevelSave\.failedMessage/,
          "$1levelSaveMessage = LevelSave.failedMessage",
        ),
      ),
    ).toContain("a failed save does not put the picker back and say so");
    expect(
      continueProblems(
        mutate(
          browser,
          "LearnFold.inLearningOrder(contentStore.bundle(for: course).units, level: \\.level)",
          "contentStore.bundle(for: course).units",
        ),
      ),
    ).toEqual(["Continue reads the course in raw curriculum order"]);
  });
});
