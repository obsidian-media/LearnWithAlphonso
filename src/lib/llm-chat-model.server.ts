/**
 * The one place this app's AI text models are chosen. OpenRouter tries them in order and falls back to the next on
 * any error (rate limit, outage), so a fallback is a configuration change, not a code change.
 *
 * Why it is central: when NVIDIA retired `meta/llama-3.1-70b-instruct` on 2026-08-26, four hardcoded copies broke
 * every AI feature at once. The edge functions cannot import from src/, so supabase/functions/_shared/llm-chat.ts
 * mirrors LLM_CHAT_MODELS_DEFAULT by hand (src/lib/llm-no-reasoning.test.ts keeps the two equal).
 *
 * Override in env with LLM_CHAT_MODELS (ordered, comma-separated OpenRouter ids). Every provider you list must be
 * named in the privacy policy. After any change, re-run scripts/benchmark-llm.ts and scripts/smoke-llm-features.ts:
 * a model that keeps reasoning is slow and starves capped calls.
 */
export const LLM_CHAT_MODELS_DEFAULT: readonly string[] = ["anthropic/claude-haiku-5.5"];

/** An ordered model list from a comma-separated value; empty or missing means the default. */
export function parseLlmChatModels(raw: string | undefined): string[] {
  const models = (raw ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return models.length > 0 ? models : [...LLM_CHAT_MODELS_DEFAULT];
}

export function resolveLlmChatModels(): string[] {
  return parseLlmChatModels(process.env.LLM_CHAT_MODELS);
}

/**
 * The hosts OpenRouter may send learner text to (its `provider.only`), whichever model in the list answers.
 * Without it, an Anthropic model can also be served by Google Vertex, Amazon Bedrock or Azure, none of which the
 * privacy policy names, and a failing BYOK key would fall back to them on OpenRouter credit. Override with
 * LLM_PROVIDERS (comma-separated OpenRouter provider slugs). Every host listed must have its own processor entry
 * in the privacy policy (legal-pages.test.tsx checks the default).
 */
export const LLM_PROVIDERS_DEFAULT: readonly string[] = ["anthropic"];

export function parseLlmProviders(raw: string | undefined): string[] {
  const hosts = (raw ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return hosts.length > 0 ? hosts : [...LLM_PROVIDERS_DEFAULT];
}

export function resolveLlmProviders(): string[] {
  return parseLlmProviders(process.env.LLM_PROVIDERS);
}

/** The OpenRouter key every AI text caller uses; undefined means AI is not configured in this environment. */
export function resolveLlmApiKey(): string | undefined {
  return process.env.OPENROUTER_API_KEY || undefined;
}

/** The first choice, for callers that name a model in their request body and for logs. */
export function resolveLlmChatModel(): string {
  return resolveLlmChatModels()[0];
}
