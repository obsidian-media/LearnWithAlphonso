import { applySafety, type LlmMessage } from "./ai-safety";
import { resolveLlmChatModels, resolveLlmProviders } from "./llm-chat-model.server";

/**
 * The only place the web server talks to the AI text provider, OpenRouter (ai-call-sites.test.ts enforces it).
 * Every request gets SAFETY_PREAMBLE through applySafety, so a caller cannot forget it. Returns a Response so each
 * caller keeps its own error handling (upstreamErrorResponse, null-on-failure, throw-for-authoring);
 * normalizeLlmResponse first maps OpenRouter's extra failure shapes onto statuses those callers already handle.
 * The edge functions have a twin in supabase/functions/_shared/llm-chat.ts.
 */
export const LLM_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

export type LlmChatBody = { model: string; messages: LlmMessage[] } & Record<string, unknown>;

/**
 * Reasoning stays off on every call. With it on (NVIDIA, until 2026-10-09) a Practice reply took 17-88 s and a
 * capped call (Save word, generated practice) spent its whole token budget thinking, so the answer arrived cut off
 * or not at all. scripts/benchmark-llm.ts measures the reasoning tokens a model actually spends.
 */
export const LLM_NO_REASONING = { effort: "none" } as const;

/**
 * Never route learner text to a host that keeps it for training. Set here so no caller can loosen it; `only` (the
 * host allowlist, LLM_PROVIDERS) is added per request.
 */
export const LLM_PROVIDER_PREFS = { data_collection: "deny" } as const;

/** The deadline for a model call whose caller sets none. A normal reply takes about a second. */
export const LLM_DEFAULT_TIMEOUT_MS = 30_000;

/** For owner-run authoring calls, which ask for a whole pack or word list in one reply. */
export const LLM_AUTHORING_TIMEOUT_MS = 120_000;

const jsonHeaders = { "content-type": "application/json" };

/**
 * OpenRouter fails in two shapes the callers did not know: 401/402/403 when the account or a provider key is
 * unusable (revoked key, no credit), and a 200 whose body is an error with no choices. The first becomes 503
 * (a 401 passed through would look like the learner's own session expiring), the second 502. Both are logged.
 */
export async function normalizeLlmResponse(res: Response): Promise<Response> {
  if (res.status === 401 || res.status === 402 || res.status === 403) {
    const text = await res.text();
    console.error(`[llm] provider unavailable (${res.status}): ${text.slice(0, 500)}`);
    return new Response(text, { status: 503, headers: jsonHeaders });
  }
  if (res.status === 200 && (res.headers.get("content-type") ?? "").includes("application/json")) {
    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return new Response(text, { status: 200, headers: jsonHeaders });
    }
    const obj = parsed as { error?: unknown; choices?: unknown } | null;
    if (obj && typeof obj === "object" && obj.error && !Array.isArray(obj.choices)) {
      console.error(`[llm] provider error inside a 200: ${text.slice(0, 500)}`);
      return new Response(text, { status: 502, headers: jsonHeaders });
    }
    return new Response(text, { status: 200, headers: jsonHeaders });
  }
  return res;
}

export async function llmChatCompletion(args: {
  apiKey: string;
  body: LlmChatBody;
  /** The ordered fallback list; defaults to LLM_CHAT_MODELS. The body's own model always goes first. */
  models?: string[];
  /** The hosts OpenRouter may use; defaults to LLM_PROVIDERS. */
  providers?: string[];
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<Response> {
  const { apiKey, body, signal, fetchImpl = fetch } = args;
  const { model, ...rest } = body;
  const models = [...new Set([model, ...(args.models ?? resolveLlmChatModels())].filter(Boolean))];
  const res = await fetchImpl(LLM_CHAT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      ...rest,
      models,
      reasoning: LLM_NO_REASONING,
      provider: { ...LLM_PROVIDER_PREFS, only: args.providers ?? resolveLlmProviders() },
      messages: applySafety(body.messages),
    }),
    // No call may wait on the provider without a limit: a caller that sets no deadline gets this one.
    signal: signal ?? AbortSignal.timeout(LLM_DEFAULT_TIMEOUT_MS),
  });
  return normalizeLlmResponse(res);
}
