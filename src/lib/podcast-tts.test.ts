import { describe, expect, it } from "vitest";
import { chunkScript } from "./podcast-tts";

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

  it("returns no chunks for an empty or whitespace-only script", () => {
    expect(chunkScript("   \n  ")).toEqual([]);
  });
});
