import { describe, expect, it } from "vitest";
import { getCourse } from "./courses";
import { checkDistractors, inferSlot, type QuestionShape } from "./slot-types";

/**
 * The gate for docs/distractor-policy.md. Two parts:
 *  1. fixtures taken from real questions, so the gate is shown to fail on exactly the
 *     defects the owner reported;
 *  2. a sweep of every A1/A2 English cloze and multiple-choice question.
 */
function shape(
  prompt: string,
  answer: string,
  wrong: string[],
  extra: Partial<QuestionShape> = {},
) {
  return {
    key: "x/y",
    id: "a1p4q0",
    prompt,
    answer,
    options: [answer, ...wrong],
    ...extra,
  } satisfies QuestionShape;
}
const kinds = (q: QuestionShape) => checkDistractors(q).map((i) => i.kind);

describe("the gate fails on the reported defects", () => {
  it("rejects 'into / down / behind / during' for a place slot", () => {
    const issues = checkDistractors(
      shape("The dog is ___ the door.", "behind", ["into", "down", "during"]),
    );
    const off = issues
      .filter((i) => i.kind === "off-pool")
      .map((i) => (i as { option: string }).option);
    expect(off.sort()).toEqual(["down", "during", "into"]);
  });

  it("rejects 'ought / used / can to / can' for a modal slot", () => {
    const issues = checkDistractors(
      shape("She ___ speak three languages fluently. (she has the skill)", "can", [
        "ought",
        "used",
        "can to",
      ]),
    );
    const off = issues
      .filter((i) => i.kind === "off-pool")
      .map((i) => (i as { option: string }).option);
    expect(off).toContain("can to");
    expect(off).toContain("used");
  });

  it("rejects a second right answer: 'They study at home.'", () => {
    expect(kinds(shape("They ___ at home.", "are", ["study", "is", "am"]))).toContain(
      "also-correct",
    );
  });

  it("rejects pool members that all fit when there is no clue", () => {
    expect(
      kinds(shape("The cat is sitting ___ the table.", "under", ["behind", "beside", "near"])),
    ).toContain("also-correct");
  });

  it("accepts the same options once a clue picks one", () => {
    expect(
      checkDistractors(
        shape("The cat is sitting ___ the table. (below it)", "under", [
          "behind",
          "beside",
          "near",
        ]),
      ),
    ).toEqual([]);
  });

  it("accepts learner-error forms of one lemma", () => {
    expect(
      checkDistractors(
        shape('Past simple of "go": ___', "went", ["goed", "gone", "goes"], { id: "a2p1q0" }),
      ),
    ).toEqual([]);
  });

  it("asks a category question for a clue", () => {
    const q = shape("She's wearing a red ___.", "dress", ["sock", "hat", "coat"], {
      id: "a1p9q0",
      packAnswers: new Set(["dress", "sock", "hat", "coat"]),
    });
    expect(kinds(q)).toContain("needs-clue");
  });

  it("types the slots", () => {
    expect(inferSlot("The dog is ___ the door.", "behind", ["behind", "in"])).toBe("place-prep");
    expect(inferSlot("The ball rolled ___ the hill.", "down", ["down", "up"])).toBe("motion-prep");
    expect(inferSlot("I was born ___ 1998.", "in", ["in", "on"])).toBe("time-prep");
    expect(inferSlot("I ___ swim well.", "could", ["could", "can"])).toBe("modal");
    expect(inferSlot("___ is your name?", "What", ["What", "Why"])).toBe("wh-word");
  });
});

describe("the A1/A2 English bank", () => {
  const course = getCourse("en");
  const packAnswers = new Map<string, Set<string>>();
  const items: { shape: QuestionShape; level: string }[] = [];
  for (const unit of course.curriculum) {
    if (unit.level !== "A1" && unit.level !== "A2") continue;
    for (const lesson of unit.lessons)
      for (const q of lesson.questions) {
        if (q.type !== "mc" && q.type !== "fill") continue;
        const answer = q.type === "mc" ? q.choices[q.answer]! : q.answer;
        const options = q.type === "mc" ? q.choices : q.bank;
        const pack = /^(a[12]p\d+)q\d+$/.exec(q.id)?.[1];
        if (pack) {
          const s = packAnswers.get(pack) ?? new Set<string>();
          s.add(answer);
          packAnswers.set(pack, s);
        }
        items.push({
          level: unit.level,
          shape: {
            key: `${lesson.id}/${q.id}`,
            id: q.id,
            prompt: q.prompt,
            answer,
            options,
            hasImage: q.type === "mc" && !!q.imageKey,
          },
        });
      }
  }
  for (const it of items) {
    const pack = /^(a[12]p\d+)q\d+$/.exec(it.shape.id)?.[1];
    if (pack) it.shape.packAnswers = packAnswers.get(pack);
  }

  const all = items.map((it) => ({ it, issues: checkDistractors(it.shape) }));
  const describeIssue = (
    key: string,
    prompt: string,
    i: ReturnType<typeof checkDistractors>[number],
  ) => `${key} "${prompt}" ${JSON.stringify(i)}`;

  // Zero: every wrong option comes from its slot's pool (or the reviewed allow-list).
  // Target: 0. These are the questions whose wrong options come from outside their
  // slot's pool ("I ___ a student": am / plays, "The dog is ___ the door": into).
  const OFF_POOL_QUESTION_BUDGET = 0;

  it("does not add questions with a wrong option outside its slot's pool", () => {
    const bad = all.filter(({ issues }) => issues.some((i) => i.kind === "off-pool"));
    expect(
      bad.length,
      bad
        .slice(0, 5)
        .map(({ it }) => it.shape.key)
        .join(", "),
    ).toBeLessThanOrEqual(OFF_POOL_QUESTION_BUDGET);
  });

  it("has no wrong option that is also correct", () => {
    const bad = all.flatMap(({ it, issues }) =>
      issues
        .filter((i) => i.kind === "also-correct")
        .map((i) => describeIssue(it.shape.key, it.shape.prompt, i)),
    );
    expect(bad).toEqual([]);
  });

  // Known debt, pinned so it can only go down. A category question (a word from a topic
  // pack) needs a clue or a picture, because every word of the topic fits the sentence
  // until something rules it out. A question whose slot cannot be inferred is not yet
  // typed. Lower these when questions gain clues or slot types; never raise them.
  const NEEDS_CLUE_BUDGET = 605;
  const UNCLASSIFIED_BUDGET = 193;

  it("does not add category questions without a clue", () => {
    const n = all.filter(({ issues }) => issues.some((i) => i.kind === "needs-clue")).length;
    expect(n).toBeLessThanOrEqual(NEEDS_CLUE_BUDGET);
  });

  it("does not add questions with an unknown slot", () => {
    const n = all.filter(({ issues }) => issues.some((i) => i.kind === "unclassified")).length;
    expect(n).toBeLessThanOrEqual(UNCLASSIFIED_BUDGET);
  });
});
