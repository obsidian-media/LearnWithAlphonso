import { createFileRoute } from "@tanstack/react-router";
import { upstreamErrorResponse } from "@/lib/api-response.server";
import { resolveTtsVoice } from "@/lib/voice-catalog";

/** Speech for the 2,000-character cap streams in a few seconds. */
const TTS_TIMEOUT_MS = 30_000;

export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env.DEEPGRAM_API_KEY;
        if (!key) return Response.json({ error: "TTS is not configured" }, { status: 500 });
        const { authorizeAiRequest } = await import("@/lib/ai-consent.server");
        const access = await authorizeAiRequest(request, "tts", { route: "tts" });
        if (!access.ok) return access.response;
        let body: { text?: string; voice?: string; course?: string; character?: string };
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        const text = (body.text ?? "").trim();
        if (!text) return Response.json({ error: "text required" }, { status: 400 });
        // The learner's chosen voice (Settings > Voices) arrives as `voice`; it is used only when it is on the
        // allow-list for the conversation's course (src/lib/voice-catalog.ts). Anything else, including an arbitrary
        // Deepgram model id, falls back to the character's default, so a client cannot pick a pricier model.
        const model = resolveTtsVoice(body);
        let resp: Response;
        try {
          resp = await fetch(
            `https://api.deepgram.com/v1/speak?model=${encodeURIComponent(model)}&encoding=mp3&mip_opt_out=true`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Token ${key}`,
              },
              body: JSON.stringify({ text: text.slice(0, 2000) }),
              // Covers the audio stream too: the body is piped to the client below.
              signal: AbortSignal.any([request.signal, AbortSignal.timeout(TTS_TIMEOUT_MS)]),
            },
          );
        } catch {
          return Response.json({ error: "speech-unavailable" }, { status: 504 });
        }
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
