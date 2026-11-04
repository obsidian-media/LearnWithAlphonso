import { describe, expect, it } from "vitest";
import { getCourse } from "./courses";
import { alsoCorrectReason, clearlyWrongFor } from "./also-correct";

/**
 * A wrong answer must be wrong. The bank draws distractors from other lines of
 * the same pack, so a distractor can make a perfectly good sentence: "They ___
 * at home." offered "study", and "They study at home." is correct English, so a
 * learner could be marked wrong for a right answer.
 *
 * The fixtures below are written by hand and do NOT go through the detector's own
 * tables for their verdicts: each one is a sentence a teacher would accept (or
 * reject), with the reason, so the detector is graded by someone other than itself.
 */
const ALSO_CORRECT: [prompt: string, answer: string, wrong: string][] = [
  ["They ___ at home.", "are", "study"],
  // Not covered, on purpose: lexical-for-lexical swaps ("We ___ English every day",
  // study vs speak) need word meaning, which this detector does not have. They are
  // sized by hand in docs/content-audit-2026-11.md.
  ["We ___ breakfast together.", "have", "had"],
  ["He ___ not eat meat.", "does", "did"],
  ["___ you see the film?", "Did", "Do"],
  ["My phone ___ working.", "isn't", "is"],
  ["___ I open the window, please?", "may", "can"],
  ["I think it ___ rain.", "will", "won't"],
  ["They ___ at home.", "are", "were"],
  ["The cat is sitting ___ the table.", "under", "behind"],
  ["The cafe is ___ the station.", "opposite", "beside"],
  // Review of PR 351: real questions where a replacement or kept option was right.
  ["The dog is ___ the door.", "behind", "next to"],
  ["The cafe is ___ the station.", "opposite", "next to"],
  ["The car park is ___ the shopping centre.", "under", "in"],
  ["The cat hid ___ the sofa cushions.", "beneath", "in"],
  ["He stood ___ the crowd, watching.", "among", "in"],
  ["She is standing ___ the door.", "behind", "against"],
  ["She is standing ___ the door.", "behind", "round"],
  ["She ___ be at work now.", "might", "needn't"],
  ["She ___ be at work now.", "might", "should"],
  ["She ___ be at work now.", "might", "must"],
  ["I wish my neighbours ___ so noisy.", "weren't", "had been"],
  ["The bus stop is ___ the church.", "outside", "round"],
  ["The bus stop is ___ the church.", "around", "round"],
];

const GENUINELY_WRONG: [prompt: string, answer: string, wrong: string][] = [
  ["They ___ at home.", "are", "is"],
  ["They ___ at home.", "are", "isn't"],
  ["They ___ at home.", "are", "am"],
  ["I ___ a student.", "am", "does"],
  ["She ___ cooking when I arrived.", "was", "were"],
  ["She ___ cooking when I arrived.", "was", "is"],
  ["They ___ not come to the party yesterday.", "did", "do"],
  ["He ___ not eat meat.", "does", "do"],
  ["I think it ___ rain.", "will", "starts"],
  ["She ___ a car.", "has", "have"],
  ["It ___ cold today.", "is", "opens"],
  ["The cat is sitting ___ the table.", "under", "during"],
  ["I paid ___ cash.", "in", "by"],
  // A tag question must echo the main verb, so only one auxiliary fits.
  ["They were at the party, ___ they?", "weren't", "wasn't"],
  ["She doesn't like tea very much, ___ she?", "does", "did"],
  // A bracketed clue after the blank picks the one place word that fits.
  ["The cat is sitting ___ the table. (it is hiding below it)", "under", "behind"],
  ["The cafe is ___ the station. (across the road from it)", "opposite", "next to"],
  // A conditional's tense fixes the modal.
  ["If he studied, he ___ pass.", "would", "will"],
  ["I ___ help if I could.", "would", "will"],
  ["If it rains, we ___ stay home.", "will", "would"],
  // "ought" and "used" need "to", so they are wrong before a bare verb.
  ["She ___ speak three languages fluently.", "can", "ought"],
  ["___ I open the window, please?", "may", "may to"],
];

describe("alsoCorrectReason (hand-written verdicts)", () => {
  for (const [prompt, answer, wrong] of ALSO_CORRECT) {
    it(`flags "${wrong}" in "${prompt}" (answer "${answer}")`, () => {
      expect(alsoCorrectReason(prompt, answer, wrong)).not.toBeNull();
    });
  }
  for (const [prompt, answer, wrong] of GENUINELY_WRONG) {
    it(`accepts "${wrong}" in "${prompt}" (answer "${answer}")`, () => {
      expect(alsoCorrectReason(prompt, answer, wrong)).toBeNull();
    });
  }
});

describe("clearlyWrongFor", () => {
  it("never offers 'does' to a third-person-singular modal slot", () => {
    for (const [p, a] of [
      ["She ___ speak three languages fluently.", "can"],
      ["He ___ lift very heavy weights at the gym.", "can"],
    ] as const)
      expect(clearlyWrongFor(p, a), p).not.toContain("does");
  });
  it("gives a modal slot a wrong modal-like form, never only non-modals", () => {
    const w = clearlyWrongFor("___ I open the window, please?", "may");
    expect(w).toContain("ought");
    expect(w.length).toBeGreaterThanOrEqual(3);
  });
  it("offers only forms the detector accepts as wrong, for a be slot", () => {
    const wrongs = clearlyWrongFor("They ___ at home.", "are");
    expect(wrongs.length).toBeGreaterThanOrEqual(2);
    for (const w of wrongs) expect(alsoCorrectReason("They ___ at home.", "are", w)).toBeNull();
    expect(wrongs).not.toContain("are");
  });
});

