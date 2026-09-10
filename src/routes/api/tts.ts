import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env.OPENAI_API_KEY;
        if (!key) return new Response("Missing OPENAI_API_KEY", { status: 500 });
        const { consumeQuota } = await import("@/lib/ai-quota.server");
        const quota = await consumeQuota(request, "tts");
        if (!quota.ok) return new Response(quota.message, { status: quota.status });
        let body: { text?: string; voice?: string };
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        const text = (body.text ?? "").trim();
        if (!text) return new Response("text required", { status: 400 });
        const resp = await fetch("https://api.openai.com/v1/audio/speech", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini-tts",
            input: text.slice(0, 2000),
            voice: body.voice || "alloy",
            response_format: "mp3",
          }),
        });
        if (!resp.ok) {
          const t = await resp.text().catch(() => "");
          return new Response(t || "TTS failed", { status: resp.status });
        }
        return new Response(resp.body, {
          headers: {
            "Content-Type": resp.headers.get("Content-Type") || "audio/mpeg",
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
