import { describe, expect, it } from "vitest";
import { curriculum, type GoalVariantBody, type Question } from "./curriculum";
import { curriculumFr } from "./curriculum-fr";
import { curriculumEs } from "./curriculum-es";
import { GOAL_VARIANTS } from "./goal-variants";
import {
  britishProblems,
  existingKeys,
  explanationProblems,
  listeningGate,
  speakGate,
  translateGate,
  type GateContext,
} from "../lib/lesson-mix/gates";
import { metaTextProblems } from "../lib/lesson-mix/meta-gate";
import { variantProblems, VARIANT_GOALS } from "../lib/goal-variants";
import { deriveAnswerCorrectness } from "../lib/srs";
import type { Unit } from "./curriculum";

// The goal-flavoured variants every course ships (src/data/goal-variants/{en,fr,es}.json). addGoalVariants already
// refuses unsound DATA at load (shape and the right-in-one-wrong-in-another rule); this holds the CONTENT to the
// existing lesson-mix gates: a variant is a question a learner meets, so it passes what an appended question passes.

const UNITS: Record<"en" | "fr" | "es", Unit[]> = {
  en: curriculum,
  fr: curriculumFr,
  es: curriculumEs,
};

function questions(course: "en" | "fr" | "es"): { lessonId: string; level: string; q: Question }[] {
  return UNITS[course].flatMap((u) =>
    u.lessons.flatMap((l) => l.questions.map((q) => ({ lessonId: l.id, level: u.level, q }))),
  );
}

const ctxFor = (course: "en" | "fr" | "es", level: string): GateContext => ({
  course,
  level: level as GateContext["level"],
  existing: existingKeys(UNITS[course]),
});

/** The text a variant's answer fills the blank with, for the explanation to quote. */
const filled = (prompt: string, answer: string) =>
  prompt.replace(/\s*\([^)]*\)/g, "").replace("___", answer);