/**
 * Sentences that are CORRECT English, written by hand and not produced by (or
 * run through) the detector. If one of these candidates appears as a wrong
 * option in the question with this prompt, a learner is marked wrong for a right
 * answer. This is the check that does not share the detector's blind spots: the
 * detector reporting "0" proves nothing about what it cannot see.
 */
const KNOWN_CORRECT: [prompt: string, candidate: string][] = [
  ["They ___ at home.", "study"],
  ["The dog is ___ the door.", "next to"],
  ["The cafe is ___ the station.", "next to"],
  ["The cat is ___ the table.", "next to"],
  ["The car park is ___ the shopping centre.", "in"],
  ["The cat hid ___ the sofa cushions.", "in"],
  ["He stood ___ the crowd, watching.", "in"],
  ["She is standing ___ the door.", "against"],
  ["The bus stop is ___ the church.", "round"],
  ["She ___ be at work now.", "needn't"],
  ["She ___ speak three languages fluently.", "does"],
  ["He ___ lift very heavy weights at the gym.", "does"],
  ["I wish my neighbours ___ so noisy.", "had been"],
  ["We ___ breakfast together.", "had"],
  ["He ___ not eat meat.", "did"],
];

describe("the English bank, against hand-written known-correct sentences", () => {
  const course = getCourse("en");
  it("never offers a known-correct sentence as a wrong answer", () => {
    const hits: string[] = [];
    for (const unit of course.curriculum)
      for (const lesson of unit.lessons)
        for (const q of lesson.questions) {
          if (q.type !== "mc" && q.type !== "fill") continue;
          const answer = q.type === "mc" ? q.choices[q.answer]! : q.answer;
          const options = q.type === "mc" ? q.choices : q.bank;
          for (const [prompt, candidate] of KNOWN_CORRECT)
            if (q.prompt === prompt && answer !== candidate && options.includes(candidate))
              hits.push(`${q.id} "${prompt}" offers "${candidate}"`);
        }
    expect(hits).toEqual([]);
  });
});

describe("modal and auxiliary slots are not giveaways", () => {
  const MODALS = new Set(
    "can could may might will would shall should must can't couldn't won't wouldn't needn't mustn't shouldn't ought".split(
      " ",
    ),
  );
  const AUX = new Set(
    "am is are was were isn't aren't wasn't weren't do does did don't doesn't didn't have has had haven't hasn't hadn't".split(
      " ",
    ),
  );
  it("never shows two spellings of one word as separate options", () => {
    const twins = [
      ["round", "around"],
      ["toward", "towards"],
      ["among", "amongst"],
    ];
    const bad: string[] = [];
    for (const unit of getCourse("en").curriculum)
      for (const lesson of unit.lessons)
        for (const q of lesson.questions) {
          if (q.type !== "mc" && q.type !== "fill") continue;
          const options = (q.type === "mc" ? q.choices : q.bank).map((o) => o.toLowerCase());
          for (const [x, y] of twins)
            if (options.includes(x!) && options.includes(y!))
              bad.push(`${q.id} ${options.join("/")}`);
        }
    expect(bad).toEqual([]);
  });

  // A learner-error form of the same word ("wills", "can to", "wont") still looks like a
  // member of the class, so it counts as a second option of that class.
  const inClass = (option: string, set: Set<string>) => {
    const w = option.toLowerCase().replace(/ to$/, "");
    return set.has(w) || set.has(w.replace(/s$/, "")) || w === "wont" || w === "willn't";
  };

  it("always leaves a second option of the answer's own class", () => {
    const bad: string[] = [];
    for (const unit of getCourse("en").curriculum)
      for (const lesson of unit.lessons)
        for (const q of lesson.questions) {
          if ((q.type !== "mc" && q.type !== "fill") || !q.prompt.includes("___")) continue;
          // "Which verb goes with homework? do" is a collocation, not an auxiliary slot.
          if (/^Which verb goes with/.test(q.prompt)) continue;
          const answer = q.type === "mc" ? q.choices[q.answer]! : q.answer;
          const options = q.type === "mc" ? q.choices : q.bank;
          for (const set of [MODALS, AUX]) {
            if (!set.has(answer.toLowerCase())) continue;
            if (!options.some((o) => o !== answer && inClass(o, set)))
              bad.push(`${q.id} "${q.prompt}" answer=${answer} options=${options.join("/")}`);
          }
        }
    expect(bad).toEqual([]);
  });
});

describe("the English bank", () => {
  const course = getCourse("en");
  const hits: string[] = [];
  for (const unit of course.curriculum)
    for (const lesson of unit.lessons)
      for (const q of lesson.questions) {
        if (q.type !== "mc" && q.type !== "fill") continue;
        if (!q.prompt.includes("___")) continue;
        const answer = q.type === "mc" ? q.choices[q.answer]! : q.answer;
        const options = q.type === "mc" ? q.choices : q.bank;
        for (const o of options) {
          if (o === answer) continue;
          const why = alsoCorrectReason(q.prompt, answer, o);
          if (why)
            hits.push(`${lesson.id}:${q.id} "${q.prompt}" answer=${answer} wrong=${o} (${why})`);
        }
      }

  it("offers no wrong answer that also makes a correct sentence", () => {
    expect(hits).toEqual([]);
  });
});
