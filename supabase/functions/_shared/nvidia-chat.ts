// Edge twin of src/lib/nvidia-chat.server.ts: the only place an edge function talks to NVIDIA
// (src/lib/ai-call-sites.test.ts), and it always applies SAFETY_PREAMBLE.
import { applySafety, type LlmMessage } from "./ai-safety.ts";

export const NVIDIA_CHAT_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

// Same as the web twin: the default model reasons before answering unless the chat template argument turns it off,
// which made calls slow and let a capped call spend its whole budget on reasoning. Kept identical to
// src/lib/nvidia-chat.server.ts's NVIDIA_NO_THINKING (src/lib/nvidia-no-thinking.test.ts checks both).
export const NVIDIA_NO_THINKING = { thinking: false, enable_thinking: false } as const;

type NvidiaChatBody = { model: string; messages: LlmMessage[] } & Record<string, unknown>;

/** The request body with reasoning turned off, keeping any template arguments the caller set. */
export function withNoThinking(body: NvidiaChatBody): NvidiaChatBody {
  const callerKwargs = (body.chat_template_kwargs ?? {}) as Record<string, unknown>;
  return { ...body, chat_template_kwargs: { ...NVIDIA_NO_THINKING, ...callerKwargs } };
}

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
    body: JSON.stringify({ ...withNoThinking(body), messages: applySafety(body.messages) }),
    ...(signal ? { signal } : {}),
  });
}
