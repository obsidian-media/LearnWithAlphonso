import { describe, expect, it } from "vitest";
import { getCourse } from "./courses";
import { rawCurriculum } from "./curriculum";
import { PLACEMENT_QUESTIONS } from "./placement";
import { QUESTION_FIXES } from "./question-fixes";
import { REVIEWED_PHRASES } from "./reviewed-phrases";
import {
  BLANKET_CONTEXT,
  buildPackVocab,
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

describe("the gate fails on the second review's mutations", () => {
  it("rejects a reason that only says the options are wrong", () => {
    const base = shape("Pass the ___ and pepper.", "salt", ["meat", "cheese", "coffee"], {
      id: "a1p8q4",
      packAnswers: new Set(["salt", "meat", "cheese", "coffee"]),
    });
    expect(
      kinds({ ...base, context: "meat, cheese and coffee cannot go with pepper on a table" }),
    ).toContain("weak-context");
  });

  it("rejects a clue that sits on top of unreplaced pack-neighbour options", () => {
    const q = shape(
      "She drinks ___ juice every morning. (squeezed from a citrus fruit)",
      "orange",
      ["still", "rare", "black"],
      {
        id: "a1p8q10",
        packAnswers: new Set(["orange", "still", "rare", "black"]),
        wrongReplaced: false,
      },
    );
    expect(kinds(q)).toContain("options-not-replaced");
  });

  it("does not let slot phrase + reviewed:true launder an owner example", () => {
    const issues = checkDistractors(
      shape("The dog is ___ the door.", "behind", ["into", "down", "during"], {
        slot: "phrase",
        reviewed: true,
      }),
    );
    expect(issues.length).toBeGreaterThan(0);
  });

  it("rejects an inflection slot where another tense also fits", () => {
    const bad = checkDistractors(
      shape("Nobody ___ what to say.", "knew", ["know", "knows", "knowed"], {
        id: "a2p2q20",
        slot: "inflection",
      }),
    );
    expect(bad.some((i) => i.kind === "tense-unanchored")).toBe(true);
    const ok = checkDistractors(
      shape("Nobody ___ what to say last night.", "knew", ["know", "knows", "knowed"], {
        id: "a2p2q20",
        slot: "inflection",
      }),
    );
    expect(ok.some((i) => i.kind === "tense-unanchored")).toBe(false);
  });
});

describe("the gate fails on the third review's mutations", () => {
  const cat = (
    id: string,
    pa: string[],
    prompt: string,
    answer: string,
    wrong: string[],
    extra = {},
  ) => shape(prompt, answer, wrong, { id, packAnswers: new Set(pa), ...extra });
  const bad: [string, ReturnType<typeof shape>][] = [
    [
      "a fix's own allow list does not excuse its options",
      shape(
        "The dog is ___ the door. (on the other side of it)",
        "behind",
        ["into", "down", "during"],
        {
          allow: ["into", "down", "during"],
        },
      ),
    ],
    [
      "absurd replacement options (petrol / tickets rain bread) fail the pool check",
      cat(
        "a1p20q22",
        ["petrol", "tram", "taxi"],
        "The car needs more ___ before the trip. (fuel for most cars)",
        "petrol",
        ["tickets", "rain", "bread"],
        {
          wrongReplaced: true,
          allow: ["tickets", "rain", "bread"],
        },
      ),
    ],
    ...(
      [
        "meat, cheese and coffee isn't what goes with pepper on a table",
        "none of meat, cheese or coffee would make sense next to pepper here",
        "people never pass meat, cheese or coffee with the pepper pot",
      ] as string[]
    ).map((context): [string, ReturnType<typeof shape>] => [
      "negative reason: " + context,
      cat(
        "a1p8q4",
        ["salt", "meat", "cheese", "coffee"],
        "Pass the ___ and pepper.",
        "salt",
        ["meat", "cheese", "coffee"],
        { context },
      ),
    ]),
    [
      "every day does not rule out played",
      shape("The children ___ in the garden every day.", "play", ["played", "plays", "playing"], {
        slot: "inflection",
      }),
    ],
    [
      "a quoted word is not a time anchor",
      shape('He ___ "hello" to me.', "said", ["say", "says", "saying"], { slot: "inflection" }),
    ],
    [
      "is ___ at the end of a sentence still allows opened",
      shape("The shop is ___ .", "open", ["opened", "opening", "opens"], { slot: "inflection" }),
    ],
    [
      "a clue over unreplaced options, no fix entry",
      cat(
        "a1p8q10",
        ["orange", "still", "rare", "black"],
        "She drinks ___ juice. (squeezed from a citrus fruit)",
        "orange",
        ["still", "rare", "black"],
        { wrongReplaced: undefined },
      ),
    ],
  ];
  for (const [name, q] of bad)
    it(name, () => {
      expect(checkDistractors(q).length).toBeGreaterThan(0);
    });
  it("accepts an anchor that rules the rival tense out", () => {
    expect(
      checkDistractors(
        shape(
          "Last night the children ___ in the garden.",
          "played",
          ["play", "plays", "playing"],
          { slot: "inflection" },
        ),
      ).some((i) => i.kind === "tense-unanchored"),
    ).toBe(false);
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
    if (unit.level !== "A1" && unit.level !== "A2" && !/^u\d$/.test(unit.id)) continue;
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
            reviewed: REVIEWED_PHRASES.has(`${lesson.id}/${q.id}`),
            wrongReplaced: QUESTION_FIXES[`${lesson.id}/${q.id}`]
              ? !!QUESTION_FIXES[`${lesson.id}/${q.id}`]!.wrong
              : undefined,
          },
        });
      }
  }
  // The words a pack itself uses: its answers plus the options of its questions before any fix.
  const rawVocab = new Map<string, Set<string>>();
  let rawVisited = 0;
  for (const unit of rawCurriculum)
    for (const lesson of unit.lessons)
      for (const q of lesson.questions) {
        const pack = /^(a[12]p\d+)q\d+$/.exec(q.id)?.[1];
        if (!pack || (q.type !== "mc" && q.type !== "fill")) continue;
        rawVisited++;
        const set = rawVocab.get(pack) ?? new Set<string>();
        for (const o of q.type === "mc" ? q.choices : q.bank) set.add(o);
        rawVocab.set(pack, set);
      }
  for (const [p, set] of packAnswers)
    for (const w of set) (rawVocab.get(p) ?? rawVocab.set(p, new Set()).get(p)!).add(w);
  const packVocab = buildPackVocab(rawVocab);
  const contextUses = new Map<string, number>();
  for (const it of items)
    if (it.shape.context)
      contextUses.set(it.shape.context, (contextUses.get(it.shape.context) ?? 0) + 1);
  for (const it of items) {
    if (it.shape.context) it.shape.contextUses = contextUses.get(it.shape.context);
    const pack = /^(a[12]p\d+)q\d+$/.exec(it.shape.id)?.[1];
    if (pack) {
      it.shape.packAnswers = packAnswers.get(pack);
      it.shape.packVocab = packVocab.get(pack);
    }
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
  // clue 548 -> 550 (2026-11-06): the full content review gave bare questions a clue.
  const PINNED_SPLIT = { picture: 45, context: 141, clue: 550 };
  // Honest debt, pinned, lowered as questions are rewritten; never raised.
  const POS_MISMATCH_BUDGET = 0;
  const WEAK_CONTEXT_BUDGET = 0;
  const NEEDS_CLUE_BUDGET = 0;
  const UNCLASSIFIED_BUDGET = 0;
  const OPTIONS_NOT_REPLACED_BUDGET = 0;
  // Inflection questions with no time anchor, clue or reason (follow-up work; may only go down).
  const TENSE_UNANCHORED_BUDGET = 0;

  it("does not add topic-word options of another part of speech", () => {
    const n = all.filter(({ issues }) => issues.some((i) => i.kind === "pos-mismatch")).length;
    expect(n).toBeLessThanOrEqual(POS_MISMATCH_BUDGET);
  });

  it("does not add reviewed-context questions without a reason written for them", () => {
    const n = all.filter(({ issues }) => issues.some((i) => i.kind === "weak-context")).length;
    expect(n).toBeLessThanOrEqual(WEAK_CONTEXT_BUDGET);
  });

  it("does not add category questions without a clue", () => {
    const bad = all.filter(({ issues }) => issues.some((i) => i.kind === "needs-clue"));
    const ids = bad.map(({ it }) => it.shape.id).join(", ");
    expect(bad.length, `needs a clue: ${ids}`).toBeLessThanOrEqual(NEEDS_CLUE_BUDGET);
  });

  it("does not add inflection questions where another tense also fits", () => {
    const n = all.filter(({ issues }) => issues.some((i) => i.kind === "tense-unanchored")).length;
    expect(n).toBeLessThanOrEqual(TENSE_UNANCHORED_BUDGET);
  });

  it("does not add a clue or reason on top of unreplaced pack-neighbour options", () => {
    const n = all.filter(({ issues }) =>
      issues.some((i) => i.kind === "options-not-replaced"),
    ).length;
    expect(n).toBeLessThanOrEqual(OPTIONS_NOT_REPLACED_BUDGET);
  });

  it("does not add questions with an unknown slot", () => {
    const n = all.filter(({ issues }) => issues.some((i) => i.kind === "unclassified")).length;
    expect(n).toBeLessThanOrEqual(UNCLASSIFIED_BUDGET);
  });

  it("reads every pack's own words before any fix (the raw-vocabulary loop is not empty)", () => {
    // This loop once matched nothing (an unescaped /^(a[12]pd+)qd+$/), so every pack's raw options
    // silently dropped out of the vocabulary the slot checks compare against.
    expect(rawVisited).toBeGreaterThan(1000);
    expect(rawVocab.size).toBeGreaterThan(30);
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

/**
 * The English placement test (src/data/placement.ts). It sets a learner's starting level and was
 * not covered by the lesson sweep above, which is how "Nighting / Good nightly" shipped as the
 * options for "Choose the correct farewell". The same slot check runs on its fill-in questions.
 */
describe("the English placement bank", () => {
  // Reviewed exceptions: a wrong option that is a real learner error but sits outside the slot pool.
  // Each needs a reason; none may be added to make an absurd option pass.
  const PLACEMENT_ALLOW: Record<string, string[]> = {
    // "He is having a big house": the stative-verb error, a common one.
    p3b: ["is having"],
    // "You don't have to / might not smoke in here": the must-not / not-have-to confusion.
    p9b: ["don't have to", "might not"],
  };
  // Fill-in questions whose slot the inference cannot name (verb forms, relatives, connectors).
  // Their wrong options are judged by a reader, not by this gate; the count may only go down.
  const UNCLASSIFIED_BUDGET = 17;
  const cloze = PLACEMENT_QUESTIONS.flatMap((q) =>
    q.type === "mc" && q.prompt.includes("___") ? [q] : [],
  );
  const check = (q: (typeof cloze)[number]) =>
    checkDistractors({
      key: "placement/" + q.id,
      id: q.id,
      prompt: q.prompt,
      answer: q.choices[q.answer]!,
      options: q.choices,
    }).filter((i) => !(i.kind === "off-pool" && PLACEMENT_ALLOW[q.id]?.includes(i.option)));

  it("fails on the options that shipped", () => {
    const kindsOf = (prompt: string, answer: string, wrong: string[]) =>
      kinds(shape(prompt, answer, wrong));
    expect(kindsOf("He ___ a big house.", "has", ["have", "haves", "having"])).toContain(
      "off-pool",
    );
    expect(
      kindsOf("There ___ a lot of people at the party last night.", "were", ["was", "is", "be"]),
    ).toContain("also-correct");
  });

  it("has no wrong option outside its slot, and none that is also correct", () => {
    const bad = cloze
      .map((q) => ({ id: q.id, issues: check(q).filter((i) => i.kind !== "unclassified") }))
      .filter((x) => x.issues.length)
      .map((x) => `${x.id} ${JSON.stringify(x.issues)}`);
    expect(bad).toEqual([]);
  });

  it("does not add fill-in questions whose slot cannot be inferred", () => {
    const n = cloze.filter((q) => check(q).some((i) => i.kind === "unclassified")).length;
    expect(n).toBeLessThanOrEqual(UNCLASSIFIED_BUDGET);
  });

  it("keeps the retired absurd options out of every question", () => {
    // Options that shipped and that no learner would ever choose.
    const RETIRED = [
      "nighting",
      "good nightly",
      "good night to you go",
      "haves",
      "mine own",
      "would took",
      "take will",
      "don't must",
      "to the store walking, rain started.",
      "the rain, walking to the store, started.",
      "much proof stuff",
      "goodest",
    ];
    const bad = PLACEMENT_QUESTIONS.flatMap((q) =>
      q.type === "mc" || q.type === "listening"
        ? q.choices
            .filter((c) => RETIRED.includes(c.trim().toLowerCase()))
            .map((c) => q.id + ": " + c)
        : [],
    );
    expect(bad).toEqual([]);
  });
});
