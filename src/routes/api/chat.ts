import { createFileRoute } from "@tanstack/react-router";
import { upstreamErrorResponse } from "@/lib/api-response.server";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

const CEFR_DIFFICULTY_HINTS: Record<string, string> = {
  A1: "The learner's level is CEFR A1 (beginner). Use very simple, common vocabulary and short sentences (roughly 5-10 words). Avoid idioms, phrasal verbs, and complex tenses.",
  A2: "The learner's level is CEFR A2 (elementary). Use simple vocabulary and short, clear sentences. Avoid idioms and rare phrasal verbs; keep tenses mostly present/simple past.",
  B1: "The learner's level is CEFR B1 (intermediate). Use everyday vocabulary and moderately complex sentences. Common idioms are fine if used naturally.",
  B2: "The learner's level is CEFR B2 (upper-intermediate). Use natural, varied vocabulary and sentence structure, similar to talking with a competent English speaker.",
  C1: "The learner's level is CEFR C1 (advanced). Use natural, idiomatic English with varied sentence structure -- don't simplify for them.",
};

/**
 * V3 package 3a: this is a prompt-shaping hint, not a trust boundary --
 * there's no exploit value in a client claiming a level it doesn't have
 * (worst case, the conversation partner is too easy or too hard for
 * them), so this is trusted client input, same as `systemPrompt` itself
 * already was. Appended after the scenario's own systemPrompt so it
 * doesn't override the scenario's persona/character instructions.
 */
function withDifficultyHint(systemPrompt: string, cefrLevel?: string): string {
  const hint = cefrLevel ? CEFR_DIFFICULTY_HINTS[cefrLevel] : undefined;
  return hint ? `${systemPrompt}\n\n${hint}` : systemPrompt;
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env.NVIDIA_API_KEY;
        if (!key) return Response.json({ error: "Chat is not configured" }, { status: 500 });
        const { consumeQuota } = await import("@/lib/ai-quota.server");
        const quota = await consumeQuota(request, "chat");
        if (!quota.ok) return Response.json({ error: quota.message }, { status: quota.status });
        let body: { messages?: ChatMessage[]; systemPrompt?: string; cefrLevel?: string };
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        const messages = Array.isArray(body.messages) ? body.messages : [];
        if (messages.length === 0)
          return Response.json({ error: "messages required" }, { status: 400 });
        const finalMessages: ChatMessage[] = body.systemPrompt
          ? [
              { role: "system", content: withDifficultyHint(body.systemPrompt, body.cefrLevel) },
              ...messages,
            ]
          : messages;

        // NVIDIA NIM's hosted inference API (integrate.api.nvidia.com) is
        // OpenAI-compatible, so only the URL/key/model name change from the
        // Lovable Gateway. Model id is env-configurable — NVIDIA's catalog
        // shifts (e.g. the Nemotron-70B chat NIM was deprecated on
        // build.nvidia.com) — verify the default below is still live at
        // https://build.nvidia.com before relying on it, adjust via
        // NVIDIA_CHAT_MODEL if not.
        const model = process.env.NVIDIA_CHAT_MODEL || "meta/llama-3.1-70b-instruct";
        const resp = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model,
            messages: finalMessages,
          }),
        });
        if (!resp.ok) {
          const text = await resp.text().catch(() => "");
          return upstreamErrorResponse("NVIDIA", resp.status, text);
        }
        const data = (await resp.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        const content = data.choices?.[0]?.message?.content ?? "";
        return Response.json({ content });
      },
    },
  },
});
