import { LLM_USD_PER_MILLION_TOKENS, STT_USD_PER_MINUTE, TTS_USD_PER_1K_CHARS } from "./ai-prices";

/**
 * AI cost, as pure functions: what one billable call cost, from the units the vendor reports. No I/O (the writer is
 * ai-cost-log.server.ts). Money is carried as whole micro-dollars (1 USD = 1,000,000) so sums never drift.
 *
 * A cost that cannot be known is NULL with `costSource: "unknown"`, never a guess and never 0: the admin panel counts
 * those calls and says so.
 */

export type AiVendor = "openrouter" | "deepgram";

/** What the call was for. The conversation kinds mirror the quota kinds (ai-quota.server.ts); the rest are extra. */
export type AiCostKind =
  | "chat"
  | "hector"
  | "explain"
  | "translate"
  | "define"
  | "support"
  | "recap"
  | "practice"
  | "weakness"
  | "stt"
  | "tts";

export type CostSource = "provider" | "table" | "unknown";

export type AiCostEntry = {
  userId: string;
  kind: AiCostKind;
  vendor: AiVendor;
  model: string;
  /** STT: audio seconds the vendor billed. null for anything else, or when the vendor reported none. */
  sttSeconds: number | null;
  /** TTS: characters of text sent to the vendor. A cache hit sent none: 0. */
  ttsChars: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  /** Estimated cost in USD micro-dollars; null = unknown (see costSource). */
  costMicroUsd: number | null;
  costSource: CostSource;
  /** A spoken line served from our own store instead of the vendor (cost 0 by construction). */
  cacheHit: boolean;
};

export const MICRO = 1_000_000;

export function usdToMicro(usd: number): number {
  return Math.round(usd * MICRO);
}

const finiteNonNegative = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && n >= 0;

// ---------------------------------------------------------------------------------------------- speech to text

/** Cost of `seconds` of audio on a Deepgram STT model; null when the model has no listed price or no length is known. */
export function sttCostMicro(model: string, seconds: number | null): number | null {
  const price = STT_USD_PER_MINUTE[model];
  if (!price || !finiteNonNegative(seconds)) return null;
  return usdToMicro((seconds / 60) * price.usd);
}

// ---------------------------------------------------------------------------------------------- text to speech

/** Cost of `chars` characters on a Deepgram TTS model; null when the voice's family has no listed price. */
export function ttsCostMicro(model: string, chars: number): number | null {
  if (!finiteNonNegative(chars)) return null;
  const price = TTS_USD_PER_1K_CHARS.find((p) => model.startsWith(p.prefix));
  if (!price) return null;
  return usdToMicro((chars / 1000) * price.usd);
}

// ---------------------------------------------------------------------------------------------------- text models

/** What an OpenRouter chat completion reports about itself (the fields this file reads; everything else is ignored). */
export type LlmUsage = {
  /** The model that actually answered (the fallback list means it may not be the first choice). */
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  /** usage.cost: what OpenRouter charged, in USD. */
  reportedCostUsd: number | null;
  /** usage.cost_details.upstream_inference_cost: what the model's own host charged (BYOK), in USD. */
  upstreamCostUsd: number | null;
  isByok: boolean;
};

/** Reads a chat-completion JSON body. Anything that is not the expected shape yields all-null, never a throw. */
export function parseLlmUsage(body: unknown): LlmUsage {
  const empty: LlmUsage = {
    model: null,
    inputTokens: null,
    outputTokens: null,
    reportedCostUsd: null,
    upstreamCostUsd: null,
    isByok: false,
  };
  if (!body || typeof body !== "object") return empty;
  const b = body as { model?: unknown; usage?: unknown };
  const model = typeof b.model === "string" && b.model.length > 0 ? b.model : null;
  const u = b.usage && typeof b.usage === "object" ? (b.usage as Record<string, unknown>) : null;
  if (!u) return { ...empty, model };
  const details =
    u.cost_details && typeof u.cost_details === "object"
      ? (u.cost_details as Record<string, unknown>)
      : null;
  const tokens = (v: unknown) => (finiteNonNegative(v) ? Math.round(v) : null);
  return {
    model,
    inputTokens: tokens(u.prompt_tokens),
    outputTokens: tokens(u.completion_tokens),
    reportedCostUsd: finiteNonNegative(u.cost) ? u.cost : null,
    upstreamCostUsd: finiteNonNegative(details?.upstream_inference_cost)
      ? (details?.upstream_inference_cost as number)
      : null,
    isByok: u.is_byok === true,
  };
}

