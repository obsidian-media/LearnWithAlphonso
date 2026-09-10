import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/stt")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env.OPENAI_API_KEY;
        if (!key) return new Response("Missing OPENAI_API_KEY", { status: 500 });
        const { consumeQuota } = await import("@/lib/ai-quota.server");
        const quota = await consumeQuota(request, "stt");
        if (!quota.ok) return new Response(quota.message, { status: quota.status });
        const inForm = await request.formData().catch(() => null);
        const file = inForm?.get("file");
        if (!(file instanceof Blob) || file.size < 512) {
          return new Response("Empty or missing audio", { status: 400 });
        }
        const name = (file as File).name || "recording.webm";
        const out = new FormData();
        out.append("model", "gpt-4o-mini-transcribe");
        out.append("file", file, name);
        const resp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}` },
          body: out,
        });
        if (!resp.ok) {
          const t = await resp.text().catch(() => "");
          return new Response(t || "STT failed", { status: resp.status });
        }
        const data = (await resp.json()) as { text?: string };
        return Response.json({ text: data.text ?? "" });
      },
    },
  },
});
