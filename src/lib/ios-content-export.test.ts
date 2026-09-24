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
    expect(lessonCount).toBe(500); // V3 pkg 4a: closed the 125 -> ~500 French content gap
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
