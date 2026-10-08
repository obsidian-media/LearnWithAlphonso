import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** Static guards over Swift sources the Windows toolchain cannot compile (the app target). */
const ROOT = path.resolve(import.meta.dirname, "../..");
const APP = "ios/LearnWithAlphonso/Sources";
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), "utf8").replace(/\r\n/g, "\n");
const between = (src: string, start: string, end: RegExp) => {
  const from = src.indexOf(start);
  if (from < 0) return "";
  const rest = src.slice(from);
  const stop = rest.slice(start.length).search(end);
  return stop < 0 ? rest : rest.slice(0, start.length + stop);
};

describe("Review never blank", () => {
  const src = read(`${APP}/ReviewQueueView.swift`);
  it("resolves the whole queue before showing anything", () => {
    expect(src).toContain("ReviewQueueResolution.resolve(");
  });
  it("never skips with a bare .task (fires once per identity, the blank-screen bug)", () => {
    expect(src).not.toMatch(/Color\.clear\.task\s*\{/);
  });
  it("uses the course-scoped due cache", () => {
    expect(src).toMatch(/lastKnownDueReviews\(course: course\.wireCode\)/);
    expect(src).toMatch(/replaceLastKnownDueReviews\([^)]*course: course\.wireCode\)/);
  });
  it("queued grades carry the owning account", () => {
    expect(src).toMatch(/PendingReviewGrade\([^)]*ownerUserID: session\.userID/);
  });
  it("opens on the learner's active course and keeps the picker usable", () => {
    expect(src).toContain("ActiveCoursePreference.load(for: session.userID)");
    expect(src).not.toContain(".disabled(!queue.isEmpty && idx < queue.count)");
  });
});

describe("Lesson completion", () => {
  const src = read(`${APP}/LessonPlayerView.swift`);
  it("starts the lesson session when the lesson opens, and finishes with the held token", () => {
    expect(src).toMatch(/private func openLessonSession\(\) async/);
    expect(src).toContain(".task(id: lesson.id) { await openLessonSession() }");
    expect(between(src, "private func openLessonSession", /\n {4}private func /)).toContain(
      "startLessonSession(",
    );
    expect(src).toMatch(/LessonCompletionRequest\([^)]*sessionToken: sessionToken\)/);
  });
  it("classifies failures instead of queueing everything", () => {
    const finish = between(src, "private func finish()", /\n {4}\/\/\/ /);
    expect(finish).toContain("LessonCompletionService(");
    expect(finish).toMatch(/error\.shouldQueue/);
    expect(finish).not.toMatch(/catch\s*\{[^}]*queueOffline\(/);
  });
  it("queued completions carry the owner and the held session token", () => {
    expect(src).toMatch(/ownerUserID: session\.userID/);
    expect(src).toMatch(/sessionToken: sessionToken/);
  });
  it("offers Continue offline, Sign in when signed out, and an out-of-hearts sheet", () => {
    expect(src).toMatch(/OfflineFinishView\([^)]*onContinue:/);
    expect(src).toContain("LessonSaveFailureView(");
    expect(read(`${APP}/LessonSaveFailureView.swift`)).toContain('Button("Sign in"');
    expect(src).toContain("OutOfHeartsSheet(");
  });
  it("generated practice keys choices by position, not text", () => {
    const practice = between(src, "private struct GeneratedPracticeSection", /\n}\n/);
    expect(practice).not.toContain("ForEach(q.choices, id: \\.self)");
    expect(practice).toMatch(/ForEach\(Array\(q\.choices\.enumerated\(\)\), id: \\\.offset\)/);
  });
  it("has no literal -- in on-screen strings", () => {
    expect(src).not.toMatch(/Text\("[^"]*--/);
  });
});

describe("Hearts never gate review or practice", () => {
  for (const f of [
    "ReviewQueueView.swift",
    "ConversationView.swift",
    "CampaignView.swift",
    "HectorView.swift",
  ]) {
    it(`${f} never spends a heart`, () => {
      expect(read(`${APP}/${f}`)).not.toMatch(/loseHeart|lose_heart/);
    });
  }
});

