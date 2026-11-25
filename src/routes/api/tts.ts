import { noStoreJson } from "@/lib/api-json";
import { createFileRoute } from "@tanstack/react-router";
import { upstreamErrorResponse } from "@/lib/api-response.server";
import { resolveTtsVoice } from "@/lib/voice-catalog";
import { timedRoute } from "@/lib/stage-timer.server";

/**
 * The most text one request may speak. A tutor turn is a few sentences, so this is generous for real use and bounds
 * what a single (or scripted) call can cost. Over the cap the request is refused, not shortened: a half-spoken reply
 * would be worse than a clear error, and the client already treats a failed speech request as "no voice this turn".
 */
export const TTS_MAX_CHARS = 600;

/** The longest Hector reply /api/hector-respond sends (it refuses longer ones), so the most a turn token can speak. */
export const HECTOR_TURN_MAX_CHARS = 2_000;

/** Speech for the capped text streams in a few seconds. */
const TTS_TIMEOUT_MS = 30_000;

export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      POST: ({ request }) =>
        timedRoute("tts", async (timer) => {
          const key = process.env.DEEPGRAM_API_KEY;
          if (!key) return noStoreJson({ error: "TTS is not configured" }, { status: 500 });
          const { authorizeAiRequest } = await import("@/lib/ai-consent.server");
          // A Hector turn token (web, from /api/hector-respond) speaks that one reply without a second quota unit: the
          // turn already spent Hector's allowance. Auth, the AI switch and consent still run; only the charge is skipped.
          const turnToken = new URL(request.url).searchParams.get("turn");
          const access = await timer.time("auth", () =>
            authorizeAiRequest(request, "tts", {
              route: "tts",
              ...(turnToken !== null ? { deferQuota: true } : {}),
            }),
          );
          if (!access.ok) return access.response;
          let body: { text?: string; voice?: string; course?: string; character?: string };
          try {
            body = await request.json();
          } catch {
            return noStoreJson({ error: "Invalid JSON" }, { status: 400 });
          }
          const text = (body.text ?? "").trim();
          if (!text) return noStoreJson({ error: "text required" }, { status: 400 });
          // What is spoken: the whole text, or for a turn token one part of the reply the token vouches for.
          let spoken = text;
          if (turnToken !== null) {
            if (text.length > HECTOR_TURN_MAX_CHARS)
              return noStoreJson({ error: "text-too-long" }, { status: 413 });
            const { verifyHectorTurnToken } = await import("@/lib/hector-turn-token.server");
            if (!verifyHectorTurnToken(turnToken, access.userId, text))
              return noStoreJson({ error: "turn-invalid" }, { status: 403 });
            const { splitReplyForSpeech } = await import("@/lib/speech-chunks");
            const parts = splitReplyForSpeech(text);
            const part = Number(new URL(request.url).searchParams.get("part") ?? 0);
            if (!Number.isInteger(part) || part < 0 || part >= parts.length)
              return noStoreJson({ error: "part-invalid" }, { status: 400 });
            spoken = parts[part]!;
          } else {
            if (text.length > TTS_MAX_CHARS)
              return noStoreJson(
                { error: "text-too-long", maxChars: TTS_MAX_CHARS },
                { status: 413 },
              );
          }
          // The learner's chosen voice (Settings > Voices) arrives as `voice`; it is used only when it is on the
          // allow-list for the conversation's course (src/lib/voice-catalog.ts). Anything else, including an arbitrary
          // Deepgram model id, falls back to the character's default, so a client cannot pick a pricier model.
          const model = resolveTtsVoice(body);
          // One of our own fixed lines (a scene opener, a name-less Hector greeting) is kept per voice and served from
          // our own store for every learner; anything else, above all a model reply, is never stored.
          // src/lib/tts-cache.ts says exactly which lines; a hit still spends the learner's quota unit (above), it
          // only stops the vendor being paid again.
          const { isCacheableSpokenLine, ttsCacheKey } = await import("@/lib/tts-cache");
          const cacheKey =
            turnToken === null && isCacheableSpokenLine(spoken)
              ? await ttsCacheKey(model, spoken)
              : null;
          const { recordAiCost, scheduleBackground } = await import("@/lib/ai-cost-log.server");
          const { ttsEntry } = await import("@/lib/ai-cost");
          if (cacheKey) {
            const { readCachedSpeech } = await import("@/lib/tts-cache.server");
            const hit = await timer.time("cache", () => readCachedSpeech(cacheKey));
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
            resp = await timer.time("deepgram", () =>
              fetch(
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
              ),
            );
          } catch {
            return noStoreJson({ error: "speech-unavailable" }, { status: 504 });
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
        }),
    },
  },
});
