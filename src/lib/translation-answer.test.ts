import { describe, expect, it } from "vitest";
import { matchesAcceptableAnswer, normaliseWritten } from "./translation-answer";

const ACCEPTED = ["I don't understand.", "I do not understand.", "Sorry, I don't understand."];

describe("matchesAcceptableAnswer", () => {
  it("accepts any curated phrasing regardless of case and end punctuation", () => {
    expect(matchesAcceptableAnswer("i dont understand", ACCEPTED)).toBe(true);
    expect(matchesAcceptableAnswer("I DO NOT UNDERSTAND!", ACCEPTED)).toBe(true);
    expect(matchesAcceptableAnswer("sorry, I don't understand", ACCEPTED)).toBe(true);
  });

  it("answers the contraction question the same way spoken answers do", () => {
    // A typed translation and a spoken one face the same "is don't the same as
    // do not" question. Answering it twice would mean a phrasing accepted when
    // said and rejected when typed, for no reason the learner could ever see.
    expect(normaliseWritten("I don't understand")).toBe(normaliseWritten("I do not understand"));
    expect(normaliseWritten("we are meeting at the café")).toBe(
      normaliseWritten("We are meeting at the cafe"),
    );
  });

  it("rejects a different sentence and a partial one", () => {
    expect(matchesAcceptableAnswer("I understand", ACCEPTED)).toBe(false);
    expect(matchesAcceptableAnswer("I do not", ACCEPTED)).toBe(false);
  });

  it("treats an empty submission as no answer", () => {
    expect(matchesAcceptableAnswer("", ACCEPTED)).toBe(false);
    expect(matchesAcceptableAnswer("   ", ACCEPTED)).toBe(false);
  });

  it("fails closed on an empty acceptable list", () => {
    // A malformed pack line must never make every answer correct. This is the
    // direction that matters: over-accepting is invisible to the learner and
    // silently destroys the question.
    expect(matchesAcceptableAnswer("anything at all", [])).toBe(false);
  });
});
