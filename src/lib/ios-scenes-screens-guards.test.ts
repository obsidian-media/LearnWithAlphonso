import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Visual refresh part 2, iPhone: the Lesson complete, Hector, Listen and Profile screens.
// The app target only compiles in CI (ios-app-build), so these read the Swift source.
const SRC = "ios/LearnWithAlphonso/Sources";
const read = (p: string) => readFileSync(`${SRC}/${p}`, "utf8").replace(/\r\n/g, "\n");
/** The source from the first occurrence of `marker` onwards. */
const from = (s: string, marker: string) => {
  const at = s.indexOf(marker);
  expect(at, `missing: ${marker}`).toBeGreaterThan(-1);
  return s.slice(at);
};
/** The source between two markers. */
const between = (s: string, a: string, b: string) => {
  const tail = from(s, a);
  const end = tail.indexOf(b, a.length);
  expect(end, `missing: ${b}`).toBeGreaterThan(-1);
  return tail.slice(0, end);
};

describe("Lesson complete: stage, proud Alphonso, confetti, count-up, haptic", () => {
  const lesson = read("LessonPlayerView.swift");
  const finish = between(lesson, "private struct FinishView: View", "private struct GeneratedPracticeSection");
  const celebration = read("DesignSystem/Celebration.swift");

  it("the stage scene is behind the finish screen and Alphonso stands proud on it", () => {
    expect(finish).toContain(".screenScene(.complete)");
    expect(finish).toContain('SceneFigure(assetName: "Figure-alphonso-proud"');
    // The 180 pt sticker tile is gone from the finish screen.
    expect(finish).not.toContain("MascotTile(moment: .lessonComplete");
    // The spring entrance stays on the figure.
    expect(finish).toMatch(/Figure-alphonso-proud[\s\S]{0,300}\.springEntrance\(\)/);
  });

  it("text sits on a glass card, not straight on the stage", () => {
    expect(finish).toContain(".alphonsoGlass(");
    const glassAt = finish.lastIndexOf(".alphonsoGlass()");
    expect(glassAt).toBeGreaterThan(-1);
    expect(finish.indexOf("LessonFinishCopy.headline")).toBeLessThan(glassAt);
    expect(finish.indexOf("GeneratedPracticeSection(")).toBeLessThan(glassAt);
  });

  it("the three buttons and the practice section behave and read exactly as before", () => {
    expect(finish).toMatch(/Button\("Continue to next lesson", action: onContinueToNextLesson\)\s*\n\s*\.buttonStyle\(\.alphonsoEmber\)/);
    expect(finish).toMatch(/Button\("Practise with Hector", action: onPractiseWithHector\)\s*\n\s*\.buttonStyle\(\.alphonsoSecondary\)/);
    expect(finish).toContain("if let onContinueToNextLesson {");
    expect(finish).toContain("if let onPractiseWithHector {");
    expect(finish).toContain("GeneratedPracticeSection(lessonID: lessonID, course: course, session: session)");
    expect(lesson).toContain('Text("Generate more practice")');
  });

  it("confetti is a Canvas burst with no package, and nothing at all under Reduce Motion", () => {
    expect(celebration).toContain("struct ConfettiBurst: View");
    expect(celebration).toContain("Canvas {");
    expect(celebration).toContain("TimelineView(.animation)");
    const burst = from(celebration, "struct ConfettiBurst");
    expect(burst).toContain("@Environment(\\.accessibilityReduceMotion)");
    expect(burst).toMatch(/if reduceMotion \|\| finished \{\s*\n\s*Color\.clear/);
    expect(burst).toContain(".allowsHitTesting(false)");
    expect(burst).toContain(".accessibilityHidden(true)");
    expect(finish).toContain("ConfettiBurst()");
  });

  it("XP and streak count up from 0 over about 0.8 s; accuracy and Reduce Motion show the final value", () => {
    expect(celebration).toContain("struct CountingText: View, Animatable");
    expect(celebration).toMatch(/static let duration: Double = 0\.8/);
    const chip = from(lesson, "private struct LessonRewardChipView");
    expect(chip).toContain("CountingText(");
    expect(chip).toContain("RewardCountUp.duration");
    expect(chip).toMatch(/reduceMotion \|\| reached \? split\.number : 0/);
    // Only the XP and streak chips count; accuracy is shown as it is.
    expect(chip).toMatch(/chip\.kind != \.accuracy/);
    expect(chip).toContain('.accessibilityLabel("\\(title): \\(chip.value)")');
  });

  it("the chips pop in one after another, and all at once under Reduce Motion", () => {
    expect(finish).toContain("@Environment(\\.accessibilityReduceMotion)");
    expect(finish).toMatch(/\.springEntrance\(delay: reduceMotion \? 0 : 0\.15 \+ Double\(index\) \* 0\.12\)/);
  });

  it("a success haptic fires once on appear, and is kept under Reduce Motion", () => {
    expect(finish).toContain(".sensoryFeedback(.success, trigger: celebrated)");
    expect(finish).toMatch(/\.onAppear \{[\s\S]{0,200}celebrated = true/);
    // The haptic is not behind the reduceMotion check.
    const onAppear = between(finish, ".onAppear {", ".fullScreenCover");
    expect(onAppear).not.toContain("reduceMotion");
  });
});
