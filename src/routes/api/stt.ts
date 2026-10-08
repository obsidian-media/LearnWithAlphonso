import { createFileRoute } from "@tanstack/react-router";
import { upstreamErrorResponse } from "@/lib/api-response.server";
import { isCourse } from "@/data/courses";

export const Route = createFileRoute("/api/stt")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env.DEEPGRAM_API_KEY;
        if (!key) return Response.json({ error: "STT is not configured" }, { status: 500 });
        const { authorizeAiRequest } = await import("@/lib/ai-consent.server");
        const access = await authorizeAiRequest(request, "stt", { route: "stt" });
        if (!access.ok) return access.response;
        const inForm = await request.formData().catch(() => null);
        const file = inForm?.get("file");
        if (!(file instanceof Blob) || file.size < 512) {
          return Response.json({ error: "Empty or missing audio" }, { status: 400 });
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
        // TEMPORARY (2026-09-28): a live "recorder buffers for a couple
        // seconds then just goes back to the mic icon, doesn't record
        // anything" report, with AIConversationClient.transcribe's
        // matching debugTiming parameter -- see that doc comment. The box
        // walker below already ruled out the file being corrupt: `moov`
        // and `mdat` sizes agree with each other and with Deepgram's own
        // reported duration -- the file is genuinely short, not
        // mis-parsed. This settles WHY: whether the client's own
        // press-to-release span was already short (a gesture bug) or
        // AVAudioRecorder took most of that span just to start actually
        // capturing (a session-reconfiguration race, most likely right
        // after Hector's own TTS reply playback).
        const debugTiming = inForm?.get("debugTiming");
        // Deepgram's pre-recorded /v1/listen endpoint takes the raw audio
        // bytes as the request body with Content-Type set to the audio's
        // actual mime type — it detects webm/mp4/wav/etc. from that header,
        // no multipart wrapper or transcoding needed.
        const forwardedContentType = file.type || "audio/webm";
        // Confirmed live on build 37 (2026-09-28): `moov` and `mdat` sizes
        // agree with each other and with Deepgram's own reported duration
        // -- the file itself is genuinely short and internally consistent,
        // not corrupt or mis-parsed. Kept as a box walker (not a raw hex
        // dump) since it settled that on the first real sample.
        const audioBuffer = await file.arrayBuffer();
        const audioBytes = new Uint8Array(audioBuffer);
        const view = new DataView(audioBuffer);
        function walkBoxes(bytes: Uint8Array): string {
          const boxes: string[] = [];
          let offset = 0;
          while (offset + 8 <= bytes.length) {
            const size = view.getUint32(offset, false);
            const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
            boxes.push(`${type}(${size})`);
            if (size < 8) break; // 0/1 means "rest of file"/64-bit size -- stop rather than misparse
            offset += size;
          }
          if (offset !== bytes.length) boxes.push(`[${bytes.length - offset} trailing bytes]`);
          return boxes.join(" ");
        }
        const resp = await fetch(
          `https://api.deepgram.com/v1/listen?model=nova-3&language=${course}&smart_format=true`,
          {
            method: "POST",
            headers: {
              Authorization: `Token ${key}`,
              "Content-Type": forwardedContentType,
            },
            body: audioBytes,
          },
        );
        if (!resp.ok) {
          const t = await resp.text().catch(() => "");
          return upstreamErrorResponse("Deepgram STT", resp.status, t);
        }
        const data = (await resp.json()) as {
          results?: {
            channels?: { alternatives?: { transcript?: string; confidence?: number }[] }[];
          };
          metadata?: Record<string, unknown>;
        };
        const alt = data.results?.channels?.[0]?.alternatives?.[0];
        const text = alt?.transcript ?? "";
        if (!text) {
          console.error(
            `[stt] Empty transcript. file.type="${file.type}" forwarded="${forwardedContentType}"` +
              ` size=${file.size} debugTiming="${typeof debugTiming === "string" ? debugTiming : "none"}"` +
              `\n[stt] boxes=${walkBoxes(audioBytes)}\n[stt] metadata=${JSON.stringify(data.metadata)}`,
          );
        }
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
