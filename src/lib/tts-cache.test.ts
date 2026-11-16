import { describe, expect, it } from "vitest";
import {
  fixedSpokenLines,
  isCacheableSpokenLine,
  normalizeSpokenLine,
  ttsCacheKey,
} from "./tts-cache";
import { readCachedSpeech, writeCachedSpeech, TTS_CACHE_MAX_BYTES } from "./tts-cache.server";
import { SCENARIOS } from "@/data/scenarios";
import { CAMPAIGNS } from "@/data/campaigns";
import { buildHectorGreeting, namelessHectorGreetings } from "./hector-greeting";

describe("the cache key", () => {
  it("is stable: the same voice and line always map to the same key", async () => {
    const a = await ttsCacheKey("aura-2-saturn-en", "Hello there.");
    const b = await ttsCacheKey("aura-2-saturn-en", "Hello there.");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
  it("is independent of stray whitespace in the text", async () => {
    expect(await ttsCacheKey("v", "Hello   there.\n")).toBe(
      await ttsCacheKey("v", " Hello there. "),
    );
  });
  it("differs by voice and by wording", async () => {
    const base = await ttsCacheKey("aura-2-saturn-en", "Hello there.");
    expect(await ttsCacheKey("aura-2-hermes-en", "Hello there.")).not.toBe(base);
    expect(await ttsCacheKey("aura-2-saturn-en", "Hello there!")).not.toBe(base);
  });
  it("does not reveal the line", async () => {
    expect(await ttsCacheKey("v", "Hello there.")).not.toContain("hello");
  });
  it("normalises to NFC so a composed and a decomposed accent are one line", () => {
    expect(normalizeSpokenLine("é")).toBe(normalizeSpokenLine("é"));
  });
});

describe("which lines are cached", () => {
  it("every scene opener, in every course, is cacheable", () => {
    for (const s of SCENARIOS)
      for (const c of ["en", "fr", "es"] as const) {
        expect(isCacheableSpokenLine(s.opener[c])).toBe(true);
      }
    for (const camp of CAMPAIGNS)
      for (const scene of camp.scenes)
        for (const c of ["en", "fr", "es"] as const) {
          expect(isCacheableSpokenLine(scene.opener[c])).toBe(true);
        }
  });
  it("a name-less Hector greeting is cacheable; the same greeting with a name is not", () => {
    const plain = buildHectorGreeting({ course: "en", cefr: "A1", name: null, weakSpot: null });
    const named = buildHectorGreeting({ course: "en", cefr: "A1", name: "Maria", weakSpot: null });
    expect(plain).not.toBe(named);
    expect(isCacheableSpokenLine(plain)).toBe(true);
    expect(isCacheableSpokenLine(named)).toBe(false);
    expect(namelessHectorGreetings().every(isCacheableSpokenLine)).toBe(true);
  });
  it("no greeting that carries a name is ever in the fixed set", () => {
    for (const name of ["Maria", "Jean-Luc", "O'Neil"]) {
      for (const course of ["en", "fr", "es"] as const) {
        for (const cefr of ["A1", "B2"]) {
          const g = buildHectorGreeting({ course, cefr, name, weakSpot: null });
          expect(isCacheableSpokenLine(g)).toBe(false);
        }
      }
    }
  });
  it("a model reply, an arbitrary line, and an opener with a learner's words added are never cached", () => {
    const opener = SCENARIOS[0]!.opener.en;
    for (const text of [
      "That was a great answer, Maria. Let's try another one.",
      "Hello",
      `${opener} My name is Maria.`,
      "",
      "   ",
    ]) {
      expect(isCacheableSpokenLine(text)).toBe(false);
    }
  });
  it("the fixed set is finite and holds nothing empty", () => {
    const set = fixedSpokenLines();
    expect(set.size).toBeGreaterThan(50);
    expect(set.has("")).toBe(false);
  });
});

describe("storage is best effort", () => {
  const failing = {
    storage: {
      from: () => ({
        download: () => Promise.reject(new Error("down")),
        upload: () => Promise.reject(new Error("down")),
      }),
    },
  };
  it("a failing read is a miss, a failing write does not throw", async () => {
    await expect(readCachedSpeech("k", failing as never)).resolves.toBeNull();
    await expect(
      writeCachedSpeech("k", new Uint8Array([1, 2, 3]), failing as never),
    ).resolves.toBeUndefined();
  });
  it("a read of empty or oversized audio is a miss; oversized or empty audio is never written", async () => {
    let uploads = 0;
    const client = {
      storage: {
        from: () => ({
          download: () => Promise.resolve({ data: new Blob([]), error: null }),
          upload: () => {
            uploads += 1;
            return Promise.resolve({ error: null });
          },
        }),
      },
    };
    await expect(readCachedSpeech("k", client as never)).resolves.toBeNull();
    await writeCachedSpeech("k", new Uint8Array(0), client as never);
    await writeCachedSpeech("k", new Uint8Array(TTS_CACHE_MAX_BYTES + 1), client as never);
    expect(uploads).toBe(0);
    await writeCachedSpeech("k", new Uint8Array([1]), client as never);
    expect(uploads).toBe(1);
  });
});
