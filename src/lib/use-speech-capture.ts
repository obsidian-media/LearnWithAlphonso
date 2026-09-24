import { useCallback, useEffect, useRef, useState } from "react";
import { authHeaders } from "./auth-headers";
import { readApiError } from "./read-api-error";
import { normaliseSpoken } from "./spoken-answer";

export type SpeechCaptureState = "idle" | "recording" | "transcribing";

/**
 * Hold-to-record speech capture: microphone in, transcript out.
 *
 * Extracted from the conversation route rather than written fresh, so there is
 * one implementation of this flow rather than a copy per feature. It keeps that
 * route's hard-won details, notably the release-before-permission race noted
 * below.
 *
 * `onTranscript` is called ONLY on a real, non-empty transcript. Every failure
 * path -- denied microphone, too-short clip, transcription error, silence --
 * sets `error` and reports nothing. That asymmetry is deliberate: a caller that
 * grades answers must never be handed "nothing" and treat it as a wrong one,
 * because the learner would lose a heart for a microphone problem rather than
 * for their English.
 */
export function useSpeechCapture({
  onTranscript,
}: {
  onTranscript: (text: string, confidence: number | null) => void | Promise<void>;
}) {
  const [state, setState] = useState<SpeechCaptureState>("idle");
  const [error, setError] = useState<string | null>(null);
  // Sticky: set by ANY capture or transcription failure and never cleared.
  // Callers that must stay answerable (a graded speaking question) use it to
  // offer a way through that does not involve the microphone. Feature
  // detection alone is not enough -- a denied permission, a dead network and a
  // failing /api/stt all leave a browser that has getUserMedia and still
  // cannot produce a transcript.
  const [failed, setFailed] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  // getUserMedia is async, so a release can land before the MediaRecorder even
  // exists -- stop() would then be a no-op and the microphone would stay hot
  // with no way to turn it off. This records "the user already asked to stop"
  // so start can honour it the moment the stream arrives.
  const stopRequestedRef = useRef(false);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  const canRecord =
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function" &&
    typeof MediaRecorder !== "undefined";

  const start = useCallback(async () => {
    setError(null);
    stopRequestedRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (stopRequestedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "";
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const type = rec.mimeType || mime || "audio/webm";
        const ext = type.includes("mp4") ? "mp4" : type.includes("mpeg") ? "mp3" : "webm";
        const blob = new Blob(chunksRef.current, { type });
        if (blob.size < 1024) {
          setError("That was too short — try again.");
          setFailed(true);
          setState("idle");
          return;
        }
        setState("transcribing");
        try {
          const fd = new FormData();
          fd.append("file", blob, `recording.${ext}`);
          const resp = await fetch("/api/stt", {
            method: "POST",
            headers: await authHeaders(),
            body: fd,
          });
          if (!resp.ok) throw new Error((await readApiError(resp)) || "Transcription failed");
          const data = (await resp.json()) as { text?: string; confidence?: number | null };
          const text = (data.text ?? "").trim();
          // Gate on the NORMALISED transcript, not the raw one. Deepgram
          // returns hesitation noise as real text ("Um.", "Uh, ah"), which is
          // non-empty here but normalises to nothing at the grading site -- so
          // a raw-text gate let it through as an answer and the learner lost a
          // heart for clearing their throat.
          if (!normaliseSpoken(text)) {
            setError("Didn't catch that — try again.");
            setFailed(true);
          } else {
            await onTranscriptRef.current(text, data.confidence ?? null);
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : "Transcription failed.");
          setFailed(true);
        } finally {
          setState("idle");
        }
      };
      recorderRef.current = rec;
      rec.start();
      setState("recording");
    } catch {
      setError("Microphone access is needed to speak.");
      setFailed(true);
      setState("idle");
    }
  }, []);

  const stop = useCallback(() => {
    stopRequestedRef.current = true;
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
  }, []);

  const clearError = useCallback(() => setError(null), []);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return { state, error, failed, canRecord, start, stop, clearError };
}
