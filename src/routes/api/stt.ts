import { createFileRoute } from "@tanstack/react-router";
import { upstreamErrorResponse } from "@/lib/api-response.server";
import { isCourse } from "@/data/courses";

export const Route = createFileRoute("/api/stt")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env.DEEPGRAM_API_KEY;
        if (!key) return Response.json({ error: "STT is not configured" }, { status: 500 });
        const { consumeQuota } = await import("@/lib/ai-quota.server");
        const quota = await consumeQuota(request, "stt");
        if (!quota.ok) return Response.json({ error: quota.message }, { status: quota.status });
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
        // Deepgram's pre-recorded /v1/listen endpoint takes the raw audio
        // bytes as the request body with Content-Type set to the audio's
        // actual mime type — it detects webm/mp4/wav/etc. from that header,
        // no multipart wrapper or transcoding needed.
        const forwardedContentType = file.type || "audio/webm";
        // TEMPORARY (2026-09-28): build 37's AVAudioRecorderDelegate fix
        // (wait for audioRecorderDidFinishRecording before reading the
        // file, instead of trusting stop()'s synchronous return) did NOT
        // fix this -- confirmed on a real build-37 device, same signature
        // (~0.5s reported duration on a 60KB+ file) as before the fix.
        // That was the leading theory and it's now ruled out as the WHOLE
        // story. Reading the file's own bytes here, once, before
        // forwarding it -- an MPEG-4/M4A container's trailer (the `moov`
        // atom, holding the real sample table and duration) is written
        // LAST, once recording finishes, so if the file were still
        // genuinely incomplete when uploaded, the tail bytes would show a
        // truncated/missing moov rather than real box data. This settles
        // whether the file itself is bad (a still-unsolved client-side
        // race) or arrives intact and something after that -- Deepgram's
        // own parsing of this specific encoder configuration -- is
        // misreading it.
        const audioBuffer = await file.arrayBuffer();
        const audioBytes = new Uint8Array(audioBuffer);
        const toHex = (bytes: Uint8Array) =>
          Array.from(bytes)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join(" ");
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
          const head = toHex(audioBytes.slice(0, 32));
          const tail = toHex(audioBytes.slice(-64));
          console.error(
            `[stt] Empty transcript. file.type="${file.type}" forwarded="${forwardedContentType}"` +
              ` size=${file.size}\n[stt] head=${head}\n[stt] tail=${tail}` +
              `\n[stt] metadata=${JSON.stringify(data.metadata)}`,
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
