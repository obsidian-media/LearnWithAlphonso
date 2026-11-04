import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// complete-lesson answers machine-speed completions with 429 "too-fast" / "rate-limited". Both native clients must turn
// that into a calm "Slow down a little and try again." (not "our server had a problem, it will sync", which would
// queue and retry it). The app target compiles only in CI, so these read the Kit and Kotlin sources.
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const swift = read(
  "ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/LessonCompletionError.swift",
);
const kotlin = read(
  "android/LearnWithAlphonso/core/src/main/kotlin/com/obsidianmedia/learnwithalphonso/core/sync/LessonCompletionError.kt",
);
const edge = read("supabase/functions/complete-lesson/handler.ts");

describe("429 too-fast / rate-limited reach the learner as a calm message", () => {
  it("the Edge Function sends exactly the codes the clients recognise", () => {
    expect(edge).toContain('{ error: "too-fast" }, 429');
    expect(edge).toContain('{ error: "rate-limited" }, 429');
    for (const src of [swift, kotlin]) {
      expect(src).toContain('"too-fast"');
      expect(src).toContain('"rate-limited"');
    }
  });

  it("iOS: a coded 429 is rejected (never queued) and says slow down; an uncoded 429 stays transient", () => {
    expect(swift).toMatch(
      /case 429 where Self\.slowDownCodes\.contains\(code \?\? ""\): return \.rejected\(code: code\)/,
    );
    expect(swift.indexOf("case 429 where")).toBeLessThan(swift.indexOf("case 429, 500...599"));
    expect(swift).toContain('return "Slow down a little and try again."');
  });

  it("Android: the same rule, ahead of the generic 429", () => {
    expect(kotlin).toMatch(
      /429 -> if \(code in SLOW_DOWN_CODES\) Rejected\(code\) else Server\(status\)/,
    );
    expect(kotlin).toContain('"Slow down a little and try again."');
  });
});
