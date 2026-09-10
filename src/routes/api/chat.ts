import { createFileRoute } from "@tanstack/react-router";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env.NVIDIA_API_KEY;
        if (!key) return new Response("Missing NVIDIA_API_KEY", { status: 500 });
        const { consumeQuota } = await import("@/lib/ai-quota.server");
        const quota = await consumeQuota(request, "chat");
        if (!quota.ok) return new Response(quota.message, { status: quota.status });
        let body: { messages?: ChatMessage[]; systemPrompt?: string };
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        const messages = Array.isArray(body.messages) ? body.messages : [];
        if (messages.length === 0) return new Response("messages required", { status: 400 });
        const finalMessages: ChatMessage[] = body.systemPrompt
          ? [{ role: "system", content: body.systemPrompt }, ...messages]
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
          return new Response(text || "Chat failed", { status: resp.status });
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
