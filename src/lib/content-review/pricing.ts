// Prices and token bounds for the full content review. Two numbers per request:
//
// - EXPECTED: what the cost plan reports (characters / 3, the observed rate for this content).
// - WORST CASE: what the ledger reserves before anything is submitted. It must be an upper bound
//   the provider cannot exceed, so it counts every input byte as a token (a byte-level BPE token
//   is at least one byte), adds a fixed allowance per message, prices any cached prefix at the
//   cache-WRITE rate (requests in a batch run in parallel and may all miss the cache), and bills
//   max_tokens in full (max_tokens bounds visible output and thinking together).
//
// Prices are US dollars per million tokens at the providers' STANDARD rates; batch discounts are
// applied here, not baked into the table. Sources, checked 2026-11-06:
//   Anthropic: platform.claude.com/docs (batch-processing: Sonnet 5.5 $1/$5, Opus 5.5 $2/$10 batch;
//   prompt-caching: 1h write 2x input, read 0.05x input on Sonnet 5.5 and Opus 5.5).
//   Mistral: docs.mistral.ai/models/mistral-large-4 ($0.70/$2.10) and mistral.ai/pricing (batch 50% off).

export type Provider = "anthropic" | "mistral";

export type ModelPrice = {
  provider: Provider;
  /** Standard (non-batch) input and output price, USD per million tokens. */
  input: number;
  output: number;
  /** Multipliers on `input` for prompt caching (Anthropic only). */
  cacheWrite1h?: number;
  cacheRead?: number;
  /** Price multiplier for the provider's batch API. */
  batch: number;
};

export const MODELS = {
  "claude-sonnet-5-5": {
    provider: "anthropic",
    input: 2,
    output: 10,
    cacheWrite1h: 2,
    cacheRead: 0.05,
    batch: 0.5,
  },
  "claude-opus-5-5": {
    provider: "anthropic",
    input: 4,
    output: 20,
    cacheWrite1h: 2,
    cacheRead: 0.05,
    batch: 0.5,
  },
  // Mistral's own model card (docs.mistral.ai/models/mistral-large-4, read 2026-11-06): $0.70 in,
  // $2.10 out; mistral.ai/pricing: batch is 50% off. The id is from GET /v1/models on the owner's
  // account (there is no "mistral-large-latest" alias). It always reasons; its reasoning tokens are
  // counted as output here (the docs do not say otherwise, so the estimate errs high).
  "mistral-large-4": { provider: "mistral", input: 0.7, output: 2.1, batch: 0.5 },
} as const satisfies Record<string, ModelPrice>;
export type ModelId = keyof typeof MODELS;

export function priceOf(model: string): ModelPrice {
  const p = (MODELS as Record<string, ModelPrice>)[model];
  if (!p) throw new Error(`No price for model ${model}: add it to MODELS before using it.`);
  return p;
}

/** Observed rate for this content (EN/FR/ES); the expected figure only, never the reservation. */
export const CHARS_PER_TOKEN = 3;
/** Role markers and framing per message, and per request, generous. */
export const TOKENS_PER_MESSAGE = 32;
export const TOKENS_PER_REQUEST = 64;

const utf8Bytes = (s: string) => new TextEncoder().encode(s).length;

/** One request's text, split into the cacheable prefix (rubric) and the rest. */
export type RequestShape = {
  /** Text sent with a cache breakpoint (the rubric); "" when none. */
  cached: string;
  /** Everything else sent (the items). */
  uncached: string;
  /** Number of messages, system included. */
  messages: number;
  /** The request's max_tokens: a hard ceiling on output, thinking included. */
  maxTokens: number;
};

/** An upper bound on a request's input tokens: one token per byte plus framing. */
export function worstInputTokens(r: RequestShape) {
  const framing = TOKENS_PER_REQUEST + r.messages * TOKENS_PER_MESSAGE;
  return { cached: utf8Bytes(r.cached), uncached: utf8Bytes(r.uncached) + framing };
}

/** The most a request can cost. `batch` false prices it as a synchronous call. */
export function worstCaseUsd(model: string, r: RequestShape, batch = true): number {
  const p = priceOf(model);
  const t = worstInputTokens(r);
  const cachedRate = p.input * (p.cacheWrite1h ?? 1);
  const usd = (t.cached * cachedRate + t.uncached * p.input + r.maxTokens * p.output) / 1e6;
  return usd * (batch ? p.batch : 1);
}

/** The expected cost of a request, given the expected output length and whether the cache hits. */
export function expectedUsd(
  model: string,
  r: RequestShape,
  expectedOutputTokens: number,
  opts: { batch?: boolean; cacheHit?: boolean } = {},
): number {
  const p = priceOf(model);
  const cached = Math.ceil(r.cached.length / CHARS_PER_TOKEN);
  const uncached =
    Math.ceil(r.uncached.length / CHARS_PER_TOKEN) + TOKENS_PER_REQUEST + r.messages * 8;
  const cachedRate =
    p.cacheRead !== undefined && opts.cacheHit !== false
      ? p.input * p.cacheRead
      : p.input * (p.cacheWrite1h ?? 1);
  const usd =
    (cached * cachedRate +
      uncached * p.input +
      Math.min(expectedOutputTokens, r.maxTokens) * p.output) /
    1e6;
  return usd * (opts.batch === false ? 1 : p.batch);
}

/** Anthropic usage block, as returned per message (batch results carry the same block). */
export type AnthropicUsage = {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation?: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number };
};

/** What an Anthropic request actually cost, from its usage block. */
export function anthropicUsageUsd(model: string, u: AnthropicUsage, batch = true): number {
  const p = priceOf(model);
  const w1h = u.cache_creation?.ephemeral_1h_input_tokens;
  const w5m = u.cache_creation?.ephemeral_5m_input_tokens;
  // Without the per-TTL breakdown, count every cache write at the dearer 1h rate.
  const writes =
    w1h !== undefined || w5m !== undefined
      ? (w1h ?? 0) * 2 + (w5m ?? 0) * 1.25
      : (u.cache_creation_input_tokens ?? 0) * 2;
  const usd =
    ((u.input_tokens ?? 0) * p.input +
      writes * p.input +
      (u.cache_read_input_tokens ?? 0) * p.input * (p.cacheRead ?? 0.1) +
      (u.output_tokens ?? 0) * p.output) /
    1e6;
  return usd * (batch ? p.batch : 1);
}

/** What a Mistral request actually cost (OpenAI-style usage block). */
export function mistralUsageUsd(
  model: string,
  u: { prompt_tokens?: number; completion_tokens?: number },
  batch = true,
): number {
  const p = priceOf(model);
  const usd = ((u.prompt_tokens ?? 0) * p.input + (u.completion_tokens ?? 0) * p.output) / 1e6;
  return usd * (batch ? p.batch : 1);
}
