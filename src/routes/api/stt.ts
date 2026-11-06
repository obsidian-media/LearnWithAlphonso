import { createFileRoute } from "@tanstack/react-router";
import { upstreamErrorResponse } from "@/lib/api-response.server";
import { isCourse } from "@/data/courses";
import { headerDurationSeconds } from "@/lib/audio-duration";

/** A spoken answer is a few seconds of audio; transcription normally returns in about a second. */
const STT_TIMEOUT_MS = 20_000;
/**
 * The provider bills per audio minute and the daily quota counts calls, so each call needs a ceiling. 1 MB is about
 * 80 s of the apps' own recordings (Android AAC at 96 kbps, the highest bitrate any client sends); a spoken answer or a
 * tutor turn is seconds. Low-bitrate audio fits far more into 1 MB, so the seconds themselves are also limited:
 * a daily voice-time budget and a per-call maximum (src/lib/stt-audio-budget.server.ts).
 */
export const MAX_STT_BYTES = 1_000_000;

export const Route = createFileRoute("/api/stt")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env.DEEPGRAM_API_KEY;
        if (!key) return Response.json({ error: "STT is not configured" }, { status: 500 });
        const { authorizeAiRequest } = await import("@/lib/ai-consent.server");
        const access = await authorizeAiRequest(request, "stt", { route: "stt" });
        if (!access.ok) return access.response;
        const budget = await import("@/lib/stt-audio-budget.server");
        const inForm = await request.formData().catch(() => null);
        const file = inForm?.get("file");
        if (!(file instanceof Blob) || file.size < 512) {
          return Response.json({ error: "Empty or missing audio" }, { status: 400 });
        }
        if (file.size > MAX_STT_BYTES) {
          return Response.json({ error: "audio-too-long" }, { status: 413 });
        }
        // Deepgram's course->language codes are identical to this repo's own
        // course codes ("en"/"fr"/"es"), so no separate mapping table is
        // needed -- just validate the caller's claim rather than trust it
        // blind. Defaults to "en" for a caller that sends none (the
        // conversation route today -- see use-speech-capture.ts), which
        // matches the behaviour this endpoint already had before this
        // parameter existed, so that caller needs no change.
        //
        // Without this, every course's audio was transcribed as English:
        // Deepgram's own docs say every model defaults to language=en when
        // the parameter is omitted, and nothing here ever set it. Silent for
        // English (the default already matched), latent for French/Spanish
        // until they had speak content to submit -- see
        // docs/superpowers/specs/2026-09-24-french-phase-2-question-types-design.md.
        const rawCourse = inForm?.get("course");
        const course = typeof rawCourse === "string" && isCourse(rawCourse) ? rawCourse : "en";
        // iOS builds up to 50 still send a `debugTiming` field. It is accepted and ignored: nothing reads it.
        // Deepgram's pre-recorded /v1/listen endpoint takes the raw audio
        // bytes as the request body with Content-Type set to the audio's
        // actual mime type — it detects webm/mp4/wav/etc. from that header,
        // no multipart wrapper or transcoding needed.
        const forwardedContentType = file.type || "audio/webm";
        const audioBytes = new Uint8Array(await file.arrayBuffer());
        // The apps' .m4a states its length up front: refuse an over-long one without paying for it. A header can
        // lie, so this only refuses; the charge below uses the provider's own length.
        const declared = headerDurationSeconds(audioBytes);
        if (declared !== null && declared > budget.maxCallSeconds()) {
          return Response.json({ error: "audio-too-long" }, { status: 413 });
        }
        // Reserve the per-call maximum first: atomic, so parallel calls cannot pass the day's budget together.
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const reserved = await budget.reserveAudioSeconds(supabaseAdmin, access.userId);
        if (!reserved.ok) return reserved.response;
        const settle = (seconds: number) =>
          budget.settleAudioSeconds(supabaseAdmin, access.userId, reserved.reservation, seconds);
        // From here the provider may transcribe, and bill, the audio even when no usable answer comes back. So the
        // upstream call is deliberately NOT tied to the caller's connection (hanging up after the upload must not
        // skip the charge), and an outcome whose length is unknown (a timeout, an unreadable answer) keeps the
        // reservation of the per-call maximum.
        let resp: Response;
        try {
          resp = await fetch(
            `https://api.deepgram.com/v1/listen?model=nova-3&language=${course}&smart_format=true&mip_opt_out=true`,
            {
              method: "POST",
              headers: {
                Authorization: `Token ${key}`,
                "Content-Type": forwardedContentType,
              },
              body: audioBytes,
              signal: AbortSignal.timeout(STT_TIMEOUT_MS),
            },
          );
        } catch (e) {
          // A timeout means the provider had the audio; a network failure before that (DNS, refused) means it did not.
          const timedOut =
            e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError");
          if (!timedOut) await settle(0);
          return Response.json({ error: "transcription-unavailable" }, { status: 504 });
        }
        if (!resp.ok) {
          // An error answer means no transcription: refund.
          await settle(0);
          const t = await resp.text().catch(() => "");
          return upstreamErrorResponse("Deepgram STT", resp.status, t);
        }
        type DeepgramReply = {
          results?: {
            channels?: { alternatives?: { transcript?: string; confidence?: number }[] }[];
          };
          metadata?: Record<string, unknown>;
        };
        let data: DeepgramReply;
        try {
          data = (await resp.json()) as DeepgramReply;
        } catch {
          // A success status means the audio was transcribed (and billed) even though the answer cannot be read:
          // the reservation stands.
          return Response.json({ error: "transcription-unavailable" }, { status: 502 });
        }
        // Settled to the length the provider billed. An over-long recording (a WebM states no length up front) is
        // charged in full and still answered: the cost is already paid, and the budget then stops the rest of the day.
        await settle(budget.chargeableSeconds(data.metadata?.duration));
        const alt = data.results?.channels?.[0]?.alternatives?.[0];
        const text = alt?.transcript ?? "";
        // V3 package 3a: Deepgram's own utterance-level confidence (0-1),
        // used as a lightweight pronunciation-clarity heuristic client-side
        // -- not real phoneme-level pronunciation scoring (see the design
        // decision in CHANGELOG.md's V3 entry for why: no new vendor, no
        // new cost, ships with data already in this response).
        const confidence = typeof alt?.confidence === "number" ? alt.confidence : null;
        return Response.json({ text, confidence });
      },
    },
  },
});
