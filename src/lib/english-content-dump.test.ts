import { describe, expect, it } from "vitest";
import { buildCourseDump } from "./english-content-dump";
import { PLACEMENT_QUESTIONS } from "@/data/placement";

describe("buildCourseDump", () => {
  it("dumps every curriculum question keyed as lessonId:questionId", () => {
    const dump = buildCourseDump("en");
    const all = Object.values(dump.byLevel).flat();
    expect(all.length).toBe(dump.totals.curriculum);
    expect(all.length).toBeGreaterThan(2000);
    for (const q of all) {
      expect(q.key).toBe(`${q.lessonId}:${q.questionId}`);
      expect(q.prompt.trim()).not.toBe("");
    }
  });

  it("includes placement questions, which are absent from questionIndex", () => {
    const dump = buildCourseDump("en");
    // Derived from the pool rather than pinned: this asserts that the dump
    // carries every placement question, which is the actual claim. A hardcoded
    // count says the same thing until someone adds content, and then says
    // something false.
    expect(dump.placement.length).toBe(PLACEMENT_QUESTIONS.length);
    expect(dump.totals.placement).toBe(PLACEMENT_QUESTIONS.length);
    // Review Focus #4: placement lives outside questionIndex entirely.
    for (const q of dump.placement) {
      // A translate entry has no choices -- its wordings are the answers.
      if (q.type === "translate") {
        expect(q.bank?.length).toBeGreaterThan(0);
        continue;
      }
      expect(q.choices?.length).toBeGreaterThan(0);
      expect(q.answer.trim()).not.toBe("");
    }
  });

  // placement.ts is NOT covered by curriculum-consistency.test.ts (it lives
  // outside questionIndex), so without this guard Task 5's placement edits
  // would have no automated safety net at all.
  it("keeps placement questions structurally valid", () => {
    for (const p of PLACEMENT_QUESTIONS) {
      expect(p.prompt.trim(), `${p.id} has an empty prompt`).not.toBe("");

      // The pool is no longer mc-only, so each shape is checked for the thing
      // that would make IT unanswerable. An unanswerable placement question is
      // worse than an unanswerable lesson one: it mis-places the learner
      // downward and sets their whole course.
      if (p.type === "translate") {
        expect(p.acceptableAnswers.length, `${p.id} needs wordings`).toBeGreaterThanOrEqual(2);
        for (const a of p.acceptableAnswers) {
          expect(a.trim(), `${p.id} has an empty wording`).not.toBe("");
        }
        continue;
      }
      if (p.type === "listening") {
        expect(p.audioText.trim(), `${p.id} has nothing to play`).not.toBe("");
        expect(p.choices, `${p.id} answer is not among its choices`).toContain(p.answer);
      } else {
        expect(p.answer, `${p.id} answer index out of range`).toBeGreaterThanOrEqual(0);
        expect(p.answer, `${p.id} answer index out of range`).toBeLessThan(p.choices.length);
      }
      for (const c of p.choices) {
        expect(c.trim(), `${p.id} has an empty choice`).not.toBe("");
      }
      const lowered = p.choices.map((c) => c.trim().toLowerCase());
      expect(new Set(lowered).size, `${p.id} has duplicate choices`).toBe(p.choices.length);
    }
  });

  // A placement answer that still carries a blank marker means the sentence
  // was pasted into the choices array instead of the prompt, so the "correct"
  // answer is the question itself and every real option is marked wrong.
  // Found live in the phase 1 audit (p2b, in the A1 band that decides a
  // learner's starting level).
  it("never offers a placement answer that is itself a blanked sentence", () => {
    for (const p of PLACEMENT_QUESTIONS) {
      // A translate question has no choices to offer; its wordings are the
      // answers, and the same rule applies to them.
      const offered = p.type === "translate" ? p.acceptableAnswers : p.choices;
      for (const choice of offered) {
        expect(choice, `${p.id} has a blanked sentence as a choice`).not.toContain("___");
      }
    }
  });

  it("surfaces the fill bank so an auditor can see answer-in-bank violations", () => {
    const dump = buildCourseDump("en");
    const fills = Object.values(dump.byLevel)
      .flat()
      .filter((q) => q.type === "fill");
    expect(fills.length).toBeGreaterThan(0);
    // Review Focus #5: answer must be present in its own bank.
    for (const q of fills) {
      expect(q.bank).toBeDefined();
      expect(q.bank).toContain(q.answer);
    }
  });

  it("dumps French with a course parameter, same shape as English", () => {
    const dump = buildCourseDump("fr");
    const all = Object.values(dump.byLevel).flat();
    expect(all.length).toBe(dump.totals.curriculum);
    expect(all.length).toBeGreaterThan(2000);
    for (const q of all) {
      expect(q.key).toBe(`${q.lessonId}:${q.questionId}`);
      expect(q.prompt.trim()).not.toBe("");
    }
    // French's placement pool lives in placement-fr.ts, separate from English's --
    // getCourse("fr").placementPool routes there rather than to PLACEMENT_QUESTIONS.
    expect(dump.placement.length).toBeGreaterThan(0);
  });
});
