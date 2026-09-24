import { describe, expect, it } from "vitest";
import { PLACEMENT_QUESTIONS } from "./placement";
import { PLACEMENT_QUESTIONS_FR } from "./placement-fr";
import { PLACEMENT_QUESTIONS_ES } from "./placement-es";
import { normaliseWritten } from "@/lib/translation-answer";
import type { Level } from "./levels";

const BANDS: Level[] = ["A1", "A2", "B1", "B2", "C1"];

/**
 * Assessment-validity guards, as opposed to the structural ones in
 * english-content-dump.test.ts.
 *
 * The distinction matters because every defect these catch was shipped by a
 * branch whose structural tests were green: a listening question whose four
 * options were two, a prompt containing its own answer, and a sentence printed
 * on screen that WAS the answer. None of that is malformed data -- it is data
 * that measures nothing, and it fails upward, placing a learner above their
 * real level and starting them on content they cannot do.
 */
describe("placement questions measure what they claim to", () => {
  it("gives every listening question four options, not two", () => {
    // Two options is a coin flip, in an exam where a band falls on 2 of 3.
    for (const q of PLACEMENT_QUESTIONS) {
      if (q.type !== "listening") continue;
      expect(q.choices.length, `${q.id} has ${q.choices.length} options`).toBe(4);
    }
  });

  it("never lets a prompt contain its own answer", () => {
    for (const q of PLACEMENT_QUESTIONS) {
      const prompt = normaliseWritten(q.prompt);
      const answers =
        q.type === "translate"
          ? q.acceptableAnswers
          : q.type === "listening"
            ? [q.answer]
            : [q.choices[q.answer] ?? ""];
      for (const a of answers) {
        const answer = normaliseWritten(a);
        expect(
          answer.length > 0 && prompt.includes(answer),
          `${q.id}: the prompt contains the accepted answer "${a}", so it can be passed by copying`,
        ).toBe(false);
      }
    }
  });

  it("keeps every band answerable when the device cannot play audio", () => {
    // The exam drops listening questions where speech synthesis is missing
    // (withoutUnplayableQuestions), so each band must still hold at least the
    // three questions a band draws without them.
    for (const band of BANDS) {
      const playable = PLACEMENT_QUESTIONS.filter(
        (q) => q.level === band && q.type !== "listening",
      );
      expect(
        playable.length,
        `${band} has only ${playable.length} non-audio questions`,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it("covers every band with each type the exam claims to assess", () => {
    // Without this, content could regress to a single listening question
    // overall and every other test would stay green.
    for (const band of BANDS) {
      const inBand = PLACEMENT_QUESTIONS.filter((q) => q.level === band);
      expect(inBand.filter((q) => q.type === "listening").length, `${band} listening`).toBe(2);
      expect(inBand.filter((q) => q.type === "translate").length, `${band} translate`).toBe(1);
      expect(inBand.filter((q) => q.type === "mc").length, `${band} mc`).toBeGreaterThanOrEqual(9);
    }
  });

  it("has no duplicate option text in any pool, in any course", () => {
    // The route compares the picked option's TEXT, so two identical options in
    // one question would make the comparison ambiguous.
    for (const [name, pool] of [
      ["en", PLACEMENT_QUESTIONS],
      ["fr", PLACEMENT_QUESTIONS_FR],
      ["es", PLACEMENT_QUESTIONS_ES],
    ] as const) {
      for (const q of pool) {
        if (q.type === "translate") continue;
        const seen = q.choices.map((c) => c.trim().toLowerCase());
        expect(new Set(seen).size, `${name} ${q.id} repeats an option`).toBe(q.choices.length);
      }
    }
  });

  it("has no duplicate ids in any pool", () => {
    for (const [name, pool] of [
      ["en", PLACEMENT_QUESTIONS],
      ["fr", PLACEMENT_QUESTIONS_FR],
      ["es", PLACEMENT_QUESTIONS_ES],
    ] as const) {
      const ids = pool.map((q) => q.id);
      expect(new Set(ids).size, `${name} has a duplicate placement id`).toBe(ids.length);
    }
  });
});
