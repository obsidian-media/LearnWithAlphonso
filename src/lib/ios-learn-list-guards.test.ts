import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The Learn screen's unit list, iPhone half: chunky lesson rows with a status medallion, and unit banners.
// The app target only compiles in CI (ios-app-build), so these read the Swift source.
const SRC = "ios/LearnWithAlphonso/Sources";
const read = (p: string) => readFileSync(`${SRC}/${p}`, "utf8").replace(/\r\n/g, "\n");
const from = (s: string, marker: string) => {
  const at = s.indexOf(marker);
  expect(at, `missing: ${marker}`).toBeGreaterThan(-1);
  return s.slice(at);
};

const browser = read("LessonBrowserView.swift");
const rowFile = read("DesignSystem/LessonPathRow.swift");
const unitList = from(browser, "ForEach(unitsForSelectedLevel) { unit in");

describe("Learn: the unit list", () => {
  it("each lesson is a LessonPathRow whose status comes from progress and the next lesson", () => {
    expect(unitList).toContain("LessonPathRow(");
    expect(unitList).toContain("completedLessonIDs.contains(lesson.id)");
    expect(unitList).toContain("nextLesson?.lesson.id == lesson.id");
    expect(unitList).toMatch(/\.done\b/);
    expect(unitList).toMatch(/\.next\b/);
    expect(unitList).toMatch(/\.open\b/);
    expect(unitList).toContain("number: index + 1");
    // The screenshot tests still find the first row.
    expect(unitList).toContain('"firstLessonRow"');
    // The unit rows no longer use the plain dot card.
    expect(unitList.slice(0, unitList.indexOf("} header: {"))).not.toContain("AlphonsoRowCard(");
  });

  it("the row is a chunky tile with a status medallion and one spoken label, without a chevron", () => {
    expect(rowFile).toContain("enum Status");
    expect(rowFile).toContain("case done, next, open");
    expect(rowFile).toContain('"checkmark"');
    expect(rowFile).toContain('"play.fill"');
    expect(rowFile).toContain('Text("\\(number)")');
    expect(rowFile).toContain(".offset(y: 4)");
    expect(rowFile).toContain(".accessibilityElement(children: .combine)");
    expect(rowFile).toContain('"Lesson \\(number), \\(title)');
    // The NavigationLink sits behind the row, so List adds no disclosure chevron.
    expect(unitList).toContain(
      ".background(NavigationLink(value: lesson.id) { EmptyView() }.opacity(0))",
    );
  });

  it("the unit header is a glass banner with the unit title large and a done count", () => {
    const header = from(unitList, "} header: {").slice(0, 2200);
    expect(header).toContain(".alphonsoGlass(");
    expect(header).toContain("AlphonsoFont.display(20, weight: .bold)");
    expect(header).toContain("unit.lessons.filter { completedLessonIDs.contains($0.id) }.count");
  });
});
