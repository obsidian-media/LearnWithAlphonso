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
 */
export const NVIDIA_NO_THINKING = { chat_template_kwargs: { thinking: false } } as const;

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
    body: JSON.stringify({ ...NVIDIA_NO_THINKING, ...body, messages: applySafety(body.messages) }),
    ...(signal ? { signal } : {}),
  });
}
