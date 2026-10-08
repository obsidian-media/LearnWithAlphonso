// Edge twin of src/lib/nvidia-chat.server.ts: the only place an edge function talks to NVIDIA
// (src/lib/ai-call-sites.test.ts), and it always applies SAFETY_PREAMBLE.
import { applySafety, type LlmMessage } from "./ai-safety.ts";

export const NVIDIA_CHAT_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

export function nvidiaChatCompletion(args: {
  apiKey: string;
  body: { model: string; messages: LlmMessage[] } & Record<string, unknown>;
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
