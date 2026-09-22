import { describe, expect, it } from "vitest";
import { baseForm, thirdPersonForm, pastForm, compileLine } from "./compile";
import { TEMPLATES } from "./templates";

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

describe("compileLine", () => {
  const svoPresent = TEMPLATES.find((t) => t.id === "svo-present")!;
  const svoPast = TEMPLATES.find((t) => t.id === "svo-past")!;

  // Regression tests for finding C3 (2026-09-22 final review): generated
  // output had no capitalization and no articles ("it takes shower."),
  // which is ungrammatical -- falsifying the pilot's central
  // grammar-correct-by-construction claim. Expected values below verified
  // against the real installed compromise@14.17.0 tagging.

  it("conjugates to 3rd-person-singular when the subject is he/she/it, capitalized, with an article on the noun", () => {
    expect(compileLine(svoPresent, { subject: "he", verb: "walk", object: "dog" })).toBe(
      "He ___ a dog.|walks",
    );
    expect(compileLine(svoPresent, { subject: "she", verb: "run", object: "school" })).toBe(
      "She ___ a school.|runs",
    );
  });

  it("conjugates to base form for I/you/we/they, capitalized, with an article on the noun", () => {
    expect(compileLine(svoPresent, { subject: "I", verb: "walk", object: "dog" })).toBe(
      "I ___ a dog.|walk",
    );
    expect(compileLine(svoPresent, { subject: "they", verb: "eat", object: "cake" })).toBe(
      "They ___ a cake.|eat",
    );
    expect(compileLine(svoPresent, { subject: "you", verb: "go", object: "school" })).toBe(
      "You ___ a school.|go",
    );
  });

  it("uses past tense unconditionally on a past-tense template, no agreement", () => {
    expect(compileLine(svoPast, { subject: "I", verb: "go", object: "school" })).toBe(
      "I ___ a school.|went",
    );
    expect(compileLine(svoPast, { subject: "they", verb: "eat", object: "cake" })).toBe(
      "They ___ a cake.|ate",
    );
  });

  it("uses 'an' before a vowel-sound noun", () => {
    expect(compileLine(svoPresent, { subject: "I", verb: "eat", object: "apple" })).toBe(
      "I ___ an apple.|eat",
    );
  });

  it("omits the article for an uncountable noun", () => {
    expect(compileLine(svoPresent, { subject: "I", verb: "drink", object: "water" })).toBe(
      "I ___ water.|drink",
    );
    expect(compileLine(svoPresent, { subject: "she", verb: "play", object: "music" })).toBe(
      "She ___ music.|plays",
    );
  });

  it("throws if a required slot has no assignment", () => {
    expect(() => compileLine(svoPresent, { subject: "he", verb: "walk" })).toThrow(
      /missing assignment/,
    );
  });
});
