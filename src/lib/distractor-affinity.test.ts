import { describe, expect, it } from "vitest";
import { orderByLexicalSimilarity, orderDistractorCandidates } from "./distractor-affinity";

describe("orderByLexicalSimilarity", () => {
  it("puts the most confusable sentence first", () => {
    // For a listening question the best wrong answer is the one the learner
    // could mishear the right one as -- the opposite of the word-class rule,
    // which is about whether a word can occupy the slot at all.
    const ordered = orderByLexicalSimilarity("We eat dinner at seven.", [
      "The shop opens on Monday.",
      "We eat dinner at eight.",
      "I can't find my keys.",
    ]);
    expect(ordered[0]).toBe("We eat dinner at eight.");
  });

  it("never drops a candidate — only reorders them", () => {
    const candidates = ["a b c", "a b d", "x y z"];
    const ordered = orderByLexicalSimilarity("a b c", candidates);
    expect([...ordered].sort()).toEqual([...candidates].sort());
  });

  it("is stable among equally similar candidates", () => {
    const ordered = orderByLexicalSimilarity("one two", ["nine ten", "eight nine"]);
    expect(ordered).toEqual(["nine ten", "eight nine"]);
  });

  it("ignores function words when judging similarity", () => {
    // "of the" overlap must not outrank a real content-word match.
    const ordered = orderByLexicalSimilarity("The end of the film was good.", [
      "The top of the hill was cold.",
      "The end of the film was bad.",
    ]);
    expect(ordered[0]).toBe("The end of the film was bad.");
  });

  it("handles an empty candidate list", () => {
    expect(orderByLexicalSimilarity("anything", [])).toEqual([]);
  });
});

describe("orderDistractorCandidates", () => {
  it("puts candidates sharing the answer's part of speech first", () => {
    const ordered = orderDistractorCandidates("save", ["money", "spend", "wallet", "withdraw"]);
    expect(ordered.slice(0, 2)).toEqual(["spend", "withdraw"]);
  });

  it("never drops a candidate — only reorders them", () => {
    const candidates = ["money", "spend", "wallet", "withdraw"];
    const ordered = orderDistractorCandidates("save", candidates);
    expect([...ordered].sort()).toEqual([...candidates].sort());
  });

  it("preserves the incoming relative order within each group", () => {
    // Stability matters: pickDistractors walks its pool from a hashed offset,
    // and that walk order is what varies distractors between questions. A
    // non-stable sort would collapse that variety.
    const ordered = orderDistractorCandidates("save", ["spend", "withdraw", "money", "wallet"]);
    expect(ordered).toEqual(["spend", "withdraw", "money", "wallet"]);
  });

  it("returns candidates unchanged when the answer's part of speech is unknown", () => {
    const candidates = ["zzzqqq", "wallet"];
    expect(orderDistractorCandidates("nonsenseword", candidates)).toEqual(candidates);
  });

  it("handles an empty candidate list", () => {
    expect(orderDistractorCandidates("save", [])).toEqual([]);
  });

  it("deprioritises a candidate that already appears in the prompt", () => {
    // Echoing a word from the sentence back at the learner tests nothing.
    const ordered = orderDistractorCandidates(
      "save",
      ["spend", "withdraw"],
      "Should I spend it, or ___ it?",
    );
    expect(ordered).toEqual(["withdraw", "spend"]);
  });

  it("still offers a prompt word when there is nothing else of its class", () => {
    // Grammar packs legitimately reuse function words as distractors: a mixed
    // conditional drilling "If he HAD taken the job, he ___ be living abroad"
    // wants "had" among the choices. Deprioritising must not become dropping.
    const ordered = orderDistractorCandidates(
      "would",
      ["had"],
      "If he had taken the job, he ___ be living abroad now.",
    );
    expect(ordered).toEqual(["had"]);
  });

  it("ranks by word class first and prompt overlap second", () => {
    // Best: right class, not echoed. Then: right class but echoed. Worst:
    // wrong class, which is the ungrammatical-distractor case this exists for.
    const ordered = orderDistractorCandidates(
      "save",
      ["spend", "money", "withdraw"],
      "Should I spend it, or ___ it?",
    );
    expect(ordered[0]).toBe("withdraw");
    expect(ordered.indexOf("spend")).toBeLessThan(ordered.indexOf("money"));
  });

  it("ranks a candidate that is both wrong-class and echoed last of all", () => {
    // "He's ___ into debt because of his spending." -- "spending" reads as a
    // noun there, so for a verb slot it is both ungrammatical and an echo.
    const ordered = orderDistractorCandidates(
      "falling",
      ["spending", "withdraw"],
      "He's ___ into debt because of his spending.",
    );
    expect(ordered).toEqual(["withdraw", "spending"]);
  });
});
