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

  it("every scenario has an opener and a system prompt in every course", () => {
    for (const s of SCENARIOS) {
      for (const c of ["en", "fr", "es"] as const) {
        expect(s.opener[c]).toBeTruthy();
        expect(s.systemPrompt[c]).toBeTruthy();
      }
      expect(["Beginner", "Intermediate", "Advanced"]).toContain(s.level);
    }
  });
});
