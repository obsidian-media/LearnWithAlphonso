import { describe, expect, it } from "vitest";
import { buildIOSContentBundle, buildIOSScenariosBundle } from "./ios-content-export";

describe("buildIOSContentBundle", () => {
  it("exports the full English curriculum with the expected lesson count", () => {
    const bundle = buildIOSContentBundle("en");
    const lessonCount = bundle.units.reduce((sum, u) => sum + u.lessons.length, 0);
    expect(lessonCount).toBe(609);
    expect(bundle.units.length).toBeGreaterThan(0);
  });

  it("exports the full French curriculum with the expected lesson count", () => {
    const bundle = buildIOSContentBundle("fr");
    const lessonCount = bundle.units.reduce((sum, u) => sum + u.lessons.length, 0);
    // 500 (V3 pkg 4a) + 25 (phase 2 PR 2: fra1p21/fra2p21/frb1p21/frb2p21/frc1p21,
    // one 25-line translate pack per level, 5 lessons each -- see
    // docs/superpowers/specs/2026-09-24-french-phase-2-question-types-design.md
    expect(lessonCount).toBe(525);
  });

  it("preserves question shape exactly (mc and fill variants both present)", () => {
    const bundle = buildIOSContentBundle("en");
    const allQuestions = bundle.units.flatMap((u) => u.lessons.flatMap((l) => l.questions));
    const hasMc = allQuestions.some((q) => q.type === "mc" && Array.isArray(q.choices));
    const hasFill = allQuestions.some((q) => q.type === "fill" && Array.isArray(q.bank));
    expect(hasMc).toBe(true);
    expect(hasFill).toBe(true);
  });

  it("exports conversation scenarios with all required fields", () => {
    const scenarios = buildIOSScenariosBundle();
    expect(scenarios.length).toBeGreaterThan(0);
    for (const s of scenarios) {
      expect(s.id).toBeTruthy();
      expect(s.systemPrompt).toBeTruthy();
      expect(s.opener).toBeTruthy();
    }
  });
});
