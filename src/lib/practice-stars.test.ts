import { describe, expect, it } from "vitest";
import {
  STAR_RULE,
  STAR_RULE_LINES,
  starRuleLines,
  measureReply,
  starsForCall,
  callCountsAsDone,
  type CallTally,
  type ReplyMeasure,
} from "./practice-stars";

/** A call of `replies` learner replies, all judged right, all full sentences, none in English: three stars. */
const perfect = (replies: number): CallTally => ({
  replies,
  rightReplies: replies,
  shortReplies: 0,
  englishReplies: 0,
});
const FINISH = STAR_RULE.scenarioFinishMinReplies;

describe("starsForCall: one star is finishing the call", () => {
  it("one reply short of finishing earns nothing, however good the replies were", () => {
    expect(starsForCall(perfect(FINISH - 1), FINISH)).toBe(0);
  });
  it("exactly the finishing number of replies earns at least one star", () => {
    expect(starsForCall({ ...perfect(FINISH), rightReplies: 0 }, FINISH)).toBe(1);
  });
  it("a campaign scene finishes at its own minimum (the scene's minTurns)", () => {
    expect(starsForCall({ ...perfect(2), rightReplies: 0 }, 2)).toBe(1);
    expect(starsForCall({ ...perfect(1), rightReplies: 0 }, 2)).toBe(0);
  });
});

describe("starsForCall: two stars at 80% of replies judged right", () => {
  it("79 of 100 right is one star, 80 of 100 is two", () => {
    const base = { replies: 100, shortReplies: 0, englishReplies: 0 };
    expect(starsForCall({ ...base, rightReplies: 79 }, FINISH)).toBe(1);
    expect(starsForCall({ ...base, rightReplies: 80 }, FINISH)).toBe(2);
  });
  it("4 of 5 is exactly 80%: two stars (no floating-point rounding below the line)", () => {
    expect(starsForCall({ ...perfect(5), rightReplies: 4 }, FINISH)).toBe(2);
  });
  it("3 of 4 (75%) is one star", () => {
    expect(starsForCall({ ...perfect(4), rightReplies: 3 }, FINISH)).toBe(1);
  });
  it("a reply the model did not judge right (a question, a greeting) is not right: it counts against the share", () => {
    // 5 replies, 4 judged right, 1 unjudged -> 80% -> two stars, never three.
    expect(starsForCall({ ...perfect(5), rightReplies: 4 }, FINISH)).toBe(2);
  });
});

describe("starsForCall: three stars are every reply right, full sentences, no English", () => {
  it("all right, all full sentences, no English: three", () => {
    expect(starsForCall(perfect(6), FINISH)).toBe(3);
  });
  it("one slip out of many drops to two", () => {
    expect(starsForCall({ ...perfect(10), rightReplies: 9 }, FINISH)).toBe(2);
  });
  it("one short reply (under the word minimum) drops to two", () => {
    expect(starsForCall({ ...perfect(6), shortReplies: 1 }, FINISH)).toBe(2);
  });
  it("one reply in English drops to two", () => {
    expect(starsForCall({ ...perfect(6), englishReplies: 1 }, FINISH)).toBe(2);
  });
  it("a perfect but unfinished call is still nothing", () => {
    expect(starsForCall(perfect(FINISH - 1), FINISH)).toBe(0);
  });
});

const es = (text: string): ReplyMeasure => measureReply(text, "es");

describe("measureReply: words in the course language", () => {
  it(`counts ${STAR_RULE.threeStarMinWords} Spanish words as a full sentence and 3 as short`, () => {
    expect(es("Quiero un café grande").courseWords).toBe(4);
    expect(es("Quiero un café grande").short).toBe(false);
    expect(es("Un café, gracias").short).toBe(true);
  });
  it("punctuation, accents and elisions are part of words, not words of their own", () => {
    expect(measureReply("¿Qu'est-ce que c'est ?", "fr").courseWords).toBe(3);
    expect(es("¡Sí! ¿Cómo está?").courseWords).toBe(3);
  });
  it("English words in a Spanish reply are not course-language words", () => {
    // 4 words, one of them English: 3 Spanish words, so short.
    expect(es("Quiero un café please").courseWords).toBe(3);
    expect(es("Quiero un café please").short).toBe(true);
  });
  it("in the English course every word counts", () => {
    expect(measureReply("I would like a coffee", "en").courseWords).toBe(5);
  });
});

describe("measureReply: falling back to English", () => {
  it("a reply in English in a Spanish course is a fallback", () => {
    expect(es("Yes please, I want a coffee").english).toBe(true);
  });
  it("one English word in four (25%) is a fallback; one in five is not", () => {
    expect(es("Quiero un café please").english).toBe(true);
    expect(es("Quiero un café grande please").english).toBe(false);
  });
  it("a Spanish reply with no English is not a fallback", () => {
    expect(es("Quisiera un café con leche, por favor").english).toBe(false);
  });
  it("Spanish and French words that look like English are not English (he, a, no, me, on, son)", () => {
    expect(es("No, me he quedado a casa con mi son").english).toBe(false);
    expect(measureReply("On a un chat et son chien", "fr").english).toBe(false);
  });
  it("the English course never falls back to English", () => {
    expect(measureReply("Yes please, I want a coffee", "en").english).toBe(false);
  });
  it("an empty reply is short and not English", () => {
    expect(es("   ")).toEqual({ courseWords: 0, short: true, english: false });
  });
});

describe("starRuleLines: the copy follows the mode", () => {
  it("a chat finishes a chat, a call finishes a call; the other lines are the same", () => {
    expect(starRuleLines("chat")[0][1]).toBe("Finish the chat");
    expect(starRuleLines("call")[0][1]).toBe("Finish the call");
    expect(starRuleLines("chat").slice(1)).toEqual(STAR_RULE_LINES.slice(1));
  });
});

describe("callCountsAsDone", () => {
  it("counts a finished call only when it earned at least one star", () => {
    expect(callCountsAsDone(0)).toBe(false);
    expect(callCountsAsDone(null)).toBe(false);
    expect(callCountsAsDone(undefined)).toBe(false);
    expect(callCountsAsDone(1)).toBe(true);
    expect(callCountsAsDone(3)).toBe(true);
  });
});
