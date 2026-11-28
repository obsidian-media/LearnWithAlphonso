import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildSpeaking,
  countKeyPhrases,
  isPositive,
  normalizeForMatch,
  parseSpeaking,
  speakingSentence,
  trendOf,
  type SpeakingNote,
  type SpeakingSignals,
} from "./rehearsal-speaking";

const sig = (o: Partial<SpeakingSignals> = {}): SpeakingSignals => ({
  replies: 9,
  full: 7,
  english: 0,
  keyUsed: 3,
  keyTotal: 8,
  ...o,
});
const kinds = (s: ReturnType<typeof buildSpeaking>) => s?.notes.map((n) => n.kind);

describe("the key-phrase matcher", () => {
  it("ignores case, accents and punctuation", () => {
    expect(normalizeForMatch("  Café, ÉTÉ!  l'été ")).toBe("cafe ete l ete");
  });

  it("matches an accented phrase typed without accents (and the reverse)", () => {
    expect(
      countKeyPhrases(["Je voudrais un café"], ["je voudrais un cafe, s'il vous plait"]),
    ).toEqual({
      used: 1,
      total: 1,
    });
    expect(countKeyPhrases(["je voudrais un cafe"], ["Je voudrais un CAFÉ."])).toEqual({
      used: 1,
      total: 1,
    });
  });

  it("matches punctuation-stripped containment inside a longer reply", () => {
    expect(
      countKeyPhrases(
        ["Could you repeat that, please?"],
        ["Sorry! could you repeat that please. Thanks"],
      ),
    ).toEqual({ used: 1, total: 1 });
  });

  it("counts whole words only, and each phrase once", () => {
    expect(countKeyPhrases(["in"], ["I have pain"])).toEqual({ used: 0, total: 1 });
    expect(countKeyPhrases(["thank you"], ["thank you thank you"]).used).toBe(1);
  });

  it("does not match across two replies", () => {
    expect(countKeyPhrases(["good question"], ["that is good", "question time"]).used).toBe(0);
  });

  it("skips empty and repeated phrases in the total", () => {
    expect(countKeyPhrases(["", "...", "Hello", "hello!"], ["hello"])).toEqual({
      used: 1,
      total: 1,
    });
  });
});

describe("which notes, and in which order", () => {
  it("puts a positive note first, then the rest in the fixed kind order", () => {
    const s = buildSpeaking(sig({ english: 2 }), { full_replies: 4, key_phrases: 4 });
    expect(s?.notes).toEqual([
      { kind: "full_replies", count: 7, total: 9, previous: 4 },
      { kind: "key_phrases", count: 3, total: 8, previous: 4 },
      { kind: "english_fallback", count: 2, total: 9, previous: null },
    ]);
  });

  it("a positive later kind jumps ahead of a neutral earlier kind", () => {
    // full 3 of 9 (down from 5) is neutral; key phrases 6 of 8 (up) is positive and leads.
    const s = buildSpeaking(sig({ full: 3, keyUsed: 6 }), { full_replies: 5, key_phrases: 2 });
    expect(kinds(s)).toEqual(["key_phrases", "full_replies"]);
  });

  it("less English than last time is positive and leads", () => {
    const s = buildSpeaking(sig({ full: 2, english: 1, keyUsed: 0 }), {
      full_replies: 5,
      english_fallback: 3,
    });
    expect(kinds(s)).toEqual(["english_fallback", "full_replies"]);
  });

  it("holds at most 3 notes", () => {
    const s = buildSpeaking(sig({ english: 2 }), {
      full_replies: 1,
      key_phrases: 1,
      english_fallback: 5,
    });
    expect(s?.notes).toHaveLength(3);
  });

  it("English is never the lead while another note exists", () => {
    const s = buildSpeaking(sig({ full: 1, keyUsed: 1, english: 4 }), {
      full_replies: 5,
      key_phrases: 5,
      english_fallback: 0,
    });
    expect(s?.notes[0]?.kind).toBe("full_replies");
  });

  it("leaves out English when 0 and 0 or unknown last time, so a positive note can lead", () => {
    expect(kinds(buildSpeaking(sig(), null))).toEqual(["full_replies", "key_phrases"]);
    expect(kinds(buildSpeaking(sig(), { english_fallback: 0 }))).not.toContain("english_fallback");
  });

  it("keeps a 0 count when last time was higher (down is still honest)", () => {
    const s = buildSpeaking(sig({ english: 0 }), { english_fallback: 2 });
    expect(s?.notes.find((n) => n.kind === "english_fallback")).toEqual({
      kind: "english_fallback",
      count: 0,
      total: 9,
      previous: 2,
    });
  });

  it("leaves out a kind whose total is 0", () => {
    expect(kinds(buildSpeaking(sig({ keyTotal: 0, keyUsed: 0 }), null))).toEqual(["full_replies"]);
  });

  it("leaves out an impossible count", () => {
    expect(kinds(buildSpeaking(sig({ full: 10 }), null))).not.toContain("full_replies");
  });

  it("is undefined when nothing is left to say", () => {
    expect(buildSpeaking(sig({ full: 0, keyUsed: 0, english: 0 }), null)).toBeUndefined();
    expect(
      buildSpeaking(sig({ replies: 0, full: 0, keyTotal: 0, keyUsed: 0 }), null),
    ).toBeUndefined();
  });

  it("a previous run with the signals missing is no comparison", () => {
    const s = buildSpeaking(sig(), { full_replies: null, key_phrases: undefined });
    expect(s?.notes.every((n) => n.previous === null)).toBe(true);
  });
});

