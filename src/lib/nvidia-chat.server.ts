import { applySafety, type LlmMessage } from "./ai-safety";

/**
 * The only place the web server talks to NVIDIA (ai-call-sites.test.ts enforces it). Every request gets
 * SAFETY_PREAMBLE through applySafety, so a caller cannot forget it. Returns the raw Response so each caller keeps
 * its own error handling (upstreamErrorResponse, null-on-failure, throw-for-authoring).
 */
export const NVIDIA_CHAT_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

export type NvidiaChatBody = { model: string; messages: LlmMessage[] } & Record<string, unknown>;

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
    body: JSON.stringify({ ...body, messages: applySafety(body.messages) }),
    ...(signal ? { signal } : {}),
  });
}
