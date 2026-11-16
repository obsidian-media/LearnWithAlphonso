import { describe, expect, it } from "vitest";
import {
  llmCostMicro,
  llmEntry,
  parseLlmUsage,
  sttCostMicro,
  sttEntry,
  toRow,
  ttsCostMicro,
  ttsEntry,
} from "./ai-cost";
import { LLM_USD_PER_MILLION_TOKENS, STT_USD_PER_MINUTE, TTS_USD_PER_1K_CHARS } from "./ai-prices";

describe("prices carry their source", () => {
  it("every listed price names the page and the day it was read", () => {
    const sources = [
      ...Object.values(STT_USD_PER_MINUTE).map((p) => p.source),
      ...TTS_USD_PER_1K_CHARS.map((p) => p.source),
      ...Object.values(LLM_USD_PER_MILLION_TOKENS).map((p) => p.source),
    ];
    expect(sources.length).toBeGreaterThan(0);
    for (const s of sources) {
      expect(s.url).toMatch(/^https:\/\//);
      expect(s.checkedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe("speech to text cost", () => {
  it("is audio minutes x the Nova-3 rate, in micro-dollars", () => {
    // 60 s at $0.0043/min = $0.0043 = 4300 micro
    expect(sttCostMicro("nova-3", 60)).toBe(4300);
    expect(sttCostMicro("nova-3", 30)).toBe(2150);
  });
  it("is unknown (null), not zero, for an unlisted model or an unreported length", () => {
    expect(sttCostMicro("nova-9", 60)).toBeNull();
    expect(sttCostMicro("nova-3", null)).toBeNull();
    expect(sttCostMicro("nova-3", -1)).toBeNull();
    expect(sttCostMicro("nova-3", Number.NaN)).toBeNull();
  });
  it("the row says so: unknown source, null cost, but the seconds still recorded", () => {
    const e = sttEntry({ userId: "u" }, "nova-3", null);
    expect(e).toMatchObject({ costMicroUsd: null, costSource: "unknown", sttSeconds: null });
    const ok = sttEntry({ userId: "u" }, "nova-3", 12.5);
    expect(ok).toMatchObject({
      costSource: "table",
      sttSeconds: 12.5,
      vendor: "deepgram",
      kind: "stt",
    });
    expect(ok.costMicroUsd).toBe(Math.round((12.5 / 60) * 0.0043 * 1e6));
  });
});

describe("text to speech cost", () => {
  it("is characters x the Aura-2 rate per 1,000", () => {
    // 1000 chars at $0.030 = $0.03 = 30000 micro
    expect(ttsCostMicro("aura-2-saturn-en", 1000)).toBe(30_000);
    expect(ttsCostMicro("aura-2-javier-es", 150)).toBe(4500);
  });
  it("prices Aura-1 at its own, lower rate and an unknown family as null", () => {
    expect(ttsCostMicro("aura-asteria-en", 1000)).toBe(15_000);
    expect(ttsCostMicro("mystery-voice", 1000)).toBeNull();
  });
  it("a cache hit costs 0, sends 0 characters and is flagged", () => {
    const hit = ttsEntry({ userId: "u" }, "aura-2-saturn-en", 150, true);
    expect(hit).toMatchObject({
      costMicroUsd: 0,
      ttsChars: 0,
      cacheHit: true,
      costSource: "table",
    });
    const miss = ttsEntry({ userId: "u" }, "aura-2-saturn-en", 150, false);
    expect(miss).toMatchObject({ costMicroUsd: 4500, ttsChars: 150, cacheHit: false });
  });
  it("an unpriced voice is logged with a null cost", () => {
    expect(ttsEntry({ userId: "u" }, "mystery", 10, false)).toMatchObject({
      costMicroUsd: null,
      costSource: "unknown",
    });
  });
});

describe("text model cost", () => {
  const reply = (usage: Record<string, unknown>, model = "anthropic/claude-haiku-5.5") => ({
    model,
    choices: [],
    usage,
  });

  it("reads tokens, model and the provider's cost", () => {
    const u = parseLlmUsage(reply({ prompt_tokens: 1200, completion_tokens: 300, cost: 0.00042 }));
    expect(u).toMatchObject({
      model: "anthropic/claude-haiku-5.5",
      inputTokens: 1200,
      outputTokens: 300,
      reportedCostUsd: 0.00042,
      isByok: false,
    });
  });

  it("uses the provider-reported cost when present (and says so)", () => {
    const e = llmEntry(
      { userId: "u", kind: "chat" },
      "a/requested",
      reply({ prompt_tokens: 1000, completion_tokens: 100, cost: 0.00042 }),
    );
    expect(e).toMatchObject({
      costMicroUsd: 420,
      costSource: "provider",
      model: "anthropic/claude-haiku-5.5",
    });
  });

  it("with BYOK the real spend is the fee plus the host's charge", () => {
    const e = llmEntry(
      { userId: "u", kind: "chat" },
      "m",
      reply({
        prompt_tokens: 1000,
        completion_tokens: 100,
        cost: 0.00001,
        is_byok: true,
        cost_details: { upstream_inference_cost: 0.00015 },
      }),
    );
    expect(e.costMicroUsd).toBe(160);
    expect(e.costSource).toBe("provider");
  });

  it("falls back to the price table x tokens when the reply reports no cost", () => {
    // haiku 5.5: $0.10 in, $0.50 out per million: 1000 in + 200 out = 0.0001 + 0.0001 = $0.0002
    const r = llmCostMicro("anthropic/claude-haiku-5.5", {
      inputTokens: 1000,
      outputTokens: 200,
      reportedCostUsd: null,
      upstreamCostUsd: null,
      isByok: false,
    });
    expect(r).toEqual({ micro: 200, source: "table" });
  });

  it("an unknown model with no reported cost is null + unknown, never guessed or zero", () => {
    const e = llmEntry(
      { userId: "u", kind: "chat" },
      "mystery/model",
      reply({ prompt_tokens: 10, completion_tokens: 5 }, "mystery/model"),
    );
    expect(e).toMatchObject({
      costMicroUsd: null,
      costSource: "unknown",
      inputTokens: 10,
      outputTokens: 5,
    });
  });

  it("a known model whose reply has no usage at all is unknown, not priced from nothing", () => {
    const e = llmEntry({ userId: "u", kind: "chat" }, "anthropic/claude-haiku-5.5", {
      choices: [],
    });
    expect(e).toMatchObject({ costMicroUsd: null, costSource: "unknown", inputTokens: null });
    expect(e.model).toBe("anthropic/claude-haiku-5.5");
  });

  it("garbage bodies never throw", () => {
    for (const body of [null, undefined, 5, "x", [], { usage: 3 }, { usage: { cost: "free" } }]) {
      expect(() => llmEntry({ userId: "u", kind: "chat" }, "m", body)).not.toThrow();
    }
    expect(parseLlmUsage({ usage: { cost: -1, prompt_tokens: -5 } })).toMatchObject({
      reportedCostUsd: null,
      inputTokens: null,
    });
  });

  it("the row maps every field to its column and caps the model length", () => {
    const row = toRow({ ...sttEntry({ userId: "u" }, "nova-3", 3), model: "x".repeat(300) });
    expect(Object.keys(row).sort()).toEqual(
      [
        "cache_hit",
        "cost_micro_usd",
        "cost_source",
        "input_tokens",
        "kind",
        "model",
        "output_tokens",
        "stt_seconds",
        "tts_chars",
        "user_id",
        "vendor",
      ].sort(),
    );
    expect((row.model as string).length).toBe(120);
    expect(row.user_id).toBe("u");
  });
});
