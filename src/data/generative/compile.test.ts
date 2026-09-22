import { describe, expect, it } from "vitest";
import { baseForm, thirdPersonForm, pastForm } from "./compile";

/**
 * Pinned to real output from a hands-on spike (2026-09-22), not assumed
 * from documentation -- see the design doc's component 4 self-critique
 * for why. If `compromise` is ever upgraded and one of these starts
 * failing, that's a real finding to investigate, not a test to loosen.
 */
describe("baseForm/thirdPersonForm/pastForm", () => {
  const cases: [verb: string, base: string, third: string, past: string][] = [
    ["have", "have", "has", "had"],
    ["go", "go", "goes", "went"],
    ["do", "do", "does", "did"],
    ["walk", "walk", "walks", "walked"],
    ["run", "run", "runs", "ran"],
    ["eat", "eat", "eats", "ate"],
    ["play", "play", "plays", "played"],
  ];

  it.each(cases)("%s -> base=%s third=%s past=%s", (verb, base, third, past) => {
    expect(baseForm(verb)).toBe(base);
    expect(thirdPersonForm(verb)).toBe(third);
    expect(pastForm(verb)).toBe(past);
  });
});
