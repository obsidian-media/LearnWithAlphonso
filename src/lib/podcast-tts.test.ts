import { describe, expect, it } from "vitest";
import {
  chunkScript,
  DEFAULT_VOICE_FOR_COURSE,
  deepgramSpeakUrl,
  voiceLanguage,
  voiceMatchesCourse,
} from "./podcast-tts";

describe("chunkScript", () => {
  it("returns a single chunk when the script fits", () => {
    expect(chunkScript("Hello there. How are you?", 2000)).toEqual(["Hello there. How are you?"]);
  });

  it("splits on sentence boundaries, never mid-sentence", () => {
    const chunks = chunkScript("One sentence here. Two sentence here. Three here.", 25);
    expect(chunks.every((c) => c.length <= 25)).toBe(true);
    expect(chunks.join(" ")).toBe("One sentence here. Two sentence here. Three here.");
  });

  it("keeps every chunk within Deepgram's 2000-character limit by default", () => {
    const script = "This is a sentence of moderate length. ".repeat(200);
    for (const chunk of chunkScript(script)) expect(chunk.length).toBeLessThanOrEqual(2000);
  });

  // Review Focus #3: no sentence boundary exists to split on. Without a
  // hard split the chunk exceeds the limit and Deepgram truncates it
  // silently -- audio goes missing with no error anywhere.
  it("hard-splits a single sentence longer than the limit", () => {
    const monster = `${"word ".repeat(600)}.`;
    const chunks = chunkScript(monster, 100);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(100);
  });

  // A hard split at a fixed character offset audibly cuts a word in half.
  // Falling back to the nearest earlier whitespace keeps every chunk a
  // whole word, at the cost of a few characters of slack per chunk.
  it("hard-splits on whitespace, never mid-word", () => {
    // A limit that is not a multiple of "word "'s 5-character period, so a
    // fixed-offset cut is guaranteed to land inside a word rather than
    // between two of them.
    const monster = `${"word ".repeat(600)}.`;
    const chunks = chunkScript(monster, 97);
    for (const chunk of chunks) {
      expect(chunk).not.toMatch(/\bwor?$/);
    }
    expect(chunks.join(" ").replace(/\s+/g, " ")).toBe(monster.trim().replace(/\s+/g, " "));
  });

  it("returns no chunks for an empty or whitespace-only script", () => {
    expect(chunkScript("   \n  ")).toEqual([]);
  });
});

describe("deepgramSpeakUrl", () => {
  it("always opts out of Deepgram's model improvement programme", () => {
    const url = new URL(deepgramSpeakUrl("aura-2-thalia-en"));
    expect(url.origin + url.pathname).toBe("https://api.deepgram.com/v1/speak");
    expect(url.searchParams.get("mip_opt_out")).toBe("true");
    expect(url.searchParams.get("model")).toBe("aura-2-thalia-en");
    expect(url.searchParams.get("encoding")).toBe("mp3");
  });

  it("keeps the opt-out literal in the URL text, where the call-site scan looks for it", () => {
    expect(deepgramSpeakUrl("aura-2-agathe-fr")).toContain("mip_opt_out=true");
  });
});

describe("voice and course", () => {
  it("uses the app's native voice per course", () => {
    expect(DEFAULT_VOICE_FOR_COURSE).toEqual({
      en: "aura-2-thalia-en",
      fr: "aura-2-agathe-fr",
      es: "aura-2-selena-es",
    });
  });

  it("reads the language from an Aura-2 voice id", () => {
    expect(voiceLanguage("aura-2-selena-es")).toBe("es");
    expect(voiceLanguage("aura-2-agathe-fr")).toBe("fr");
    expect(voiceLanguage("aura-asteria-en")).toBeNull();
    expect(voiceLanguage("aura-2-thalia-de")).toBeNull();
  });

  it("refuses an English voice on a French or Spanish episode", () => {
    expect(voiceMatchesCourse("aura-2-thalia-en", "fr")).toBe(false);
    expect(voiceMatchesCourse("aura-2-thalia-en", "es")).toBe(false);
    expect(voiceMatchesCourse("aura-2-agathe-fr", "fr")).toBe(true);
    expect(voiceMatchesCourse("aura-2-selena-es", "es")).toBe(true);
  });
});
