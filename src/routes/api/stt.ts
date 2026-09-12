import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/stt")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env.DEEPGRAM_API_KEY;
        if (!key) return new Response("Missing DEEPGRAM_API_KEY", { status: 500 });
        const { consumeQuota } = await import("@/lib/ai-quota.server");
        const quota = await consumeQuota(request, "stt");
        if (!quota.ok) return new Response(quota.message, { status: quota.status });
        const inForm = await request.formData().catch(() => null);
        const file = inForm?.get("file");
        if (!(file instanceof Blob) || file.size < 512) {
          return new Response("Empty or missing audio", { status: 400 });
        }
        // Deepgram's pre-recorded /v1/listen endpoint takes the raw audio
        // bytes as the request body with Content-Type set to the audio's
        // actual mime type — it detects webm/mp4/wav/etc. from that header,
        // no multipart wrapper or transcoding needed.
        const resp = await fetch(
          "https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true",
          {
            method: "POST",
            headers: {
              Authorization: `Token ${key}`,
              "Content-Type": file.type || "audio/webm",
            },
            body: file,
          },
        );
        if (!resp.ok) {
          const t = await resp.text().catch(() => "");
          return new Response(t || "STT failed", { status: resp.status });
        }
        const data = (await resp.json()) as {
          results?: { channels?: { alternatives?: { transcript?: string }[] }[] };
        };
        const text = data.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
        return Response.json({ text });
      },
    },
  },
});
