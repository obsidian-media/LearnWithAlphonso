import { describe, expect, it } from "vitest";
import { detectContentLanguage, languageScores } from "./content-language";

describe("detectContentLanguage", () => {
  it("recognizes a short line in each course language", () => {
    expect(detectContentLanguage("Hi there, are you looking to make a return today?")).toBe("en");
    expect(detectContentLanguage("Bonjour ! C'est pour un retour ?")).toBe("fr");
    expect(detectContentLanguage("¡Hola, buenas tardes! ¿Viene a hacer una devolución?")).toBe(
      "es",
    );
  });

  it("does not let words shared by French and Spanish decide the answer", () => {
    // "la", "de", "que", "en", "un" are in both languages and score nothing.
    expect(languageScores("la de que en un")).toEqual({ en: 0, fr: 0, es: 0 });
    expect(detectContentLanguage("la de que en un")).toBeNull();
  });

  it("counts characters only one language uses", () => {
    expect(languageScores("¿¡ñ").es).toBe(3);
    expect(languageScores("çà").fr).toBe(2);
    // "é" is shared by French and Spanish, so it scores for neither.
    expect(languageScores("é")).toEqual({ en: 0, fr: 0, es: 0 });
  });

  it("returns null when the text gives too little signal", () => {
    expect(detectContentLanguage("Merci")).toBeNull();
    expect(detectContentLanguage("")).toBeNull();
  });
});
