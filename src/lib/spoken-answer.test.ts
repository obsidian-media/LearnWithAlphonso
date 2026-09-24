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
});
