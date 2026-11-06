import { describe, expect, it } from "vitest";
import type { Unit } from "./curriculum";
import {
  applyPlacementReviewFixes,
  applyReviewFixes,
  REVIEW_FIXES,
  REVIEW_FIXES_UNMATCHED,
} from "./review-fixes";
import { fullInventory } from "../lib/content-review/inventory";
import { checkFix } from "../lib/content-review/fixes";

const units: Unit[] = [
  {
    id: "u1",
    level: "A1",
    eyebrow: "Unit 1",
    title: "T",
    description: "D",
    lessons: [
      {
        id: "l1",
        title: "L",
        subtitle: "S",
        questions: [
          {
            id: "q1",
            type: "fill",
            prompt: "Je ___ (être) ici.",
            bank: ["suis", "es", "est"],
            answer: "suis",
            explanation: "x",
          },
          {
            id: "q2",
            type: "fill",
            prompt: "Tu ___ (être) là.",
            bank: ["es", "suis", "est"],
            answer: "es",
            explanation: "y",
          },
        ],
      },
    ],
  },
];

describe("the review overlay", () => {
  it("applies question, card, lesson and unit fixes by item id", () => {
    const out = applyReviewFixes(units, "fr", {
      "fr:question:l1/q2": { patch: { explanation: 'With "tu", être is "es".' }, reason: "r" },
      "fr:card:l1/suis": { patch: { meaning: "am" }, reason: "r" },
      "fr:lesson-meta:l1": { patch: { title: "Être" }, reason: "r" },
      "fr:unit-meta:u1": { patch: { description: "Être au présent" }, reason: "r" },
    });
    expect(out[0]!.description).toBe("Être au présent");
    expect(out[0]!.lessons[0]!.title).toBe("Être");
    expect(out[0]!.lessons[0]!.questions[0]).toMatchObject({ meaning: "am" });
    expect(out[0]!.lessons[0]!.questions[1]!.explanation).toBe('With "tu", être is "es".');
    expect(out[0]!.lessons[0]!.questions.map((q) => q.id)).toEqual(["q1", "q2"]);
  });

  it("a fix that matches nothing is recorded (no stale fix sits there silently)", () => {
    const before = REVIEW_FIXES_UNMATCHED.length;
    applyReviewFixes(units, "fr", { "fr:question:l1/q9": { patch: { prompt: "x" }, reason: "r" } });
    expect(REVIEW_FIXES_UNMATCHED.splice(before)).toEqual(["fr:question:l1/q9"]);
  });

  it("refuses a field that cannot be patched (ids, types)", () => {
    expect(() =>
      applyReviewFixes(units, "fr", { "fr:question:l1/q1": { patch: { id: "q7" }, reason: "r" } }),
    ).toThrow(/cannot be patched/);
  });

  it("placement fixes apply by id and must match", () => {
    const pq = [
      {
        id: "fp1",
        level: "A1" as const,
        type: "mc" as const,
        prompt: "p",
        choices: ["a", "b"],
        answer: 0,
      },
    ];
    expect(
      applyPlacementReviewFixes(pq, "fr", {
        "fr:placement:fp1": { patch: { prompt: "q" }, reason: "r" },
      })[0]!.prompt,
    ).toBe("q");
    const before = REVIEW_FIXES_UNMATCHED.length;
    applyPlacementReviewFixes(pq, "fr", {
      "fr:placement:zz": { patch: { prompt: "q" }, reason: "r" },
    });
    expect(REVIEW_FIXES_UNMATCHED.splice(before)).toEqual(["fr:placement:zz"]);
  });

  it("every shipped fix matches the built content (the app records, CI refuses)", () => {
    // Building the courses (fullInventory below, and the imports) applies the shipped overlay.
    fullInventory();
    expect(REVIEW_FIXES_UNMATCHED).toEqual([]);
  });

  it("every committed fix still passes the fix checks against the content it was written for", () => {
    // The overlay is applied in the built content, so re-check each entry against its item as it is
    // now: a fix must leave the item exactly as the patch says (the checks hold on the result).
    const items = new Map(fullInventory().map((it) => [it.id, it]));
    for (const course of ["en", "fr", "es"] as const)
      for (const [id, fix] of Object.entries(REVIEW_FIXES[course])) {
        const it = items.get(id);
        expect(it, id).toBeDefined();
        for (const [k, v] of Object.entries(fix.patch))
          expect(it!.data[k], `${id} ${k}`).toEqual(v);
        expect(
          checkFix(it!, { id, patch: fix.patch, reason: fix.reason, keyChange: fix.keyChange }),
          id,
        ).toEqual([]);
      }
  });
});
