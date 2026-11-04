import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// complete-lesson answers an over-the-hourly-ceiling completion with 429 "rate-limited". The native clients must keep
// that a TRANSIENT, queued failure (the ceiling clears within the hour; a transient queue item is retried with
// backoff and never dead-lettered) and tell the learner it is saved. There is deliberately no speed-floor code: a
// client that mints its session token at finish time (offline queue, 3 h re-mint) completes within ~100 ms of issue.
// The app target compiles only in CI, so these read the Kit and Kotlin sources.
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const swift = read(
  "ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/LessonCompletionError.swift",
);
const kotlin = read(
  "android/LearnWithAlphonso/core/src/main/kotlin/com/obsidianmedia/learnwithalphonso/core/sync/LessonCompletionError.kt",
);
const edge = read("supabase/functions/complete-lesson/handler.ts");

describe("429 rate-limited reaches the learner as a saved, queued lesson", () => {
  it("the Edge Function sends rate-limited as a 429 and has no speed-floor refusal", () => {
    expect(edge).toContain('{ error: "rate-limited" }, 429');
    expect(edge).not.toContain("too-fast");
  });

  it("iOS: 429 stays a queued server failure with its own saved message; never rejected", () => {
    expect(swift).toContain("case 429, 500...599: return .server(status: status)");
    expect(swift).toContain("case .server(status: 429):");
    expect(swift).toContain('return "Saved. It will sync soon."');
    expect(swift).not.toContain("too-fast");
  });

  it("Android: the same", () => {
    expect(kotlin).toContain("429, in 500..599 -> Server(status)");
    expect(kotlin).toContain('"Saved. It will sync soon."');
    expect(kotlin).not.toContain("too-fast");
  });
});
