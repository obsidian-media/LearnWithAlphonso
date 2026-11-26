import { describe, expect, it } from "vitest";
import type { Question, Unit } from "../data/curriculum";
import { GOALS } from "./learner-profile";
import { deriveAnswerCorrectness } from "./srs";
import {
  addGoalVariants,
  allAcceptableAnswers,
  lessonHasGoalVariant,
  resolveForGoal,
  variantProblems,
  variantSetProblems,
  variantShapeProblems,
  VARIANT_GOALS,
} from "./goal-variants";

const MC: Question = {
  id: "q1",
  type: "mc",
  prompt: "We eat ___ seven o'clock.",
  choices: ["at", "in", "on", "for"],
  answer: 0,
  explanation: 'We say "at" with clock times.',
  term: "at",
  meaning: "used with clock times",
  example: "We eat at seven.",
  goalVariants: {
    travel: {
      prompt: "The train leaves ___ seven o'clock.",
      choices: ["in", "at", "on", "for"],
      answer: 1,
      explanation: 'We say "at" with clock times.',
    },
  },
};

const FILL: Question = {
  id: "q2",
  type: "fill",
  prompt: "Nice to ___ you.",
  bank: ["meet", "meat", "met", "meeting"],
  answer: "meet",
  explanation: 'You say "meet" when you see someone for the first time.',
  goalVariants: {
    work: {
      prompt: "It was great to ___ the team today.",
      bank: ["meet", "meat", "met", "meeting"],
      answer: "meet",
      explanation: 'You say "meet" when you see someone for the first time.',
    },
  },
};

const TRANSLATE: Question = {
  id: "t1",
  type: "translate",
  prompt: "Ask where the bank is.",
  acceptableAnswers: ["Where is the bank?"],
  explanation: 'You ask "Where is the bank?"',
  goalVariants: {
    travel: {
      prompt: "Ask where the station is.",
      acceptableAnswers: ["Where is the station?", "Where's the station?"],
      explanation: 'You ask "Where is the station?"',
    },
  },
};

describe("resolveForGoal", () => {
  it("returns the very same question when the goal has no variant", () => {
    expect(resolveForGoal(MC, "work")).toBe(MC);
    expect(resolveForGoal(MC, null)).toBe(MC);
    expect(resolveForGoal(MC, undefined)).toBe(MC);
    expect(resolveForGoal({ ...MC, goalVariants: undefined }, "travel")).toEqual({
      ...MC,
      goalVariants: undefined,
    });
  });

  it("keeps the id, type and count-defining fields while swapping the variant's own", () => {
    const r = resolveForGoal(MC, "travel");
    expect(r.id).toBe("q1");
    expect(r.type).toBe("mc");
    expect(r.prompt).toBe("The train leaves ___ seven o'clock.");
    if (r.type !== "mc") throw new Error("type");
    expect(r.choices[r.answer]).toBe("at");
    // Same answer text, so the authored vocab card still describes it.
    expect(r.term).toBe("at");
    expect(r.example).toBe("We eat at seven.");
  });

  it("drops the base answer's vocab card when the variant's answer differs", () => {
    const q: Question = {
      ...MC,
      goalVariants: {
        travel: {
          prompt: "The bus leaves ___ noon.",
          choices: ["in", "at", "on", "for"],
          answer: 1,
          explanation: 'We say "at" with clock times.',
        },
      },
    };
    expect(resolveForGoal(q, "travel")).toMatchObject({ term: "at" });
    const other: Question = {
      ...q,
      goalVariants: {
        travel: {
          prompt: "We ___ the train.",
          choices: ["miss", "mist", "mess", "moss"],
          answer: 0,
          explanation: 'You say "miss".',
        },
      },
    };
    const r = resolveForGoal(other, "travel");
    expect(r).not.toHaveProperty("term");
    expect(r).not.toHaveProperty("meaning");
    expect(r).not.toHaveProperty("example");
  });

  it("only overrides fields its type has (a stray field never lands on the question)", () => {
    const q: Question = {
      id: "s1",
      type: "speak",
      prompt: "Say this aloud:",
      answer: "She is a doctor",
      explanation: 'You say "She is a doctor".',
      goalVariants: {
        work: {
          prompt: "Say this aloud:",
          answer: "She is a manager",
          explanation: 'You say "She is a manager".',
          choices: ["x"],
        },
      },
    };
    const r = resolveForGoal(q, "work");
    expect(r).not.toHaveProperty("choices");
    expect(r).toMatchObject({ answer: "She is a manager" });
  });

  it("tags a lesson only for a goal that has a variant", () => {
    const lesson = { questions: [MC, FILL] };
    expect(lessonHasGoalVariant(lesson, "travel")).toBe(true);
    expect(lessonHasGoalVariant(lesson, "work")).toBe(true);
    expect(lessonHasGoalVariant(lesson, "school")).toBe(false);
    expect(lessonHasGoalVariant(lesson, null)).toBe(false);
  });

  it("knows exactly the goals the learner profile offers", () => {
    expect([...VARIANT_GOALS]).toEqual([...GOALS]);
  });
});

