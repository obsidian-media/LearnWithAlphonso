import { describe, expect, it } from "vitest";
import {
  buildLevel,
  hash,
  packQuestions,
  pickReinforcementQuestion,
  reshuffleQuestion,
  unitsFromBank,
} from "./bank-engine";
import type { Pack } from "./bank-engine";
import type { Question } from "./curriculum";

describe("hash", () => {
  it("is deterministic for the same input", () => {
    expect(hash("hello")).toBe(hash("hello"));
  });

  it("differs for different inputs (no trivial collision)", () => {
    expect(hash("hello")).not.toBe(hash("world"));
  });

  it("is always non-negative", () => {
    expect(hash("")).toBeGreaterThanOrEqual(0);
    expect(hash("anything at all")).toBeGreaterThanOrEqual(0);
  });
});

const pairPack: Pack = {
  id: "p1",
  title: "Greetings",
  subtitle: "Say hello",
  note: "Basic greetings",
  kind: "pair",
  prompt: "Translate: %s",
  data: `
    hello|bonjour
    goodbye|au revoir
    please|s'il vous plaît
    thanks|merci
    yes|oui
  `,
};

const clozePack: Pack = {
  id: "p2",
  title: "Fill it in",
  subtitle: "Cloze practice",
  note: "Cloze note",
  kind: "cloze",
  data: `
    She ___ happy.|is
    I ___ coffee.|drink
    They ___ students.|are
    He ___ a book.|reads
  `,
};

describe("packQuestions", () => {
  it("produces one question per data line", () => {
    const qs = packQuestions(pairPack);
    expect(qs.length).toBe(5);
  });

  it("every question's id is prefixed with the pack id", () => {
    const qs = packQuestions(pairPack);
    for (const q of qs) expect(q.id.startsWith("p1q")).toBe(true);
  });

  it("mc questions include the correct answer among the choices", () => {
    const qs = packQuestions(pairPack);
    for (const q of qs) {
      if (q.type === "mc") expect(q.choices[q.answer]).toBeTruthy();
    }
  });

  it("fill questions' bank always contains the answer", () => {
    const qs = packQuestions(pairPack);
    for (const q of qs) {
      if (q.type === "fill") expect(q.bank).toContain(q.answer);
    }
  });

  it("uses the pack prompt template for 'pair' packs", () => {
    const qs = packQuestions(pairPack);
    for (const q of qs) expect(q.prompt.startsWith("Translate: ")).toBe(true);
  });

  it("uses the raw left side as the prompt for 'cloze' packs", () => {
    const qs = packQuestions(clozePack);
    expect(qs[0].prompt).toBe("She ___ happy.");
  });
});

describe("reshuffleQuestion", () => {
  it("reorders mc choices while keeping the answer index consistent", () => {
    const q: Question = {
      id: "q1",
      type: "mc",
      prompt: "p",
      choices: ["a", "b", "c", "d"],
      answer: 2,
      explanation: "e",
    };
    const reshuffled = reshuffleQuestion(q, "seed-1");
    expect(reshuffled.type).toBe("mc");
    if (reshuffled.type === "mc") {
      expect(reshuffled.choices[reshuffled.answer]).toBe("c");
      expect([...reshuffled.choices].sort()).toEqual(["a", "b", "c", "d"]);
    }
  });

  it("reorders the fill bank without changing the answer", () => {
    const q: Question = {
      id: "q2",
      type: "fill",
      prompt: "p ___",
      bank: ["a", "b", "c"],
      answer: "b",
      explanation: "e",
    };
    const reshuffled = reshuffleQuestion(q, "seed-2");
    expect(reshuffled.type).toBe("fill");
    if (reshuffled.type === "fill") {
      expect(reshuffled.answer).toBe("b");
      expect([...reshuffled.bank].sort()).toEqual(["a", "b", "c"]);
    }
  });

  it("reorders reorder-type tokens without changing the canonical answer", () => {
    const q: Question = {
      id: "q4",
      type: "reorder",
      prompt: "p",
      tokens: ["I", "go", "to", "school"],
      answer: "I go to school",
      explanation: "e",
    };
    const reshuffled = reshuffleQuestion(q, "seed-3");
    expect(reshuffled.type).toBe("reorder");
    if (reshuffled.type === "reorder") {
      expect(reshuffled.answer).toBe("I go to school");
      expect([...reshuffled.tokens].sort()).toEqual(["I", "go", "school", "to"]);
    }
  });

  it("produces a different order for a different seed (usually)", () => {
    const q: Question = {
      id: "q3",
      type: "mc",
      prompt: "p",
      choices: ["a", "b", "c", "d", "e"],
      answer: 0,
      explanation: "e",
    };
    const a = reshuffleQuestion(q, "seed-a");
    const b = reshuffleQuestion(q, "seed-totally-different");
    expect(a.type).toBe("mc");
    expect(b.type).toBe("mc");
    if (a.type === "mc" && b.type === "mc") {
      expect(a.choices).not.toEqual(b.choices);
    }
  });
});

