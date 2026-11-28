import { describe, expect, it } from "vitest";
import { trimToSentences } from "./sentence-trim";
import { TTS_MAX_CHARS } from "./tts-limits";

describe("trimToSentences", () => {
  it("leaves text within the limit untouched", () => {
    expect(trimToSentences("One. Two.", 600)).toBe("One. Two.");
  });
  it("cuts at the last sentence end that fits, never mid-sentence", () => {
    expect(trimToSentences("Alpha one. Beta two. Gamma three.", 22)).toBe("Alpha one. Beta two.");
    expect(trimToSentences("Alpha one. Beta two. Gamma three.", 19)).toBe("Alpha one.");
  });
  it("understands question marks, exclamations and Spanish or French punctuation", () => {
    expect(trimToSentences("¿Qué tal? ¡Muy bien! Y usted, ¿cómo está?", 20)).toBe(
      "¿Qué tal? ¡Muy bien!",
    );
    expect(trimToSentences("Bonjour. Comment allez-vous ? Très bien.", 30)).toBe(
      "Bonjour. Comment allez-vous ?",
    );
  });
  it("a single over-long sentence is cut at a word, never in the middle of one", () => {
    const out = trimToSentences("word ".repeat(200).trim() + ".", 50);
    expect(out.length).toBeLessThanOrEqual(50);
    expect(out.endsWith("word")).toBe(true);
  });
  it("always fits the TTS limit", () => {
    const long = Array.from({ length: 80 }, (_, i) => `Sentence ${i}.`).join(" ");
    expect(trimToSentences(long, TTS_MAX_CHARS).length).toBeLessThanOrEqual(TTS_MAX_CHARS);
  });
});
