import { describe, expect, it } from "vitest";
import { SCENARIOS, getScenario } from "./scenarios";

describe("getScenario", () => {
  it("finds every scenario by its id", () => {
    for (const s of SCENARIOS) {
      expect(getScenario(s.id)).toBe(s);
    }
  });

  it("returns undefined for an unknown id", () => {
    expect(getScenario("nope")).toBeUndefined();
  });
});

describe("SCENARIOS", () => {
  it("has no duplicate ids", () => {
    const ids = SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every scenario has an opener and a system prompt", () => {
    for (const s of SCENARIOS) {
      expect(s.opener).toBeTruthy();
      expect(s.systemPrompt).toBeTruthy();
      expect(["Beginner", "Intermediate", "Advanced"]).toContain(s.level);
    }
  });
});