describe("Sync store", () => {
  const store = read(`${APP}/SyncQueueStore.swift`);
  const schema = read(`${APP}/SyncSchema.swift`);
  it("V1 is a frozen copy of build 49's persisted models (e3004f5)", () => {
    const v1 = between(schema, "enum SyncSchemaV1", /\nenum SyncSchemaV2/);
    const props = (cls: string) =>
      [
        ...between(v1, `final class ${cls}`, /\n {4}}\n/).matchAll(
          /^\s+(@Attribute\(\.unique\) )?var (\w+): ([^\n=]+)/gm,
        ),
      ].map((m) => `${m[1] ? "unique " : ""}${m[2]}: ${m[3].trim()}`);
    expect(props("PendingLessonCompletionRecord")).toEqual([
      "lessonID: String",
      "total: Int",
      "answerQuestionIDs: [String]",
      "answerTexts: [String]",
      "course: String",
      "queuedAt: Date",
      "optimisticXpEstimate: Int",
    ]);
    expect(props("PendingReviewGradeRecord")).toEqual([
      "itemKey: String",
      "answer: String",
      "course: String",
      "queuedAt: Date",
    ]);
    expect(props("CachedDueReviewRecord")).toEqual([
      "unique itemKey: String",
      "lessonId: String",
      "level: String",
      "ease: Double",
      "intervalDays: Int",
      "repetitions: Int",
      "dueOn: String",
      "source: String",
      "weaknessDisplay: String?",
      "prompt: String?",
      "choices: [String]?",
      "answerIndex: Int?",
      "explanation: String?",
    ]);
    expect(props("AppSyncStateRecord")).toEqual([
      "lastSyncedAt: Date?",
      "progressXp: Int?",
      "progressStreak: Int?",
      "progressLongestStreak: Int?",
      "progressLastActiveDate: String?",
      "progressHearts: Int?",
      "progressHeartsRefillAt: Double?",
      "progressStreakFreezes: Int?",
      "progressLeagueTier: String?",
    ]);
    expect(props("PodcastDownloadRecord")).toEqual([
      "unique episodeID: String",
      "bytes: Int",
      "etag: String?",
      "storedDurationSeconds: Int",
      "lastPlayed: Date?",
      "downloadedAt: Date",
    ]);
  });
  it("the container opens through the migration plan", () => {
    expect(read(`${APP}/LearnWithAlphonsoApp.swift`)).toMatch(
      /migrationPlan: SyncMigrationPlan\.self/,
    );
  });
  it("clearAll deletes every record type, including the ones added later", () => {
    const clear = between(store, "func clearAll()", /\n {4}}\n/);
    for (const t of [
      "PendingLessonCompletionRecord",
      "PendingReviewGradeRecord",
      "CachedCourseDueReviewRecord",
      "AppSyncStateRecord",
      "SyncDeadLetterRecord",
    ]) {
      expect(clear, t).toContain(`${t}.self`);
    }
  });
  it("RootView's sync runs through the store and refreshes every course, not just en", () => {
    const root = read(`${APP}/RootView.swift`);
    expect(root).toContain("syncQueueStore.runSync(");
    expect(root).not.toContain('fetchDueReviews(course: "en")');
    expect(store).toContain("SyncEngine.refreshDueReviews");
  });
  it("keeps the same-account guard and the account cleanup registration", () => {
    expect(read(`${APP}/RootView.swift`)).toContain(
      "isCurrentAccount: { session.userID == syncingUserID }",
    );
    expect(read(`${APP}/LearnWithAlphonsoApp.swift`)).toContain("AccountDataCleanup.register(");
  });
});

describe("Polish", () => {
  it("the widget pluralises through the Kit copy", () => {
    const w = read("ios/LearnWithAlphonso/LearnWithAlphonsoWidget/StreakWidgetView.swift");
    expect(w).toContain("StreakWidgetCopy.caption(streak: snapshot.streak)");
    expect(w).not.toContain('"day streak" : "day streak"');
  });
  it("Practice has New conversation through the store", () => {
    const c = read(`${APP}/ConversationView.swift`);
    expect(c).toContain('"New conversation"');
    expect(c).toContain("conversationStore.startNew(key");
  });
});
