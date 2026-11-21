import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Follow-ups from the scenes round's review, iPhone half. Source-text guards: the app target only compiles in CI.
const SRC = "ios/LearnWithAlphonso/Sources";
const read = (p: string) => readFileSync(`${SRC}/${p}`, "utf8").replace(/\r\n/g, "\n");
const between = (s: string, a: string, b: string) => {
  const i = s.indexOf(a);
  expect(i, `missing: ${a}`).toBeGreaterThan(-1);
  const j = s.indexOf(b, i + a.length);
  expect(j, `missing: ${b}`).toBeGreaterThan(-1);
  return s.slice(i, j);
};

describe("iOS scenes follow-ups", () => {
  const map = read("LearnClimbMap.swift");
  const browser = read("LessonBrowserView.swift");
  const listen = read("ListenView.swift");

  it("VoiceOver hears Alphonso's greeting as its own element, and the climb's nodes as buttons", () => {
    expect(map).not.toContain('accessibilityLabel("Continue:');
    expect(map).toContain('.accessibilityLabel("Alphonso: \\(greeting)")');
    expect(map).toContain(".accessibilityAddTraits(.isButton)");
  });

  it("the unit is drawn once, by the climbing map: the old Up next card is not mounted", () => {
    expect(browser).not.toContain("LearnCurrentUnitCard(");
    expect(browser).toContain("LearnClimbMap(");
  });

  it("the Listen root draws the studio once, not once per layer", () => {
    expect(listen.match(/\.screenScene\(\.listen\)/g)?.length ?? 0).toBeLessThanOrEqual(2);
    // The root is the rooms shelf now. It sits on the one studio ListenView paints, so it must paint none of its own.
    expect(listen).toContain("ListenShelfRoot(");
    expect(read("ListenShelfViews.swift")).not.toContain(".screenScene(");
  });

  it("the old winding path map is gone and the climbing map is the one way in: no hero beside it", () => {
    expect(map).not.toContain("PathNodeView");
    expect(map).not.toContain("LearnPathMap");
    expect(browser).not.toContain("LearnPathMap(");
    expect(browser).not.toContain("LearnHeroStage(");
    expect(browser).toContain("LearnClimbMap(");
  });
});