describe("what counts as positive", () => {
  const n = (
    kind: SpeakingNote["kind"],
    count: number,
    total: number,
    previous: number | null,
  ) => ({
    kind,
    count,
    total,
    previous,
  });
  it("up is positive; same needs a majority; down is not", () => {
    expect(isPositive(n("full_replies", 3, 9, 2))).toBe(true);
    expect(isPositive(n("full_replies", 5, 9, 5))).toBe(true);
    expect(isPositive(n("full_replies", 2, 9, 2))).toBe(false);
    expect(isPositive(n("full_replies", 7, 9, 8))).toBe(false);
  });
  it("with no previous, a majority is positive", () => {
    expect(isPositive(n("key_phrases", 4, 8, null))).toBe(true);
    expect(isPositive(n("key_phrases", 3, 8, null))).toBe(false);
  });
  it("English is positive only when lower than last time", () => {
    expect(isPositive(n("english_fallback", 1, 9, 2))).toBe(true);
    expect(isPositive(n("english_fallback", 2, 9, 2))).toBe(false);
    expect(isPositive(n("english_fallback", 0, 9, null))).toBe(false);
  });
});

describe("the sentences and the trend", () => {
  const s = (
    kind: SpeakingNote["kind"],
    count: number,
    total: number,
    previous: number | null,
    course: "en" | "fr" | "es" = "fr",
  ) => speakingSentence({ kind, count, total, previous }, course);
  it("reads as the design says", () => {
    expect(s("full_replies", 7, 9, 4)).toBe(
      "You answered in full sentences 7 of 9 times, up from 4 last time.",
    );
    expect(s("english_fallback", 2, 9, null)).toBe("You switched to English twice.");
    expect(s("key_phrases", 3, 8, null)).toBe("You used 3 of your 8 key phrases.");
  });
  it("is neutral for a lower number and says so for the same", () => {
    expect(s("full_replies", 3, 9, 5)).toBe(
      "You answered in full sentences 3 of 9 times, down from 5 last time.",
    );
    expect(s("key_phrases", 4, 8, 4)).toBe(
      "You used 4 of your 8 key phrases, the same as last time.",
    );
    expect(s("english_fallback", 0, 9, 2)).toBe(
      "You stayed in French the whole time, down from 2 last time.",
    );
    expect(s("english_fallback", 0, 9, null, "es")).toBe("You stayed in Spanish the whole time.");
    expect(s("english_fallback", 0, 9, 2, "es")).toBe(
      "You stayed in Spanish the whole time, down from 2 last time.",
    );
    expect(s("english_fallback", 0, 9, 0, "fr")).toBe(
      "You stayed in French the whole time, the same as last time.",
    );
    expect(s("english_fallback", 1, 9, null)).toBe("You switched to English once.");
    expect(s("english_fallback", 3, 9, null)).toBe("You switched to English 3 times.");
    expect(s("english_fallback", 5, 9, null)).toBe("You switched to English 5 times.");
  });
  it("never carries a percentage or a grade", () => {
    for (const k of ["full_replies", "english_fallback", "key_phrases"] as const)
      expect(s(k, 3, 8, 2)).not.toMatch(/%|score|grade/i);
  });
  it("trend compares count with previous", () => {
    expect(trendOf({ kind: "full_replies", count: 3, total: 9, previous: 2 })).toBe("up");
    expect(trendOf({ kind: "full_replies", count: 2, total: 9, previous: 3 })).toBe("down");
    expect(trendOf({ kind: "full_replies", count: 2, total: 9, previous: 2 })).toBe("same");
    expect(trendOf({ kind: "full_replies", count: 2, total: 9, previous: null })).toBeNull();
  });
});

describe("the shared fixture decodes, and is what the server would build", () => {
  const fx = JSON.parse(
    readFileSync(new URL("../../tests/fixtures/rehearsal-api.json", import.meta.url), "utf8"),
  ) as {
    speaking: { full: { rehearsalSpeaking: unknown }; single: { rehearsalSpeaking: unknown } };
  };
  it("full", () => {
    expect(parseSpeaking(fx.speaking.full.rehearsalSpeaking)).toEqual(
      buildSpeaking(sig({ english: 2 }), { full_replies: 4, key_phrases: 4 }),
    );
  });
  it("single", () => {
    expect(parseSpeaking(fx.speaking.single.rehearsalSpeaking)).toEqual(
      buildSpeaking(sig({ replies: 9, full: 0, english: 0 }), null),
    );
  });
  it("parse rejects a wrong shape and drops an unknown kind", () => {
    expect(parseSpeaking(null)).toBeNull();
    expect(parseSpeaking({ notes: "x" })).toBeNull();
    expect(
      parseSpeaking({ notes: [{ kind: "score", count: 1, total: 2, previous: null }] }),
    ).toBeNull();
  });
});
