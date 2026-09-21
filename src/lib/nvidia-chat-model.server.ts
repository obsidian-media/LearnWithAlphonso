/**
 * The one place this app's default NVIDIA NIM chat model lives. Every AI
 * feature (conversation chat, weakness detection, generated practice)
 * used to hardcode this default independently in four different files --
 * when NVIDIA retired `meta/llama-3.1-70b-instruct` on 2026-08-26 (a 410
 * Gone from every call site simultaneously, confirmed via Vercel's
 * runtime error log), it silently broke all three features at once,
 * surfacing to users as a generic "failed to fetch"-style error with no
 * indication the model itself was the problem. Centralizing here means
 * the next catalog shift is a one-line fix instead of a four-file hunt,
 * and NVIDIA_CHAT_MODEL still overrides this with no redeploy needed --
 * verify this default is still live at https://build.nvidia.com before
 * relying on it.
 */
export const NVIDIA_CHAT_MODEL_DEFAULT = "nvidia/nemotron-3.5-lightning-30b-a3b";

export function resolveNvidiaChatModel(): string {
  return process.env.NVIDIA_CHAT_MODEL || NVIDIA_CHAT_MODEL_DEFAULT;
}