/**
 * The cost of one chat completion. The provider's own number wins. With a BYOK key OpenRouter charges only its fee in
 * `cost` and reports the host's charge as `upstream_inference_cost`; the real spend is the two together. With no
 * reported number the model's list price times the reported tokens is used; with neither the cost is unknown.
 */
export function llmCostMicro(
  model: string,
  usage: Pick<
    LlmUsage,
    "inputTokens" | "outputTokens" | "reportedCostUsd" | "upstreamCostUsd" | "isByok"
  >,
): { micro: number | null; source: CostSource } {
  const reported = usage.reportedCostUsd;
  const upstream = usage.upstreamCostUsd;
  if (usage.isByok || upstream !== null) {
    if (reported !== null || upstream !== null) {
      return { micro: usdToMicro((reported ?? 0) + (upstream ?? 0)), source: "provider" };
    }
  } else if (reported !== null) {
    return { micro: usdToMicro(reported), source: "provider" };
  }
  const price = LLM_USD_PER_MILLION_TOKENS[model];
  if (price && usage.inputTokens !== null && usage.outputTokens !== null) {
    const usd = (usage.inputTokens * price.input + usage.outputTokens * price.output) / 1_000_000;
    return { micro: usdToMicro(usd), source: "table" };
  }
  return { micro: null, source: "unknown" };
}

// ----------------------------------------------------------------------------------------------------- the rows

type Who = { userId: string; kind: AiCostKind };

export function llmEntry(who: Who, requestedModel: string, body: unknown): AiCostEntry {
  const usage = parseLlmUsage(body);
  const model = usage.model ?? requestedModel;
  const { micro, source } = llmCostMicro(model, usage);
  return {
    ...who,
    vendor: "openrouter",
    model,
    sttSeconds: null,
    ttsChars: null,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    costMicroUsd: micro,
    costSource: source,
    cacheHit: false,
  };
}

export function sttEntry(
  who: { userId: string },
  model: string,
  providerSeconds: number | null,
): AiCostEntry {
  const micro = sttCostMicro(model, providerSeconds);
  return {
    userId: who.userId,
    kind: "stt",
    vendor: "deepgram",
    model,
    sttSeconds: providerSeconds,
    ttsChars: null,
    inputTokens: null,
    outputTokens: null,
    costMicroUsd: micro,
    costSource: micro === null ? "unknown" : "table",
    cacheHit: false,
  };
}

/** `chars` is what was sent to the vendor; a cache hit sent none, costs nothing, and is recorded as a hit. */
export function ttsEntry(
  who: { userId: string },
  model: string,
  chars: number,
  cacheHit: boolean,
): AiCostEntry {
  const micro = cacheHit ? 0 : ttsCostMicro(model, chars);
  return {
    userId: who.userId,
    kind: "tts",
    vendor: "deepgram",
    model,
    sttSeconds: null,
    ttsChars: cacheHit ? 0 : chars,
    inputTokens: null,
    outputTokens: null,
    costMicroUsd: micro,
    costSource: cacheHit ? "table" : micro === null ? "unknown" : "table",
    cacheHit,
  };
}

/** The database row for an entry (ai_cost_log, 20261118200000). */
export function toRow(e: AiCostEntry): Record<string, unknown> {
  return {
    user_id: e.userId,
    kind: e.kind,
    vendor: e.vendor,
    model: e.model.slice(0, 120),
    stt_seconds: e.sttSeconds,
    tts_chars: e.ttsChars,
    input_tokens: e.inputTokens,
    output_tokens: e.outputTokens,
    cost_micro_usd: e.costMicroUsd,
    cost_source: e.costSource,
    cache_hit: e.cacheHit,
  };
}
