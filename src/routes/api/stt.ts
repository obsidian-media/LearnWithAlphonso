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
        // story. A raw hex dump of the first request this fired on showed
        // a 637-byte second top-level box immediately after `ftyp`, far
        // too small to be `mdat` (the real audio, ~60KB) in a normal
        // ftyp-then-mdat-then-moov (moov-last) layout -- consistent with
        // `moov` itself having been written FIRST, fast-start style, with
        // a sample table describing only a fraction of a second, while
        // `mdat` afterward holds much more real audio the moov never
        // accounts for. Walking the actual top-level box structure (type
        // + size for each) instead of a raw hex dump to confirm this
        // properly rather than eyeballing hex by hand.
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
              ` size=${file.size}\n[stt] boxes=${walkBoxes(audioBytes)}` +
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
