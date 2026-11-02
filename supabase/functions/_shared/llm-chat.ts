// Edge twin of src/lib/llm-chat.server.ts: the only place an edge function talks to the AI text provider,
// OpenRouter (src/lib/ai-call-sites.test.ts), and it always applies SAFETY_PREAMBLE. The constants below are kept
// identical to the web twin's (src/lib/llm-no-reasoning.test.ts checks them).
import { applySafety, type LlmMessage } from "./ai-safety.ts";

export const LLM_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

// Reasoning stays off on every call: with it on, replies were slow and capped calls spent their budget thinking.
export const LLM_NO_REASONING = { effort: "none" } as const;

// Never route learner text to a host that keeps it for training.
export const LLM_PROVIDER_PREFS = { data_collection: "deny" } as const;

// Hand-kept mirror of src/lib/llm-chat-model.server.ts's LLM_CHAT_MODELS_DEFAULT (edge functions cannot import
// from src/). Override with the LLM_CHAT_MODELS secret: ordered, comma-separated OpenRouter ids.
export const LLM_CHAT_MODELS_DEFAULT: readonly string[] = ["anthropic/claude-haiku-5.5"];

export function parseLlmChatModels(raw: string | undefined): string[] {
  const models = (raw ?? "").split(",").map((m) => m.trim()).filter(Boolean);
  return models.length > 0 ? models : [...LLM_CHAT_MODELS_DEFAULT];
}

export function resolveLlmChatModels(): string[] {
  let raw: string | undefined;
  try {
    raw = Deno.env.get("LLM_CHAT_MODELS");
  } catch {
    // No env permission (unit tests run without --allow-env): the default list.
  }
  return parseLlmChatModels(raw);
}

export function resolveLlmChatModel(): string {
  return resolveLlmChatModels()[0];
}

/** The OpenRouter key (a function secret); undefined means AI is not configured. */
export function resolveLlmApiKey(): string | undefined {
  try {
    return Deno.env.get("OPENROUTER_API_KEY") || undefined;
  } catch {
    return undefined;
  }
}

/** The deadline for a model call whose caller sets none. A normal reply takes about a second. */
export const LLM_DEFAULT_TIMEOUT_MS = 30_000;

type LlmChatBody = { model: string; messages: LlmMessage[] } & Record<string, unknown>;

const jsonHeaders = { "content-type": "application/json" };

// Same mapping as the web twin: 401/402/403 (unusable account or provider key) becomes 503, a 200 that carries an
// error and no choices becomes 502. Both are logged.
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
  models?: string[];
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
      provider: LLM_PROVIDER_PREFS,
      messages: applySafety(body.messages),
    }),
    // No call may wait on the provider without a limit: a caller that sets no deadline gets this one.
    signal: signal ?? AbortSignal.timeout(LLM_DEFAULT_TIMEOUT_MS),
  });
  return normalizeLlmResponse(res);
}
