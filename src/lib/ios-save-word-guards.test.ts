import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Save-word in French and Spanish, iPhone half. The app target only compiles in CI (ios-app-build), so these
// read the Swift source. The rule: a missing `courseSpans` must never mean "every word is savable" outside the
// English course, because lesson explanations there are English with course text quoted inside.
const SRC = "ios/LearnWithAlphonso/Sources";
const read = (p: string) => readFileSync(`${SRC}/${p}`, "utf8").replace(/\r\n/g, "\n");
const between = (s: string, a: string, b: string) => {
  const at = s.indexOf(a);
  expect(at, `missing: ${a}`).toBeGreaterThan(-1);
  const end = s.indexOf(b, at + a.length);
  expect(end, `missing: ${b}`).toBeGreaterThan(-1);
  return s.slice(at, end);
};

const tappable = read("TappableText.swift");
const components = read("DesignSystem/AlphonsoComponents.swift");
const lesson = read("LessonPlayerView.swift");

describe("tap-to-save never offers English words under French or Spanish", () => {
  it("TappableText: no spans means linkable only in the English course", () => {
    const pieces = between(tappable, "private var pieces", "private var attributed");
    expect(pieces).toContain("guard let courseSpans else");
    expect(pieces).toMatch(
      /isCourseLanguage:\s*SavedWordPolicy\.savesWholeText\(inCourse:\s*course\)/,
    );
    // The old unsafe default, linking everything, must not come back.
    expect(pieces).not.toMatch(
      /guard let courseSpans else \{ return \[\.init\(text: text, isCourseLanguage: true\)\] \}/,
    );
  });

  it("TappableText: only course-language pieces get a link", () => {
    expect(between(tappable, "private var attributed", "private func sentence")).toContain(
      "if part.isCourseLanguage, segment.isWord",
    );
  });

  it("AlphonsoTipCard: a non-English course without spans renders plain text", () => {
    const card = between(components, "struct AlphonsoTipCard", "struct ExplanationView");
    expect(card).toMatch(
      /SavedWordPolicy\.savesWholeText\(inCourse:\s*saveCourse\)\s*\|\|\s*courseSpans\s*!=\s*nil/,
    );
  });

  it("ExplanationView derives what to save from the policy scope", () => {
    const view = between(components, "struct ExplanationView", "struct SaveWordHintLine");
    expect(view).toContain("SavedWordPolicy.scope(for: question");
    expect(view).toMatch(/scope == \.none \? nil/);
  });

  it("generated practice has no question to prove course text, so it stays English-only", () => {
    expect(lesson).toMatch(/SavedWordPolicy\.savesWholeText\(inCourse: code\) \? code : nil/);
    expect(lesson).not.toContain("SavedWordPolicy.allowsSaving(inCourse");
  });
});
