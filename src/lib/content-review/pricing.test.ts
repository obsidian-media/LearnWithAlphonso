import { describe, expect, it } from "vitest";
import {
  anthropicUsageUsd,
  expectedUsd,
  mistralUsageUsd,
  priceOf,
  worstCaseUsd,
  worstInputTokens,
} from "./pricing";

const shape = {
  cached: "rubric ".repeat(500),
  uncached: "Je ___ (parler) français. ".repeat(40),
  messages: 2,
  maxTokens: 3000,
};

describe("prices", () => {
  it("match the batch table on platform.claude.com (2026-11-06): Sonnet 5.5 $1/$5, Opus 5.5 $2/$10", () => {
    const s = priceOf("claude-sonnet-5-5");
    const o = priceOf("claude-opus-5-5");
    expect([s.input * s.batch, s.output * s.batch]).toEqual([1, 5]);
    expect([o.input * o.batch, o.output * o.batch]).toEqual([2, 10]);
  });

  it("an unknown model is an error, not a free call", () => {
    expect(() => priceOf("claude-unknown")).toThrow(/No price/);
  });
});

describe("the worst case is an upper bound", () => {
  it("counts every byte as a token (mutation: characters instead of bytes)", () => {
    const at = (s: string) =>
      worstInputTokens({ cached: s, uncached: "", messages: 1, maxTokens: 1 }).cached;
    // "é" is two bytes in UTF-8: accented French and Spanish text must not be under-counted.
    expect(at("é".repeat(100))).toBe(200);
    expect(at("e".repeat(100))).toBe(100);
  });

  it("is above the expected cost, with or without a cache hit", () => {
    for (const m of ["claude-sonnet-5-5", "claude-opus-5-5", "mistral-large-4"]) {
      const worst = worstCaseUsd(m, shape);
      expect(worst).toBeGreaterThan(expectedUsd(m, shape, 600, { cacheHit: true }));
      expect(worst).toBeGreaterThan(expectedUsd(m, shape, 600, { cacheHit: false }));
    }
  });

  it("is above the billed cost of any reply within max_tokens (mutation: price the cache at the read rate)", () => {
    const m = "claude-sonnet-5-5";
    const t = worstInputTokens(shape);
    // The most a provider could bill: every input token a 1h cache write, max_tokens of output.
    const billed = anthropicUsageUsd(m, {
      input_tokens: t.uncached,
      cache_creation_input_tokens: t.cached,
      cache_creation: { ephemeral_1h_input_tokens: t.cached },
      output_tokens: shape.maxTokens,
    });
    expect(worstCaseUsd(m, shape)).toBeGreaterThanOrEqual(billed);
  });

  it("bills max_tokens in full (mutation: use the expected output)", () => {
    const small = worstCaseUsd("claude-opus-5-5", { ...shape, maxTokens: 100 });
    const big = worstCaseUsd("claude-opus-5-5", { ...shape, maxTokens: 100_100 });
    expect(big - small).toBeCloseTo((100_000 * 20 * 0.5) / 1e6, 6);
  });

  it("a synchronous call is priced at the full rate", () => {
    expect(worstCaseUsd("claude-sonnet-5-5", shape, false)).toBeCloseTo(
      worstCaseUsd("claude-sonnet-5-5", shape) * 2,
      10,
    );
  });
});

describe("actual cost from usage", () => {
  it("Anthropic batch: input, 1h writes at 2x, reads at 0.05x, output", () => {
    const usd = anthropicUsageUsd("claude-sonnet-5-5", {
      input_tokens: 1_000_000,
      cache_creation: { ephemeral_1h_input_tokens: 1_000_000 },
      cache_read_input_tokens: 1_000_000,
      output_tokens: 1_000_000,
    });
    // (2 + 4 + 0.1 + 10) * 0.5
    expect(usd).toBeCloseTo(8.05, 6);
  });

  it("an unbroken-down cache write is counted at the dearer 1h rate", () => {
    const a = anthropicUsageUsd("claude-sonnet-5-5", { cache_creation_input_tokens: 1_000_000 });
    expect(a).toBeCloseTo(2, 6);
  });

  it("Mistral batch: half the listed rate", () => {
    expect(
      mistralUsageUsd("mistral-large-4", {
        prompt_tokens: 1_000_000,
        completion_tokens: 1_000_000,
      }),
    ).toBeCloseTo(1.4, 6);
  });
});
