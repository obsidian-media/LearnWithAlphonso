import { describe, expect, it } from "vitest";
import {
  EXPLAIN_DAILY_LIMIT,
  EXPLANATION_MAX_CHARS,
  explainLanguageName,
  explainModeOf,
  explainOffer,
  explainRequestSchema,
  languageDirection,
  parseExplanation,
  splitDirectionRuns,
} from "./explain";
import { explainCacheKey } from "./explain.server";
import { NATIVE_LANGUAGES } from "./learner-profile";

describe("languageDirection", () => {
  it.each(["ar", "fa", "he", "ur", "ps"])("%s is right to left", (code) => {
    expect(languageDirection(code)).toBe("rtl");
  });
  it.each(["en", "fr", "es", "zh", "hi", "ku", "xx", ""])("%s is left to right", (code) => {
    expect(languageDirection(code)).toBe("ltr");
  });
  it("every right-to-left code is one the learner can choose", () => {
    for (const code of ["ar", "fa", "he", "ur", "ps"]) {
      expect(NATIVE_LANGUAGES as readonly string[]).toContain(code);
    }
  });
});

describe("explainModeOf", () => {
  it("defaults to tap-to-explain, the mock's default", () => {
    expect(explainModeOf(undefined)).toBe("tap");
    expect(explainModeOf("nonsense")).toBe("tap");
    expect(explainModeOf(null)).toBe("tap");
  });
  it("keeps a valid choice", () => {
    expect(explainModeOf("always")).toBe("always");
    expect(explainModeOf("off")).toBe("off");
  });
});

describe("explainOffer", () => {
  it("is a chip by default for a learner whose language differs from the course", () => {
    expect(explainOffer({ mode: "tap", nativeLanguage: "fa", course: "en" })).toBe("chip");
  });
  it("shows the explanation straight away in always mode", () => {
    expect(explainOffer({ mode: "always", nativeLanguage: "fa", course: "en" })).toBe("auto");
  });
  it("is hidden when the learner chose target language only", () => {
    expect(explainOffer({ mode: "off", nativeLanguage: "fa", course: "en" })).toBe("hidden");
  });
  it("is hidden when the native language is unset", () => {
    expect(explainOffer({ mode: "tap", nativeLanguage: undefined, course: "en" })).toBe("hidden");
  });
  it("is hidden when the native language equals the course language", () => {
    expect(explainOffer({ mode: "tap", nativeLanguage: "en", course: "en" })).toBe("hidden");
    expect(explainOffer({ mode: "always", nativeLanguage: "fr", course: "fr" })).toBe("hidden");
  });
});

describe("explainLanguageName", () => {
  it("names a language in English", () => {
    expect(explainLanguageName("fa")).toBe("Persian");
    expect(explainLanguageName("ar")).toBe("Arabic");
  });
});

describe("explainRequestSchema", () => {
  const wrong = {
    kind: "wrong-answer",
    course: "en",
    question: "I am live in a flat.",
    wrongAnswer: "I am live in a flat.",
    correctAnswer: "I live in a flat.",
  };
  it("accepts each kind", () => {
    expect(explainRequestSchema.safeParse(wrong).success).toBe(true);
    expect(
      explainRequestSchema.safeParse({ kind: "word", course: "en", word: "borrow" }).success,
    ).toBe(true);
    expect(
      explainRequestSchema.safeParse({ kind: "message", course: "fr", text: "Bonjour !" }).success,
    ).toBe(true);
  });
  it("rejects an unknown kind, course, or empty text", () => {
    expect(explainRequestSchema.safeParse({ ...wrong, kind: "essay" }).success).toBe(false);
    expect(explainRequestSchema.safeParse({ ...wrong, course: "de" }).success).toBe(false);
    expect(
      explainRequestSchema.safeParse({ kind: "message", course: "en", text: " " }).success,
    ).toBe(false);
  });
  it("caps the text so a long paste cannot become a long prompt", () => {
    expect(
      explainRequestSchema.safeParse({ kind: "message", course: "en", text: "a".repeat(1001) })
        .success,
    ).toBe(false);
  });
  it("does not let the client choose the language or the quota", () => {
    const r = explainRequestSchema.safeParse({ ...wrong, nativeLanguage: "fa", quota: "chat" });
    expect(r.success).toBe(false);
  });
});

describe("explainCacheKey", () => {
  const base = { kind: "word", course: "en", word: "borrow" } as const;
  it("is the same for the same item and language", () => {
    expect(explainCacheKey(base, "fa")).toBe(explainCacheKey({ ...base }, "fa"));
  });
  it("ignores spacing differences", () => {
    expect(explainCacheKey({ ...base, word: " borrow " }, "fa")).toBe(explainCacheKey(base, "fa"));
  });
  it("differs by language, course and item", () => {
    const k = explainCacheKey(base, "fa");
    expect(explainCacheKey(base, "ar")).not.toBe(k);
    expect(explainCacheKey({ ...base, course: "fr" }, "fa")).not.toBe(k);
    expect(explainCacheKey({ ...base, word: "lend" }, "fa")).not.toBe(k);
  });
  it("is a hash, so no learner text is stored as the key", () => {
    expect(explainCacheKey(base, "fa")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("parseExplanation", () => {
  it("trims and returns plain text", () => {
    expect(parseExplanation("  hello  ")).toBe("hello");
  });
  it("rejects empty output", () => {
    expect(parseExplanation("   ")).toBeNull();
    expect(parseExplanation(undefined)).toBeNull();
  });
  it("cuts overlong output at the cap", () => {
    const out = parseExplanation("x".repeat(EXPLANATION_MAX_CHARS + 50));
    expect(out?.length).toBeLessThanOrEqual(EXPLANATION_MAX_CHARS);
  });
});

it("explain has its own 40 a day, as the mock says", () => {
  expect(EXPLAIN_DAILY_LIMIT).toBe(40);
});

describe("splitDirectionRuns", () => {
  it("isolates the course-language phrase inside a right-to-left sentence, as the mock draws it", () => {
    const parts = splitDirectionRuns("برای جایی که زندگی می‌کنید: I live here. فعل am فقط");
    expect(parts.filter((p) => p.ltr).map((p) => p.text)).toEqual(["I live here.", "am"]);
    expect(parts.map((p) => p.text).join("")).toBe(
      "برای جایی که زندگی می‌کنید: I live here. فعل am فقط",
    );
  });
  it("keeps accented French and Spanish words whole", () => {
    const parts = splitDirectionRuns("در فرانسوی بگو: où habites-tu? سپس");
    expect(parts.filter((p) => p.ltr).map((p) => p.text)).toEqual(["où habites-tu?"]);
  });
  it("is one right-to-left piece when there is no Latin text", () => {
    expect(splitDirectionRuns("سلام")).toEqual([{ text: "سلام", ltr: false }]);
  });
  it("is empty for empty text", () => {
    expect(splitDirectionRuns("")).toEqual([]);
  });
});
