import { describe, expect, it } from "vitest";
import { orderDistractorCandidates } from "./distractor-affinity";

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
    // "He's ___ into debt because of his spending." -- offering "spending"
    // echoes the sentence back at the learner instead of testing anything.
    const ordered = orderDistractorCandidates(
      "falling",
      ["spending", "rising", "sinking"],
      "He's ___ into debt because of his spending.",
    );
    expect(ordered).toEqual(["rising", "sinking", "spending"]);
  });

  it("still offers a prompt word when there is nothing else of its class", () => {
    // Grammar packs legitimately reuse function words as distractors: a mixed
    // conditional drilling "If he HAD taken the job, he ___ be living abroad"
    // wants "had" among the choices. Deprioritising must not become dropping.
    const ordered = orderDistractorCandidates("would", ["had"], "If he had taken the job, he ___ be living abroad now.");
    expect(ordered).toEqual(["had"]);
  });

  it("ranks same-class-and-not-in-prompt above same-class-in-prompt", () => {
    const ordered = orderDistractorCandidates(
      "falling",
      ["spending", "wallet", "rising"],
      "He's ___ into debt because of his spending.",
    );
    expect(ordered[0]).toBe("rising");
    expect(ordered.indexOf("spending")).toBeLessThan(ordered.indexOf("wallet"));
  });
});
