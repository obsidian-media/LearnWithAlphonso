import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getCourse } from "../data/courses";
import { buildIOSContentBundle } from "./ios-content-export";
import { buildQuestionRows } from "./curriculum-seed";
import { buildFallbackPractice } from "./practice-fallback";
import { lessonGoalTag } from "./use-lesson-goal-tag";
import { resolveForGoal } from "./goal-variants";

// Where the goal-flavoured variants (goal-variants.ts) travel beyond the web player: the native bundles, the database
// seed the Edge Functions grade against, the practice fallback and the lesson card's tag. The pilot question below is
// a1p4l1:a1p4q2 ("We eat ___ seven o'clock.").

const LESSON = "a1p4l1";
const QUESTION = "a1p4q2";
const find = () => {
  const lesson = getCourse("en").findLesson(LESSON)!.lesson;
  return { lesson, q: lesson.questions.find((x) => x.id === QUESTION)! };
};

describe("the native bundles carry the variants", () => {
  it("the exported curriculum has goalVariants on the pilot question", () => {
    const unit = buildIOSContentBundle("en").units.find((u) =>
      u.lessons.some((l) => l.id === LESSON),
    )!;
    const q = unit.lessons.find((l) => l.id === LESSON)!.questions.find((x) => x.id === QUESTION)!;
    expect(Object.keys(q.goalVariants ?? {}).sort()).toEqual(["school", "travel", "work"]);
  });

  it("the committed iOS and Android bundles match (a stale export would ship old content)", () => {
    for (const file of [
      "ios/LearnWithAlphonso/Resources/curriculum-en.json",
      "ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/Resources/curriculum-en.json",
      "android/LearnWithAlphonso/app/src/main/assets/content/curriculum-en.json",
    ]) {
      expect(readFileSync(file, "utf8"), file).toContain('"goalVariants"');
    }
  });
});

describe("the database seed", () => {
  it("writes the variants in the row's own shape, and null for a question without any", () => {
    const rows = buildQuestionRows("en");
    const row = rows.find((r) => r.lesson_id === LESSON && r.id === QUESTION)!;
    expect(row.goal_variants).toHaveLength(3);
    const travel = row.goal_variants!.find((v) => v.goal === "travel")!;
    expect(travel.choices).toHaveLength(4);
    expect(travel.choices![travel.answer_index!]).toBe("at");
    expect(travel.answer_text).toBeUndefined();
    const plain = rows.find((r) => !r.goal_variants);
    expect(plain!.goal_variants).toBeNull();
  });

  it("a translate variant's wordings ride in `bank`", () => {
    const row = buildQuestionRows("en").find(
      (r) => r.lesson_id === "a1p5l1" && r.id === "a1p5q27",
    )!;
    const travel = row.goal_variants!.find((v) => v.goal === "travel")!;
    expect(travel.bank).toContain("I take a taxi to the airport.");
  });
});

describe("the practice fallback", () => {
  it("shows the goal's version of a question, and the base one without a goal", () => {
    const { lesson } = find();
    const prompts = (goal: Parameters<typeof buildFallbackPractice>[2]) =>
      buildFallbackPractice(lesson, "seed", goal).map((p) => p.prompt);
    const travelPrompt = resolveForGoal(find().q, "travel");
    // The fallback draws 3 of the lesson's cloze questions; across a few seeds the variant must appear for travel
    // and never for no goal.
    const seen = (goal: Parameters<typeof buildFallbackPractice>[2]) =>
      ["a", "b", "c", "d", "e", "f"].some((seed) =>
        buildFallbackPractice(lesson, seed, goal).some((p) => p.prompt === travelPrompt.prompt),
      );
    expect(seen("travel")).toBe(true);
    expect(seen(null)).toBe(false);
    expect(prompts(null)).toHaveLength(3);
  });
});

describe("the lesson card's tag", () => {
  it("shows for a goal the lesson has a variant for, and never otherwise", () => {
    expect(lessonGoalTag("en", LESSON, "travel")).toBe("travel");
    expect(lessonGoalTag("en", LESSON, "exam")).toBeNull();
    expect(lessonGoalTag("en", LESSON, null)).toBeNull();
    expect(lessonGoalTag("en", "u1l1", "travel")).toBeNull();
    expect(lessonGoalTag("en", null, "travel")).toBeNull();
  });
});