describe("grading accepts the base question or any variant", () => {
  it("accepts an answer that is right in the variant and still the base's", () => {
    const withDifferent: Question = {
      id: "q",
      type: "mc",
      prompt: "p",
      choices: ["cat", "dog", "bird"],
      answer: 1,
      explanation: "",
      goalVariants: {
        travel: { prompt: "v", choices: ["train", "bus", "taxi"], answer: 2, explanation: "" },
      },
    };
    expect(deriveAnswerCorrectness(withDifferent, "taxi")).toBe(true);
    expect(deriveAnswerCorrectness(withDifferent, "dog")).toBe(true);
    expect(deriveAnswerCorrectness(withDifferent, "cat")).toBe(false);
    expect(deriveAnswerCorrectness(withDifferent, "train")).toBe(false);
    // The resolved question (what the player grades) is still right for what it shows.
    const shown = resolveForGoal(withDifferent, "travel");
    expect(deriveAnswerCorrectness(shown, "taxi")).toBe(true);
    expect(deriveAnswerCorrectness(shown, "train")).toBe(false);
  });

  it("collects every translate wording, the base's first, without repeats", () => {
    expect(allAcceptableAnswers(TRANSLATE)).toEqual([
      "Where is the bank?",
      "Where is the station?",
      "Where's the station?",
    ]);
    expect(allAcceptableAnswers(MC)).toEqual([]);
  });
});

