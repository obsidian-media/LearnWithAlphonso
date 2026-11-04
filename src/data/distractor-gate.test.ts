import { describe, expect, it } from "vitest";
import { getCourse } from "./courses";
import { QUESTION_FIXES } from "./question-fixes";
import { REVIEWED_PHRASES } from "./reviewed-phrases";
import {
  BLANKET_CONTEXT,
  checkDistractors,
  hasClue,
  inferSlot,
  type QuestionShape,
} from "./slot-types";

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

describe("the gate fails on the review's mutations", () => {
  it("rejects a meaningless clue: '(look at it)' does not disambiguate place words", () => {
    const issues = checkDistractors(
      shape("The cat is sitting ___ the table. (look at it)", "under", [
        "behind",
        "beside",
        "near",
      ]),
    );
    expect(issues.some((i) => i.kind === "also-correct")).toBe(true);
  });

  it("rejects lives / lion / lip / lid as forms of one verb", () => {
    const issues = checkDistractors(
      shape("She ___ in London.", "lives", ["lion", "lip", "lid"], {
        id: "a1p2q24",
        slot: "inflection",
      }),
    );
    expect(issues.some((i) => i.kind === "off-pool")).toBe(true);
  });

  it("rejects at / during / into / since in a fixed-phrase slot", () => {
    const issues = checkDistractors(shape("We went ___ bus.", "by", ["at", "during", "into"]));
    expect(
      issues.filter((i) => i.kind === "off-pool").map((i) => (i as { option: string }).option),
    ).toEqual(["during", "into"]);
  });

  it("rejects an adverb answer with noun options (suddenly / snow, fall, clear)", () => {
    const issues = checkDistractors(
      shape("The temperature dropped ___ overnight.", "suddenly", ["cards", "hurts"], {
        id: "a1p10q13",
        packAnswers: new Set(["suddenly", "cards", "hurts"]),
      }),
    );
    expect(issues.some((i) => i.kind === "pos-mismatch")).toBe(true);
  });

  it("does not accept the blanket reason, or a reason shared by two questions", () => {
    const base = shape("Pass the ___ and pepper.", "salt", ["meat", "cheese", "coffee"], {
      id: "a1p8q4",
      packAnswers: new Set(["salt", "meat", "cheese", "coffee"]),
    });
    expect(
      kinds({ ...base, context: "the sentence already rules out the other options" }),
    ).toContain("weak-context");
    expect(
      kinds({ ...base, context: "pepper goes with salt, none of the others do", contextUses: 2 }),
    ).toContain("weak-context");
    expect(
      kinds({ ...base, context: "pepper is paired with salt on a table, not with meat or cheese" }),
    ).not.toContain("weak-context");
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
            context: QUESTION_FIXES[`${lesson.id}/${q.id}`]?.context,
            slot: QUESTION_FIXES[`${lesson.id}/${q.id}`]?.slot,
            allow: QUESTION_FIXES[`${lesson.id}/${q.id}`]?.allow,
            reviewed: REVIEWED_PHRASES.has(`${lesson.id}/${q.id}`),
          },
        });
      }
  }
  const contextUses = new Map<string, number>();
  for (const it of items)
    if (it.shape.context)
      contextUses.set(it.shape.context, (contextUses.get(it.shape.context) ?? 0) + 1);
  for (const it of items) {
    if (it.shape.context) it.shape.contextUses = contextUses.get(it.shape.context);
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

  // Both are zero. A topic-word question needs a photo, a bracketed clue or a reviewed
  // sentence context, because every word of the topic fits until something rules it out.
  // A question whose slot cannot be inferred, or a hand-authored phrase question nobody
  // has read (reviewed-phrases.ts), is not allowed in.
  const PINNED_SPLIT = { picture: 45, context: 225, clue: 492 };
  // Honest debt, pinned, lowered as questions are rewritten; never raised.
  const POS_MISMATCH_BUDGET = 0;
  const WEAK_CONTEXT_BUDGET = 0;
  const NEEDS_CLUE_BUDGET = 0;
  const UNCLASSIFIED_BUDGET = 0;

  it("does not add topic-word options of another part of speech", () => {
    const n = all.filter(({ issues }) => issues.some((i) => i.kind === "pos-mismatch")).length;
    expect(n).toBeLessThanOrEqual(POS_MISMATCH_BUDGET);
  });

  it("does not add reviewed-context questions without a reason written for them", () => {
    const n = all.filter(({ issues }) => issues.some((i) => i.kind === "weak-context")).length;
    expect(n).toBeLessThanOrEqual(WEAK_CONTEXT_BUDGET);
  });

  it("does not add category questions without a clue", () => {
    const n = all.filter(({ issues }) => issues.some((i) => i.kind === "needs-clue")).length;
    expect(n).toBeLessThanOrEqual(NEEDS_CLUE_BUDGET);
  });

  it("does not add questions with an unknown slot", () => {
    const n = all.filter(({ issues }) => issues.some((i) => i.kind === "unclassified")).length;
    expect(n).toBeLessThanOrEqual(UNCLASSIFIED_BUDGET);
  });

  // The split of how topic-word questions are disambiguated, pinned so a change is a
  // decision: a reviewed photo, a bracketed clue, or a sentence that already rules the
  // others out. There are no bare topic questions (above).
  it("pins how pack questions are disambiguated", () => {
    const topic = all.filter(({ it }) => /^a[12]p[0-9]+q[0-9]+$/.test(it.shape.id));
    const count = (f: (s: QuestionShape) => boolean) =>
      topic.filter(({ it }) => f(it.shape)).length;
    const picture = count((s) => !!s.hasImage);
    const context = count(
      (s) => !s.hasImage && !!s.context && s.context !== BLANKET_CONTEXT && s.contextUses === 1,
    );
    const clue = count(
      (s) => !s.hasImage && (!s.context || s.context === BLANKET_CONTEXT) && hasClue(s.prompt),
    );
    expect({ picture, context, clue }).toEqual(PINNED_SPLIT);
  });
});
