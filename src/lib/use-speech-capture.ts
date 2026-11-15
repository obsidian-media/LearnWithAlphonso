import { useCallback, useEffect, useRef, useState } from "react";
import { authHeaders } from "./auth-headers";
import { readApiError } from "./read-api-error";
import { normaliseSpoken } from "./spoken-answer";
import type { Course } from "@/data/courses";

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
/** A hands-free recording shorter than this is dropped, as on iOS: it is a click, not a turn. */
export const MIN_HANDS_FREE_CLIP_MS = 400;

export function useSpeechCapture({
  onTranscript,
  course,
  handsFree = false,
  onNoWords,
  onFailure,
}: {
  onTranscript: (text: string, confidence: number | null) => void | Promise<void>;
  /** Forwarded to /api/stt so Deepgram transcribes in the right language
   * instead of defaulting to English. Optional and defaults server-side to
   * "en" -- the conversation routes pass the active course. */
  course?: Course;
  /**
   * Hands-free turns: a clip under 0.4 s is dropped without a message, and a transcript with no words reports
   * `onNoWords` (the hands-free loop pauses and says so) instead of an error. Hold-to-talk is unchanged.
   */
  handsFree?: boolean;
  onNoWords?: () => void;
  /** Called for a real failure (denied microphone, transcription error): the hands-free loop pauses. */
  onFailure?: () => void;
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
  // True from the moment a recording is asked for until the microphone is open (or refused): the permission phase.
  const [starting, setStarting] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  // getUserMedia is async, so a release can land before the MediaRecorder even
  // exists -- stop() would then be a no-op and the microphone would stay hot
  // with no way to turn it off. This records "the user already asked to stop"
  // so start can honour it the moment the stream arrives.
  const stopRequestedRef = useRef({ requested: false });
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;
  const courseRef = useRef(course);
  courseRef.current = course;
  const handsFreeRef = useRef(handsFree);
  handsFreeRef.current = handsFree;
  const onNoWordsRef = useRef(onNoWords);
  onNoWordsRef.current = onNoWords;
  const onFailureRef = useRef(onFailure);
  onFailureRef.current = onFailure;
  // cancel() asks the recorder to stop and throw the clip away: nothing is transcribed or reported.
  const cancelRequestedRef = useRef(false);
  const startedAtRef = useRef(0);
  const startingRef = useRef(false);

  const canRecord =
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function" &&
    typeof MediaRecorder !== "undefined";

  const start = useCallback(async () => {
    setError(null);
    // One recorder at a time: a second start (a Resume, a hold-to-talk) never orphans a stream that exists or is
    // still being granted.
    if (startingRef.current || (recorderRef.current && recorderRef.current.state !== "inactive"))
      return;
    const stopToken = { requested: false };
    stopRequestedRef.current = stopToken;
    cancelRequestedRef.current = false;
    startingRef.current = true;
    setStarting(true);
    try {
      // Echo cancellation on, so a reply played from the speaker is less likely to be heard as the learner.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true },
      });
      if (stopToken.requested) {
        stream.getTracks().forEach((t) => t.stop());
        startingRef.current = false;
        setStarting(false);
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
        if (cancelRequestedRef.current) {
          setState("idle");
          return;
        }
        if (handsFreeRef.current && Date.now() - startedAtRef.current < MIN_HANDS_FREE_CLIP_MS) {
          setState("idle");
          return;
        }
        if (blob.size < 1024) {
          if (handsFreeRef.current) {
            setState("idle");
            return;
          }
          setError("That was too short — try again.");
          setFailed(true);
          setState("idle");
          return;
        }
        setState("transcribing");
        try {
          const fd = new FormData();
          fd.append("file", blob, `recording.${ext}`);
          if (courseRef.current) fd.append("course", courseRef.current);
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
            if (handsFreeRef.current && onNoWordsRef.current) {
              onNoWordsRef.current();
            } else {
              setError("Didn't catch that — try again.");
              setFailed(true);
            }
          } else {
            await onTranscriptRef.current(text, data.confidence ?? null);
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : "Transcription failed.");
          setFailed(true);
          onFailureRef.current?.();
        } finally {
          setState("idle");
        }
      };
      recorderRef.current = rec;
      rec.start();
      startedAtRef.current = Date.now();
      startingRef.current = false;
      setStarting(false);
      setState("recording");
    } catch {
      setError("Microphone access is needed to speak.");
      setFailed(true);
      startingRef.current = false;
      setStarting(false);
      setState("idle");
      onFailureRef.current?.();
    }
  }, []);

  const stop = useCallback(() => {
    stopRequestedRef.current.requested = true;
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
  }, []);

  /** Stops the recording and throws the clip away (hands-free pause, no-speech and long-turn cancels). */
  const cancel = useCallback(() => {
    cancelRequestedRef.current = true;
    stopRequestedRef.current.requested = true;
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
  }, []);

  const clearError = useCallback(() => setError(null), []);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  /** The live microphone stream while recording (for a level meter), otherwise null. */
  const getStream = useCallback(() => streamRef.current, []);
  return { state, starting, error, failed, canRecord, start, stop, cancel, clearError, getStream };
}
