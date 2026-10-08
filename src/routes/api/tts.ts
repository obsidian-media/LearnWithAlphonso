import { createFileRoute } from "@tanstack/react-router";
import { upstreamErrorResponse } from "@/lib/api-response.server";
import { isCourse } from "@/data/courses";
import { deepgramVoiceForLanguage } from "@/lib/hector-conversation";

export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env.DEEPGRAM_API_KEY;
        if (!key) return Response.json({ error: "TTS is not configured" }, { status: 500 });
        const { authorizeAiRequest } = await import("@/lib/ai-consent.server");
        const access = await authorizeAiRequest(request, "tts", { route: "tts" });
        if (!access.ok) return access.response;
        let body: { text?: string; voice?: string; course?: string };
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        const text = (body.text ?? "").trim();
        if (!text) return Response.json({ error: "text required" }, { status: 400 });
        // Deepgram's TTS voice ids are full model ids (e.g. "aura-2-thalia-en"),
        // not short names like OpenAI's "alloy" — callers must pass a Deepgram
        // model id if overriding the default.
        // A conversation's course picks its native voice. An explicit `voice` still wins (podcast tooling); no
        // course keeps the English default every earlier client relies on.
        const model =
          body.voice ||
          (typeof body.course === "string" && isCourse(body.course)
            ? deepgramVoiceForLanguage(body.course)
            : "aura-2-thalia-en");
        const resp = await fetch(
          `https://api.deepgram.com/v1/speak?model=${encodeURIComponent(model)}&encoding=mp3&mip_opt_out=true`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Token ${key}`,
            },
            body: JSON.stringify({ text: text.slice(0, 2000) }),
          },
        );
        if (!resp.ok) {
          const t = await resp.text().catch(() => "");
          return upstreamErrorResponse("Deepgram TTS", resp.status, t);
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
