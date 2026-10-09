import { applySafety, type LlmMessage } from "./ai-safety";

/**
 * The only place the web server talks to NVIDIA (ai-call-sites.test.ts enforces it). Every request gets
 * SAFETY_PREAMBLE through applySafety, so a caller cannot forget it. Returns the raw Response so each caller keeps
 * its own error handling (upstreamErrorResponse, null-on-failure, throw-for-authoring).
 */
export const NVIDIA_CHAT_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

export type NvidiaChatBody = { model: string; messages: LlmMessage[] } & Record<string, unknown>;

/**
 * The default chat model reasons before it answers unless told not to. Left on, a Practice reply took 17-88 s and
 * a capped call (Save word, generated practice) spent its whole token budget on reasoning, so its answer arrived
 * cut off or not at all. Measured with thinking off: about 1 s, same answers. Prompt-level switches ("/no_think")
 * do not turn it off for this model; only the chat template argument does. Applied here so no caller can forget it.
 * Both spellings are sent: model families read one or the other, and an unknown one is ignored. Merged into any
 * chat_template_kwargs a caller passes, so another template argument never silently turns reasoning back on.
 */
export const NVIDIA_NO_THINKING = { thinking: false, enable_thinking: false } as const;

/** The request body with reasoning turned off, keeping any template arguments the caller set. */
export function withNoThinking(body: NvidiaChatBody): NvidiaChatBody {
  const callerKwargs = (body.chat_template_kwargs ?? {}) as Record<string, unknown>;
  return { ...body, chat_template_kwargs: { ...NVIDIA_NO_THINKING, ...callerKwargs } };
}

export function nvidiaChatCompletion(args: {
  apiKey: string;
  body: NvidiaChatBody;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<Response> {
  const { apiKey, body, signal, fetchImpl = fetch } = args;
  return fetchImpl(NVIDIA_CHAT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ ...withNoThinking(body), messages: applySafety(body.messages) }),
    ...(signal ? { signal } : {}),
  });
}
