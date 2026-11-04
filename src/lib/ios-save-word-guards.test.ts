import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Save-word in French and Spanish, iPhone half. The app target only compiles in CI (ios-app-build), so these
// read the Swift source. The rule: which words are tappable is an explicit `mode` at every TappableText call site
// (no default), never a nil that means something different per course. Lesson explanations in French and Spanish are
// English with course text quoted inside, so they use `.lesson` (spans or nothing); Hector replies and podcast
// transcripts are wholly in the course's language, so they use `.allWords`, exactly as before French and Spanish
// lesson spans existed.
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
  it("TappableText: the mode is required, with no default", () => {
    expect(tappable).toMatch(/^ {4}let mode: Mode$/m);
    expect(tappable).not.toMatch(/var mode: Mode\s*=/);
    expect(tappable).not.toContain("courseSpans");
  });

  it("TappableText: each mode links what it says", () => {
    const pieces = between(tappable, "private var pieces", "private var attributed");
    expect(pieces).toMatch(
      /case \.allWords: return \[\.init\(text: text, isCourseLanguage: true\)\]/,
    );
    expect(pieces).toMatch(
      /case \.plain: return \[\.init\(text: text, isCourseLanguage: false\)\]/,
    );
    expect(pieces).toContain("CourseLanguageSpans.split(text, spans: spans)");
  });

  it("TappableText.Mode.lesson: English links everything, French and Spanish need spans, else nothing", () => {
    const lessonMode = between(tappable, "static func lesson", "private var pieces");
    expect(lessonMode).toMatch(
      /if SavedWordPolicy\.savesWholeText\(inCourse: course\) \{ return \.allWords \}/,
    );
    expect(lessonMode).toMatch(/guard let spans, !spans\.isEmpty else \{ return \.plain \}/);
    expect(lessonMode).toContain("return .spans(spans)");
  });

  it("every TappableText caller is pinned to its mode", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const full = join(dir, f);
        if (statSync(full).isDirectory()) walk(full);
        else if (f.endsWith(".swift")) files.push(full);
      }
    };
    walk(SRC);
    const found: Record<string, string[]> = {};
    for (const f of files) {
      const src = readFileSync(f, "utf8").replace(/\r\n/g, "\n");
      for (const m of src.matchAll(/TappableText\(([\s\S]*?)\)\s*(?:\{|\n\s*\.)/g)) {
        const mode =
          /mode: (\.allWords|\.lesson\([^)]*\)|mode)(?=[,\s]|$)/.exec(m[1])?.[1] ?? "MISSING";
        (found[f.slice(SRC.length + 1).replaceAll("\\", "/")] ??= []).push(mode);
      }
    }
    expect(found).toEqual({
      "AssistantReply.swift": [".allWords"],
      "DesignSystem/AlphonsoComponents.swift": [
        "mode",
        ".lesson(course: saveCourse, spans: courseSpans)",
      ],
      "LessonPlayerView.swift": [".allWords"],
      "PodcastMiniBar.swift": [".allWords"],
    });
  });

  it("TappableText: only course-language pieces get a link", () => {
    expect(between(tappable, "private var attributed", "private func sentence")).toContain(
      "if part.isCourseLanguage, segment.isWord",
    );
  });

  it("AlphonsoTipCard: a non-English course without spans renders plain text", () => {
    const card = between(components, "struct AlphonsoTipCard", "struct ExplanationView");
    expect(card).toContain("TappableText.Mode.lesson(course: saveCourse, spans: courseSpans)");
    expect(card).toMatch(/return mode == \.plain \? nil : mode/);
    expect(card).toContain("let mode = tapMode");
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
