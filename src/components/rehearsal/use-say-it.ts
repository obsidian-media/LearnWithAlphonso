import { useEffect, useRef, useState } from "react";
import type { Course } from "@/data/courses";
import { useOptionalAiConsent } from "@/lib/ai-consent-context";
import { checkPhrase, type PhraseCheck } from "@/lib/phrase-check";
import { MAX_RECORD_MS } from "@/lib/say-the-picture";
import { useSpeechCapture } from "@/lib/use-speech-capture";
import { voicePlayback } from "@/lib/voice-playback";

/**
 * "Say it" in the phrasebook: one recording at a time across the rows. The learner's words are never kept: only the
 * outcome for the phrase they were saying (a PhraseCheck made of the EXPECTED phrase's own words) is held, in memory,
 * for as long as the screen is open. Nothing is stored, logged or replayed.
 */
export function useSayIt(course: Course, phrases: readonly string[]) {
  const consent = useOptionalAiConsent();
  const needsConsent = !!consent && !consent.granted;
  const [active, setActive] = useState<number | null>(null);
  const [results, setResults] = useState<Record<number, PhraseCheck>>({});
  const activeRef = useRef<number | null>(null);
  const phrasesRef = useRef(phrases);
  phrasesRef.current = phrases;

  const settle = (check: PhraseCheck) => {
    const at = activeRef.current;
    if (at !== null) setResults((r) => ({ ...r, [at]: check }));
  };
  const capture = useSpeechCapture({
    course,
    reportNoWords: true,
    onNoWords: () => settle({ result: "not_yet", listenAgain: [] }),
    onTranscript: (text, _confidence, words) => {
      const at = activeRef.current;
      if (at === null) return;
      settle(checkPhrase(phrasesRef.current[at] ?? "", text, words));
    },
  });
  const recording = capture.state === "recording";

  const stopRef = useRef(capture.stop);
  stopRef.current = capture.stop;
  useEffect(() => {
    if (!recording) return;
    const t = setTimeout(() => stopRef.current(), MAX_RECORD_MS);
    return () => clearTimeout(t);
  }, [recording]);

  /** Tap the mic of row `index`: starts a recording, or sends the one in progress. */
  const toggle = (index: number) => {
    if (needsConsent) {
      void consent?.requestConsent();
      return;
    }
    if (capture.state === "transcribing") return;
    if (capture.state === "recording") {
      capture.stop();
      return;
    }
    voicePlayback().stop();
    activeRef.current = index;
    setActive(index);
    setResults((r) => {
      const { [index]: _dropped, ...rest } = r;
      return rest;
    });
    capture.clearError();
    void capture.start();
  };

  return {
    canRecord: capture.canRecord,
    needsConsent,
    /** The row being recorded or checked, or null. */
    busyRow: capture.state === "idle" && !capture.starting ? null : active,
    state: capture.state,
    results,
    /** The existing mic / upload / quota message, for the row last used. */
    errorRow: active,
    error: capture.error,
    toggle,
  };
}
