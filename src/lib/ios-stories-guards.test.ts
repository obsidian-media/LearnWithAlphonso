import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Text guards for the graded-stories wiring that the app target (compiled only on macOS CI, with no unit tests) cannot
// pin itself. The rules live in the Kit (Stories.swift, XCTest in StoriesTests); these pin that the app routes through
// them and that the check is graded on the server, never from the client.
const ROOT = path.resolve(import.meta.dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
// Comments may mention what is forbidden ("never the service-role rpc"); only code counts.
const code = (text: string) => text.replace(/^\s*\/\/[^\n]*$/gm, "");

const kit = () => code(read("ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/Stories.swift"));
const views = () => code(read("ios/LearnWithAlphonso/Sources/StoriesViews.swift"));

/** One member function, from its signature to the closing brace at the same indentation. */
function functionBody(text: string, signature: string): string {
  const start = text.indexOf(signature);
  expect(start, `${signature} not found`).toBeGreaterThan(-1);
  const lineStart = text.lastIndexOf("\n", start) + 1;
  const indent = text.slice(lineStart, start).match(/^\s*/)![0];
  const end = text.indexOf(`\n${indent}}`, start);
  expect(end, `${signature} has no closing brace`).toBeGreaterThan(-1);
  return text.slice(start, end);
}

describe("iOS graded stories: the check is graded on the server", () => {
  it("posts only the story id and the chosen answers to the complete-story-check Edge Function", () => {
    const submit = functionBody(kit(), "public func submitStoryCheck(");
    expect(submit).toContain("functions/v1/complete-story-check");
    const payload = submit.slice(submit.indexOf("httpBody"), submit.indexOf("let data: Data"));
    const keys = [...payload.matchAll(/"(\w+)":/g)].map((m) => m[1]);
    expect(keys).toEqual(["storyId", "answers", "questionId", "choiceIndex"]);
    // A 2xx the app cannot read is an error, never a score.
    expect(submit).toContain('object["status"] as? String == "applied"');
    expect(submit).toContain("throw PodcastQuizError.server");
  });

  it("never calls the service-role RPC from the client", () => {
    expect(kit()).not.toContain("rpc/submit_story_check");
    expect(views()).not.toContain("submit_story_check");
  });

  it("reads the learner's progress and writes it only through save_story_progress", () => {
    const save = functionBody(kit(), "public func saveStoryProgress(");
    expect(save).toContain("rest/v1/rpc/save_story_progress");
    // The table has no client write grant: no PATCH/POST to story_progress itself.
    expect(kit()).not.toMatch(/rest\/v1\/story_progress"[^)]*method: "(POST|PATCH|PUT)"/);
  });

  it("the check sheet is the shared quiz run, with the story's own sender and no XP line", () => {
    const text = views();
    expect(text).toContain("PodcastQuizSheet(");
    expect(text).toContain("client.submitStoryCheck(storyID: storyID, answers: answers)");
    expect(text).toContain("resultNote: { _ in StoryCopy.countsLine }");
    // The score on screen is the server's: nothing here counts right answers.
    expect(text).not.toMatch(/answerIndex\s*==|xpGain/);
  });

  it("narration goes through the existing /api/tts client and the Kit's narration rules", () => {
    const text = views();
    expect(text).toContain("client.synthesizeSpeech(");
    expect(text).toContain("Stories.nextSegment(after:");
    expect(text).toContain("state.finishedCurrent()");
  });

  it("narration plays the recording first and the live voice only with consent; both readers prepare first", () => {
    const text = views();
    const audio = functionBody(text, "private func audioData(for index: Int)");
    const recorded = audio.indexOf("StoryRecordings.audioURL(");
    const gate = audio.indexOf("guard liveAllowed else");
    const live = audio.indexOf("client.synthesizeSpeech(");
    expect(recorded).toBeGreaterThan(-1);
    expect(recorded).toBeLessThan(gate);
    expect(gate).toBeLessThan(live);
    expect(text).toContain("StoryRecordings.canNarrate(");
    expect(text).toContain("narrator.prepare(aiConsentGranted: aiConsent.isGranted)");
    const branching = code(read("ios/LearnWithAlphonso/Sources/BranchingStoryViews.swift"));
    expect(branching).toContain("narrator.prepare(aiConsentGranted: aiConsent.isGranted)");
    expect(branching).toContain("storyID: story.id");
  });

  it("a tapped word opens the existing define-and-save sheet", () => {
    const text = views();
    expect(text).toContain("TappableText(text: segment");
    expect(text).toContain("SaveWordSheet(request: request, session: session)");
  });

  it("only published stories are asked for, and the library is reachable from the Listen shelf", () => {
    expect(kit()).toContain("published=eq.true");
    const shelf = code(read("ios/LearnWithAlphonso/Sources/ListenShelfViews.swift"));
    expect(shelf).toContain(
      "StoriesEntryRow(session: session, player: player, course: activeCourse)",
    );
  });

  it("the podcast quiz keeps its own sender by default", () => {
    const sheet = code(read("ios/LearnWithAlphonso/Sources/PodcastQuizSheet.swift"));
    expect(sheet).toContain(
      "client.submitQuiz(episodeID: episodeID, answers: answers, completedAt: finished)",
    );
  });
});
