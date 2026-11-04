import { describe, expect, it } from "vitest";
import { deckButtonTitle } from "./vocab-deck";

describe("vocab deck button", () => {
  it("a one-word deck goes straight to practice", () => {
    expect(deckButtonTitle(0, 1)).toBe("Start practice");
  });
  it("moves word to word, then starts practice on the last card", () => {
    expect(deckButtonTitle(0, 3)).toBe("Next word");
    expect(deckButtonTitle(1, 3)).toBe("Next word");
    expect(deckButtonTitle(2, 3)).toBe("Start practice");
  });
});