describe("buildLevel", () => {
  it("groups questions into 5-question lessons and 5-lesson units", () => {
    const bigPack: Pack = {
      ...pairPack,
      data: Array.from({ length: 27 }, (_, i) => `word${i}|mot${i}`).join("\n"),
    };
    const units = buildLevel("A1", [bigPack], 0);
    expect(units.length).toBeGreaterThan(0);
    for (const unit of units) {
      expect(unit.level).toBe("A1");
      for (const lesson of unit.lessons) {
        expect(lesson.questions.length).toBeGreaterThanOrEqual(3);
        expect(lesson.questions.length).toBeLessThanOrEqual(5);
      }
    }
  });

  it("drops a trailing partial lesson with fewer than 3 questions", () => {
    const smallPack: Pack = {
      ...pairPack,
      data: Array.from({ length: 6 }, (_, i) => `word${i}|mot${i}`).join("\n"),
    };
    const units = buildLevel("A1", [smallPack], 0);
    const totalQuestions = units.flatMap((u) => u.lessons).flatMap((l) => l.questions).length;
    expect(totalQuestions).toBe(5); // 6 lines -> lesson1(5) + lesson2(1, dropped)
  });

  it("returns no units for an empty pack list", () => {
    expect(buildLevel("A1", [], 0)).toEqual([]);
  });
});

describe("unitsFromBank", () => {
  it("builds units for every level present in the bank", () => {
    const bank = { A1: [pairPack], A2: [], B1: [], B2: [], C1: [] } as Record<string, Pack[]>;
    const units = unitsFromBank(bank as never, { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0 } as never);
    expect(units.every((u) => u.level === "A1")).toBe(true);
  });
});

describe("pickReinforcementQuestion", () => {
  function q(id: string): Question {
    return { id, type: "mc", prompt: `p${id}`, choices: ["a", "b"], answer: 0, explanation: "e" };
  }

  it("draws from siblingQuestions by default (not doing well)", () => {
    const result = pickReinforcementQuestion({
      siblingQuestions: [q("s1"), q("s2")],
      levelQuestions: [q("l1"), q("l2")],
      doingWell: false,
      seed: "seed-1",
    });
    expect(["s1", "s2"]).toContain(result?.id);
  });

  it("draws from levelQuestions when doing well", () => {
    const result = pickReinforcementQuestion({
      siblingQuestions: [q("s1"), q("s2")],
      levelQuestions: [q("l1"), q("l2")],
      doingWell: true,
      seed: "seed-1",
    });
    expect(["l1", "l2"]).toContain(result?.id);
  });

  it("falls back to levelQuestions when siblingQuestions is empty", () => {
    const result = pickReinforcementQuestion({
      siblingQuestions: [],
      levelQuestions: [q("l1")],
      doingWell: false,
      seed: "seed-1",
    });
    expect(result?.id).toBe("l1");
  });

  it("falls back to siblingQuestions when levelQuestions is empty", () => {
    const result = pickReinforcementQuestion({
      siblingQuestions: [q("s1")],
      levelQuestions: [],
      doingWell: true,
      seed: "seed-1",
    });
    expect(result?.id).toBe("s1");
  });

  it("returns null when both pools are empty", () => {
    const result = pickReinforcementQuestion({
      siblingQuestions: [],
      levelQuestions: [],
      doingWell: false,
      seed: "seed-1",
    });
    expect(result).toBeNull();
  });

  it("is deterministic for the same seed", () => {
    const pool = [q("s1"), q("s2"), q("s3")];
    const a = pickReinforcementQuestion({
      siblingQuestions: pool,
      levelQuestions: [],
      doingWell: false,
      seed: "same-seed",
    });
    const b = pickReinforcementQuestion({
      siblingQuestions: pool,
      levelQuestions: [],
      doingWell: false,
      seed: "same-seed",
    });
    expect(a?.id).toBe(b?.id);
  });
});