for (const course of ["en", "fr", "es"] as const) {
  const withVariants = questions(course).filter((x) => x.q.goalVariants);

  describe(`goal variants (${course})`, () => {
    it("only names real lessons and questions, and keeps every id and count (the loader throws otherwise)", () => {
      const file = GOAL_VARIANTS[course];
      const named = Object.entries(file).flatMap(([l, qs]) =>
        Object.keys(qs).map((q) => `${l}:${q}`),
      );
      expect(withVariants.map((x) => `${x.lessonId}:${x.q.id}`).sort()).toEqual(named.sort());
    });

    it("every variant of every question is sound data", () => {
      for (const { lessonId, q } of withVariants)
        expect(variantProblems(q), `${lessonId}:${q.id}`).toEqual([]);
    });

    it("only uses goals the learner profile offers", () => {
      for (const { q } of withVariants)
        for (const g of Object.keys(q.goalVariants!)) expect(VARIANT_GOALS).toContain(g);
    });

    it("every variant passes the lesson-mix gates and quotes its own answer", () => {
      const failures: string[] = [];
      for (const { lessonId, level, q } of withVariants) {
        const ctx = ctxFor(course, level);
        for (const [goal, body] of Object.entries(q.goalVariants!)) {
          const at = `${lessonId}:${q.id} ${goal}`;
          const add = (ps: string[]) => ps.forEach((p) => failures.push(`${at}: ${p}`));
          if (
            q.type !== "speak" &&
            q.type !== "listening" &&
            body!.prompt === (q as { prompt: string }).prompt
          )
            add(["the prompt is the base prompt"]);
          if (q.type === "mc" || q.type === "fill") {
            const b = body!;
            const answer =
              q.type === "mc" ? (b.choices ?? q.choices)[b.answer as number]! : String(b.answer);
            add(explanationProblems(b.explanation, answer));
            add(metaTextProblems(String(b.prompt), "prompt"));
            add(britishProblems(course, [String(b.prompt), String(b.explanation)]));
            if (!String(b.explanation).includes(filled(String(b.prompt), answer)))
              add(["the explanation does not show the filled sentence"]);
          } else if (q.type === "listening") {
            const b = body!;
            const wrong = (b.choices ?? []).filter((c) => c !== b.answer);
            const r = listeningGate(
              { prompt: b.prompt, audioText: b.audioText, wrong, explanation: b.explanation },
              ctx,
            );
            add(r.problems);
          } else if (q.type === "speak") {
            const b = body!;
            add(speakGate({ answer: b.answer, explanation: b.explanation }, ctx).problems);
          } else if (q.type === "translate") {
            const b = body!;
            add(
              translateGate(
                {
                  prompt: b.prompt,
                  acceptableAnswers: b.acceptableAnswers,
                  explanation: b.explanation,
                },
                ctx,
              ).problems,
            );
          }
        }
      }
      expect(failures).toEqual([]);
    });

    it("each explanation quotes only words from its own version (no base or other-goal example)", () => {
      const fold = (t: string) =>
        t
          .toLowerCase()
          .replace(/[^\p{L}\p{N}' ]+/gu, " ")
          .replace(/\s+/g, " ")
          .trim();
      const failures: string[] = [];
      for (const { lessonId, q } of withVariants)
        for (const [goal, body] of Object.entries(q.goalVariants!)) {
          const b = body as GoalVariantBody;
          const own = fold(
            [
              b.prompt,
              b.answer,
              b.audioText,
              ...(b.acceptableAnswers ?? []),
              ...(b.choices ?? []),
              ...(b.bank ?? []),
            ]
              .filter((x) => typeof x === "string")
              .join(" | "),
          );
          // A quoted span of three or more words is an example sentence or phrase (not the gloss after "means"): it must come from this version.
          const parts = String(b.explanation).split('"');
          for (let k = 1; k < parts.length; k += 2) {
            if (/means $/.test(parts[k - 1]!)) continue;
            const span = fold(parts[k]!);
            if (span.split(" ").length < 3) continue;
            if (!own.includes(span))
              failures.push(
                `${lessonId}:${q.id} ${goal}: quotes "${parts[k]}", which is not in its own version`,
              );
          }
        }
      expect(failures).toEqual([]);
    });

    it("each goal's version differs from the other goals' versions", () => {
      for (const { lessonId, q } of withVariants) {
        if (q.type === "speak" || q.type === "listening") continue;
        const prompts = Object.values(q.goalVariants!).map((b) => b!.prompt);
        expect(new Set(prompts).size, `${lessonId}:${q.id}`).toBe(prompts.length);
      }
    });

    it("each version's right answer is right for that goal, the base is right for every goal, and no other goal's is", () => {
      const rightOf = (q: Question, body: GoalVariantBody | undefined): string | null => {
        if (q.type === "mc") return (body!.choices ?? q.choices)[body!.answer as number]!;
        if (q.type === "translate") return body!.acceptableAnswers![0]!;
        if (q.type === "reorder") return null;
        return String(body!.answer);
      };
      const baseRight = (q: Question): string | null =>
        q.type === "mc"
          ? q.choices[q.answer]!
          : q.type === "translate"
            ? q.acceptableAnswers[0]!
            : q.type === "reorder"
              ? null
              : q.answer;
      for (const { lessonId, q } of withVariants) {
        const entries = Object.entries(q.goalVariants!);
        for (const [goal, body] of entries) {
          const at = `${lessonId}:${q.id} ${goal}`;
          const right = rightOf(q, body!)!;
          expect(deriveAnswerCorrectness(q, right, course, goal), at).toBe(true);
          expect(deriveAnswerCorrectness(q, baseRight(q)!, course, goal), at).toBe(true);
          // With no goal named only the base counts: a different version's answer is not right.
          if (right !== baseRight(q))
            expect(deriveAnswerCorrectness(q, right, course, null), at).toBe(false);
          for (const [other, otherBody] of entries) {
            if (other === goal) continue;
            const theirs = rightOf(q, otherBody!)!;
            if (theirs === right || theirs === baseRight(q)) continue;
            expect(deriveAnswerCorrectness(q, theirs, course, goal), `${at} vs ${other}`).toBe(
              false,
            );
          }
        }
      }
    });
  });
}

// The course-levels that ship variants. Each carries about 60 sentence-type questions, all three goals (exam and fun
// keep serving the base question). Add a level here in the PR that adds its content.
const SHIPPED: Record<"en" | "fr" | "es", string[]> = {
  en: ["A1", "A2"],
  fr: [],
  es: [],
};

describe("which course-levels ship goal variants", () => {
  for (const course of ["en", "fr", "es"] as const) {
    const withVariants = questions(course).filter((x) => x.q.goalVariants);

    it(`${course}: only the shipped levels have variants, each with about 60 questions for travel, work and school`, () => {
      expect([...new Set(withVariants.map((x) => x.level))].sort()).toEqual(
        [...SHIPPED[course]].sort(),
      );
      for (const level of SHIPPED[course]) {
        const atLevel = withVariants.filter((x) => x.level === level);
        expect(atLevel.length, `${course} ${level}`).toBeGreaterThanOrEqual(55);
        expect(atLevel.length, `${course} ${level}`).toBeLessThanOrEqual(65);
        for (const { q } of atLevel)
          expect(Object.keys(q.goalVariants!).sort()).toEqual(["school", "travel", "work"]);
      }
    });

    it(`${course}: never touches a lesson's questions (same ids, same count, same order as without the side file)`, () => {
      const base = (units: Unit[]) =>
        units.map((u) => u.lessons.map((l) => `${l.id}:${l.questions.map((x) => x.id).join(",")}`));
      const stripped = UNITS[course].map((u) => ({
        ...u,
        lessons: u.lessons.map((l) => ({
          ...l,
          questions: l.questions.map(({ goalVariants: _g, ...rest }) => rest as Question),
        })),
      }));
      expect(base(UNITS[course])).toEqual(base(stripped));
    });
  }
});
