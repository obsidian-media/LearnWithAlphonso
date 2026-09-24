import { describe, expect, it } from "vitest";
import { matchesSpokenAnswer, normaliseSpoken } from "./spoken-answer";

describe("normaliseSpoken", () => {
  it("strips punctuation and case", () => {
    expect(normaliseSpoken("She's a Doctor!")).toBe(normaliseSpoken("shes a doctor"));
  });

  it("treats a contraction and its expansion as the same", () => {
    expect(normaliseSpoken("she is a doctor")).toBe(normaliseSpoken("she's a doctor"));
    expect(normaliseSpoken("I do not understand")).toBe(normaliseSpoken("I don't understand"));
    expect(normaliseSpoken("we will see")).toBe(normaliseSpoken("we'll see"));
  });

  it("collapses whitespace", () => {
    expect(normaliseSpoken("  good   morning ")).toBe(normaliseSpoken("good morning"));
  });
});

describe("matchesSpokenAnswer", () => {
  it("accepts the expected phrase however it was transcribed", () => {
    expect(matchesSpokenAnswer("She's a doctor.", "She is a doctor")).toBe(true);
    expect(matchesSpokenAnswer("she is a DOCTOR", "She's a doctor")).toBe(true);
    expect(matchesSpokenAnswer("I don't understand", "I do not understand.")).toBe(true);
  });

  it("forgives a leading filler word", () => {
    // Deepgram routinely prefixes "um"/"uh" from a held mic.
    expect(matchesSpokenAnswer("um, she's a doctor", "She's a doctor")).toBe(true);
    expect(matchesSpokenAnswer("uh good morning", "Good morning.")).toBe(true);
  });

  it("rejects a different sentence", () => {
    expect(matchesSpokenAnswer("he is a driver", "She's a doctor")).toBe(false);
  });

  it("rejects a partial attempt", () => {
    // Saying half the phrase is not saying the phrase. This is why edit
    // distance is deliberately not used here: a threshold loose enough to
    // accept contraction variants also accepts a different sentence.
    expect(matchesSpokenAnswer("she is", "She's a doctor")).toBe(false);
    expect(matchesSpokenAnswer("good", "Good morning.")).toBe(false);
  });

  it("treats an empty transcript as no answer, not a wrong one", () => {
    expect(matchesSpokenAnswer("", "She's a doctor")).toBe(false);
    expect(matchesSpokenAnswer("   ", "She's a doctor")).toBe(false);
  });

  it("matches a number said as a word against the numeral Deepgram returns", () => {
    // /api/stt calls Deepgram with smart_format=true, which renders spoken
    // numbers as numerals. Without collapsing the two forms, "the bus leaves at
    // nine" -- transcribed "the bus leaves at 9" -- is a wrong answer for a
    // perfect utterance, and the A1 speaking pack contains exactly that phrase.
    expect(matchesSpokenAnswer("the bus leaves at 9", "The bus leaves at nine.")).toBe(true);
    expect(matchesSpokenAnswer("I have 2 brothers", "I have two brothers.")).toBe(true);
    expect(matchesSpokenAnswer("I have two brothers", "I have two brothers.")).toBe(true);
  });

  it("still tells two different numbers apart", () => {
    expect(matchesSpokenAnswer("I have 3 brothers", "I have two brothers.")).toBe(false);
  });
});
