import { createFileRoute } from "@tanstack/react-router";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env.GEMINI_API_KEY;
        if (!key) return new Response("Missing GEMINI_API_KEY", { status: 500 });
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

        // Gemini's OpenAI-compatible endpoint accepts the same request/response
        // shape the Lovable Gateway used, so only the URL/key/model name change.
        const resp = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${key}`,
            },
            body: JSON.stringify({
              model: "gemini-3.6-flash",
              messages: finalMessages,
            }),
          },
        );
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