describe("the variant gate: no text is right in one version and wrong in another", () => {
  it("accepts sound variants", () => {
    expect(variantProblems(MC)).toEqual([]);
    expect(variantProblems(FILL)).toEqual([]);
    expect(variantProblems(TRANSLATE)).toEqual([]);
  });

  it("rejects a variant whose right answer is one of the canonical wrong answers", () => {
    const bad: Question = {
      ...MC,
      goalVariants: {
        travel: {
          prompt: "The train leaves ___ seven o'clock.",
          choices: ["in", "at", "on", "for"],
          // "on" is a wrong choice of the base question.
          answer: 2,
          explanation: 'We say "on".',
        },
      },
    };
    const problems = variantSetProblems(bad);
    expect(problems.join(" ")).toMatch(/"on" is the right answer of the travel variant/);
  });

  it("rejects the reverse: the canonical right answer sitting among the variant's wrong choices", () => {
    const bad: Question = {
      ...MC,
      goalVariants: {
        travel: {
          prompt: "The train leaves ___ platform nine.",
          // "at" (the base answer) is a wrong choice here; "by" is the variant's answer and is NOT a base wrong choice,
          // so only the reverse direction can catch this.
          choices: ["in", "at", "by", "near"],
          answer: 2,
          explanation: 'We say "by".',
        },
      },
    };
    const problems = variantSetProblems(bad);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/"at" is the right answer of the base question/);
  });

  it("rejects the same clash between two variants of different goals", () => {
    const bad: Question = {
      ...FILL,
      goalVariants: {
        travel: {
          prompt: "We ___ the guide at nine.",
          bank: ["meet", "greet", "meat", "melt"],
          answer: "meet",
          explanation: '"meet"',
        },
        work: {
          prompt: "We ___ clients in the lobby.",
          bank: ["greet", "meet", "great", "grit"],
          answer: "greet",
          explanation: '"greet"',
        },
      },
    };
    // "meet" is right for travel but a wrong choice for work, and "greet" the other way round.
    expect(variantSetProblems(bad).length).toBeGreaterThanOrEqual(2);
  });

  it("checks a listening and a fill variant the same way", () => {
    const listening: Question = {
      id: "l1",
      type: "listening",
      prompt: "What did you hear?",
      audioText: "I went home",
      choices: ["I went home", "I want home", "I went hum", "I wept home"],
      answer: "I went home",
      explanation: "",
      goalVariants: {
        travel: {
          prompt: "What did you hear?",
          audioText: "I want home",
          choices: ["I want home", "I went home", "I wend home", "I wand home"],
          answer: "I want home",
          explanation: "",
        },
      },
    };
    expect(variantSetProblems(listening).length).toBeGreaterThan(0);
  });

  it("rejects a malformed variant, whatever the type", () => {
    const noBlank = variantShapeProblems(FILL, {
      prompt: "Nice to meet you.",
      bank: ["meet", "meat", "met", "meeting"],
      answer: "meet",
      explanation: "e",
    });
    expect(noBlank.join(" ")).toMatch(/blank/);
    const answerNotInBank = variantShapeProblems(FILL, {
      prompt: "Nice to ___ you.",
      bank: ["meet", "meat", "met", "meeting"],
      answer: "greet",
      explanation: "e",
    });
    expect(answerNotInBank.join(" ")).toMatch(/bank/);
    const wrongCount = variantShapeProblems(MC, {
      prompt: "p",
      choices: ["a", "b"],
      answer: 0,
      explanation: "e",
    });
    expect(wrongCount.join(" ")).toMatch(/4/);
    const reorder: Question = {
      id: "r",
      type: "reorder",
      prompt: "",
      tokens: [],
      answer: "",
      explanation: "",
    };
    expect(variantShapeProblems(reorder, { prompt: "p", explanation: "e" }).join(" ")).toMatch(
      /cannot have variants/,
    );
    const stray = variantShapeProblems(TRANSLATE, {
      prompt: "p",
      explanation: "e",
      acceptableAnswers: ["a"],
      choices: ["x"],
    });
    expect(stray.join(" ")).toMatch(/not a field/);
  });
});

describe("addGoalVariants", () => {
  const units = (): Unit[] => [
    {
      id: "u1",
      level: "A1",
      eyebrow: "",
      title: "",
      description: "",
      lessons: [
        {
          id: "u1l1",
          title: "",
          subtitle: "",
          questions: [
            { ...MC, goalVariants: undefined },
            { ...FILL, goalVariants: undefined },
          ],
        },
      ],
    },
  ];

  it("lays the file over the named questions and leaves every id and count alone", () => {
    const out = addGoalVariants(units(), { u1l1: { q1: MC.goalVariants! } });
    const qs = out[0]!.lessons[0]!.questions;
    expect(qs.map((q) => q.id)).toEqual(["q1", "q2"]);
    expect(qs[0]!.goalVariants?.travel?.prompt).toMatch(/train/);
    expect(qs[1]!.goalVariants).toBeUndefined();
  });

  it("returns the units untouched for an empty file", () => {
    const u = units();
    expect(addGoalVariants(u, {})).toBe(u);
  });

  it("throws on a lesson or question that does not exist", () => {
    expect(() => addGoalVariants(units(), { nope: { q1: MC.goalVariants! } })).toThrow(/lessons/);
    expect(() => addGoalVariants(units(), { u1l1: { zzz: MC.goalVariants! } })).toThrow(
      /questions that do not exist/,
    );
  });

  it("throws on a variant that breaks the disjointness rule, so unsound content cannot load", () => {
    expect(() =>
      addGoalVariants(units(), {
        u1l1: {
          q1: {
            travel: {
              prompt: "The train leaves ___ seven o'clock.",
              choices: ["in", "at", "on", "for"],
              answer: 2,
              explanation: 'We say "on".',
            },
          },
        },
      }),
    ).toThrow(/right answer/);
  });
});
