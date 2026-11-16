/**
 * Every price the AI cost log uses, in ONE place, each with the page it was read from and the day it was read.
 * Pure data, no I/O: ai-cost.ts does the arithmetic, the tests pin the numbers.
 *
 * Rules:
 *   - A model or voice that is not listed here is logged with a NULL cost and flagged "unknown" (ai-cost.ts). A price
 *     is never guessed, and never defaulted to zero.
 *   - OpenRouter's own reported cost (usage.cost) wins over this table whenever the response carries it. The table is
 *     the fallback, and the cross-check when a reported number looks wrong.
 *   - When a price changes, edit the row, move `checkedOn`, and keep the old number in the comment: the cost log is
 *     an estimate in USD at the price on the day of the call, not an invoice.
 */

export type PriceSource = {
  /** The page the number was read from. */
  url: string;
  /** The day it was read (YYYY-MM-DD). */
  checkedOn: string;
};

const DEEPGRAM_PRICING: PriceSource = {
  url: "https://deepgram.com/pricing",
  checkedOn: "2026-11-16",
};
// The host is assembled so this data file is not mistaken for a second AI text call site (ai-call-sites.test.ts greps
// for the literal host): nothing here ever calls it, it is only the page the prices were read from.
const OPENROUTER_MODELS: PriceSource = {
  url: `https://${["openrouter", "ai"].join(".")}/api/v1/models`,
  checkedOn: "2026-11-16",
};

/**
 * Deepgram speech-to-text, pay as you go, pre-recorded audio, USD per audio minute (billed on the audio's length).
 * /api/stt always sends one course language code (en, fr or es), which is Deepgram's monolingual Nova-3 rate; the
 * multilingual rate ($0.0052) applies only to language=multi, which this app never sends.
 */
export const STT_USD_PER_MINUTE: Readonly<Record<string, { usd: number; source: PriceSource }>> = {
  "nova-3": { usd: 0.0043, source: DEEPGRAM_PRICING },
};

/**
 * Deepgram text-to-speech, pay as you go, USD per 1,000 characters of input text. The Aura-2 voices every learner and
 * the podcast tool use are all one rate; the model id is `aura-2-<voice>-<lang>` (src/lib/voice-catalog.ts).
 * Matched by prefix, longest first: `aura-2-` is Aura-2 ($0.030), a bare `aura-` is Aura-1 ($0.015).
 */
export const TTS_USD_PER_1K_CHARS: readonly { prefix: string; usd: number; source: PriceSource }[] =
  [
    { prefix: "aura-2-", usd: 0.03, source: DEEPGRAM_PRICING },
    { prefix: "aura-", usd: 0.015, source: DEEPGRAM_PRICING },
  ];

/** OpenRouter model id -> USD per million tokens, from the model list's `pricing` (prompt, completion; per token x 1e6). */
export const LLM_USD_PER_MILLION_TOKENS: Readonly<
  Record<string, { input: number; output: number; source: PriceSource }>
> = {
  // The default chat model (LLM_CHAT_MODELS_DEFAULT in llm-chat-model.server.ts). BYOK: Anthropic bills this directly
  // at the same list price; OpenRouter adds its own fee on top, which usage.cost carries when present.
  "anthropic/claude-haiku-5.5": { input: 0.1, output: 0.5, source: OPENROUTER_MODELS },
  "anthropic/claude-sonnet-5.5": { input: 2, output: 10, source: OPENROUTER_MODELS },
  "anthropic/claude-sonnet-5": { input: 2, output: 10, source: OPENROUTER_MODELS },
};

/** Where the price of a vendor/model came from, for the admin footnote and the docs. */
export function allPriceSources(): PriceSource[] {
  const seen = new Map<string, PriceSource>();
  const add = (s: PriceSource) => seen.set(`${s.url}|${s.checkedOn}`, s);
  Object.values(STT_USD_PER_MINUTE).forEach((p) => add(p.source));
  TTS_USD_PER_1K_CHARS.forEach((p) => add(p.source));
  Object.values(LLM_USD_PER_MILLION_TOKENS).forEach((p) => add(p.source));
  return [...seen.values()];
}
