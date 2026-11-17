import { createFileRoute } from "@tanstack/react-router";
import { upstreamErrorResponse } from "@/lib/api-response.server";
import { resolveTtsVoice } from "@/lib/voice-catalog";

/**
 * The most text one request may speak. A tutor turn is a few sentences, so this is generous for real use and bounds
 * what a single (or scripted) call can cost. Over the cap the request is refused, not shortened: a half-spoken reply
 * would be worse than a clear error, and the client already treats a failed speech request as "no voice this turn".
 */
export const TTS_MAX_CHARS = 600;

/** Speech for the capped text streams in a few seconds. */
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
        if (text.length > TTS_MAX_CHARS)
          return Response.json(
            { error: "text-too-long", maxChars: TTS_MAX_CHARS },
            { status: 413 },
          );
        // The learner's chosen voice (Settings > Voices) arrives as `voice`; it is used only when it is on the
        // allow-list for the conversation's course (src/lib/voice-catalog.ts). Anything else, including an arbitrary
        // Deepgram model id, falls back to the character's default, so a client cannot pick a pricier model.
        const model = resolveTtsVoice(body);
        // One of our own fixed lines (a scene opener, a name-less Hector greeting) is kept per voice and served from
        // our own store for every learner; anything else, above all a model reply, is never stored.
        // src/lib/tts-cache.ts says exactly which lines; a hit still spends the learner's quota unit (above), it
        // only stops the vendor being paid again.
        const spoken = text;
        const { isCacheableSpokenLine, ttsCacheKey } = await import("@/lib/tts-cache");
        const cacheKey = isCacheableSpokenLine(spoken) ? await ttsCacheKey(model, spoken) : null;
        const { recordAiCost, scheduleBackground } = await import("@/lib/ai-cost-log.server");
        const { ttsEntry } = await import("@/lib/ai-cost");
        if (cacheKey) {
          const { readCachedSpeech } = await import("@/lib/tts-cache.server");
          const hit = await readCachedSpeech(cacheKey);
          if (hit) {
            scheduleBackground(
              recordAiCost(ttsEntry({ userId: access.userId }, model, spoken.length, true)),
            );
            return new Response(hit as BodyInit, {
              headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
            });
          }
        }
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
              body: JSON.stringify({ text: spoken }),
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
        // Deepgram bills the characters it was sent, once the request is accepted.
        scheduleBackground(
          recordAiCost(ttsEntry({ userId: access.userId }, model, spoken.length, false)),
        );
        if (cacheKey) {
          // A line we keep is read whole (it is a few seconds of audio), answered, and stored off the answer's path.
          const audio = new Uint8Array(await resp.arrayBuffer());
          const { writeCachedSpeech } = await import("@/lib/tts-cache.server");
          scheduleBackground(writeCachedSpeech(cacheKey, audio));
          return new Response(audio as BodyInit, {
            headers: {
              "Content-Type": resp.headers.get("Content-Type") || "audio/mpeg",
              "Cache-Control": "no-store",
            },
          });
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
