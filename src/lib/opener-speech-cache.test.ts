import { beforeEach, describe, expect, it, vi } from "vitest";
import { cachedOpenerSpeech, clearOpenerSpeechCache, openerSpeechKey } from "./opener-speech-cache";

describe("opener speech cache", () => {
  beforeEach(() => clearOpenerSpeechCache());

  it("fetches a line once, also when two requests overlap", async () => {
    const blob = new Blob(["a"]);
    const fetchBlob = vi.fn(async () => blob);
    const key = openerSpeechKey("Welcome!", "aura-2-thalia-en", "en");
    const [a, b] = await Promise.all([
      cachedOpenerSpeech(key, fetchBlob),
      cachedOpenerSpeech(key, fetchBlob),
    ]);
    expect(await cachedOpenerSpeech(key, fetchBlob)).toBe(blob);
    expect(a).toBe(blob);
    expect(b).toBe(blob);
    expect(fetchBlob).toHaveBeenCalledTimes(1);
  });

  it("does not cache a failure", async () => {
    const key = openerSpeechKey("Hola", null, "es");
    expect(await cachedOpenerSpeech(key, async () => null)).toBeNull();
    const blob = new Blob(["b"]);
    expect(await cachedOpenerSpeech(key, async () => blob)).toBe(blob);
  });

  it("keys by voice and course", () => {
    expect(openerSpeechKey("Hi", "a", "en")).not.toBe(openerSpeechKey("Hi", "b", "en"));
    expect(openerSpeechKey("Hi", "a", "en")).not.toBe(openerSpeechKey("Hi", "a", "fr"));
  });
});
