import { useEffect, useMemo, useRef, useState } from "react";
import { DsIcon } from "../ds/DsIcon";
import { VocabImage } from "../VocabImage";
import { edgeButtonClass } from "../lesson/LessonParts";
import { PracticeStars } from "./PracticeStars";
import { AI_CONSENT_COPY } from "@/lib/ai-consent-copy";
import { useOptionalAiConsent } from "@/lib/ai-consent-context";
import { useSpeechCapture } from "@/lib/use-speech-capture";
import { useModelSpeech } from "@/lib/use-model-speech";
import {
  MIN_POOL,
  drawRounds,
  imageWordPool,
  saidThePicture,
  sessionStars,
  type PictureWord,
} from "@/lib/say-the-picture";
import type { Course } from "@/data/courses";

/**
 * Say the picture (Practice activity): a word's picture with no text, the learner says it. A miss reveals the written
 * word and plays the model, the learner repeats once, and the session goes on. No hearts, no penalty.
 * Speech goes through the existing /api/stt (the speaking daily quota); the model through /api/tts.
 */
type Phase = "ask" | "right" | "reveal" | "done";

export function SayThePicture({ course, onExit }: { course: Course; onExit: () => void }) {
  // The live pool is read when a session starts (a new photo batch shows up in the next session).
  const [session, setSession] = useState(0);
  const rounds = useMemo<PictureWord[]>(
    () => drawRounds(imageWordPool(course)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [course, session],
  );
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("ask");
  const [firstTry, setFirstTry] = useState(0);
  const [heard, setHeard] = useState<string | null>(null);
  const word = rounds[index];

  const consent = useOptionalAiConsent();
  const needsConsent = !!consent && !consent.granted;
  const consentKnown = !consent || (consent.status !== "loading" && consent.status !== "unknown");
  const wordRef = useRef(word);
  wordRef.current = word;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const playModel = useModelSpeech(course);

  const next = () => {
    setHeard(null);
    if (index + 1 >= rounds.length) setPhase("done");
    else {
      setIndex(index + 1);
      setPhase("ask");
    }
  };
  const reveal = () => {
    setPhase("reveal");
    if (wordRef.current) void playModel(wordRef.current.term);
  };

  const { state, error, canRecord, start, stop } = useSpeechCapture({
    course,
    onTranscript: (text) => {
      const w = wordRef.current;
      if (!w) return;
      // The repeat after a reveal: the word was taught, so whatever was said, it goes on.
      if (phaseRef.current === "reveal") {
        setHeard(text);
        return;
      }
      if (saidThePicture(text, w.term, course)) {
        setFirstTry((n) => n + 1);
        setPhase("right");
      } else {
        reveal();
      }
    },
  });
  const recording = state === "recording";
  const transcribing = state === "transcribing";

  useEffect(() => {
    if (phase === "ask") document.getElementById("stp-record")?.focus();
  }, [index, phase]);

  const shell =
    "min-h-dvh bg-ds-surface px-4 pb-8 pt-5 font-[family-name:var(--ds-font-body)] text-ds-ink";
  const header = (
    <div className="mb-4 flex items-center justify-between">
      <button
        type="button"
        onClick={onExit}
        aria-label="Back to Practice"
        className="grid size-11 place-items-center rounded-full bg-ds-card text-ds-brand shadow-[inset_0_0_0_1.5px_var(--c-line)]"
      >
        <DsIcon name="close" className="size-5" />
      </button>
      <h1 className="ds-type-headline font-extrabold">Say the picture</h1>
      <span className="size-11" aria-hidden="true" />
    </div>
  );

  if (rounds.length < MIN_POOL) {
    return (
      <div data-say-the-picture="empty" className={shell}>
        {header}
        <p role="status" className="rounded-[18px] bg-ds-card p-4 ds-type-body text-ds-ink-soft">
          Not enough words with pictures yet. Check back soon.
        </p>
      </div>
    );
  }

  const unavailable = needsConsent || !canRecord;
  if (unavailable && phase === "ask") {
    return (
      <div data-say-the-picture="unavailable" className={shell}>
        {header}
        <div role="status" className="grid gap-3 rounded-[18px] bg-ds-card p-4">
          <p className="ds-type-body text-ds-ink-soft">
            {needsConsent
              ? consentKnown
                ? AI_CONSENT_COPY.speakFallbackNoConsent
                : consent?.status === "unknown"
                  ? AI_CONSENT_COPY.checkFailedTitle
                  : "Checking your settings."
              : "Say the picture needs a microphone and a connection, and this device can't record right now."}
          </p>
          {needsConsent && consentKnown && consent && canRecord && (
            <button
              type="button"
              onClick={() => void consent.requestConsent()}
              className={edgeButtonClass("primary")}
            >
              {AI_CONSENT_COPY.useVoiceInstead}
            </button>
          )}
          <button type="button" onClick={onExit} className={edgeButtonClass("secondary")}>
            Back to Practice
          </button>
        </div>
      </div>
    );
  }

  if (phase === "done") {
    const stars = sessionStars(firstTry, rounds.length);
    return (
      <div data-say-the-picture="done" className={shell}>
        {header}
        <div className="grid justify-items-center gap-3 rounded-[22px] bg-ds-card p-6 text-center shadow-[var(--ds-shadow-resting)]">
          <PracticeStars n={stars} size="md" />
          <h2 className="ds-type-title font-extrabold">Practised {rounds.length} words</h2>
          <p className="ds-type-body text-ds-ink-soft">
            {firstTry} of {rounds.length} said first time. Every word you practise sticks a little
            more.
          </p>
          <div className="mt-2 grid w-full gap-2.5">
            <button
              type="button"
              onClick={() => {
                setSession((s) => s + 1);
                setIndex(0);
                setPhase("ask");
                setFirstTry(0);
                setHeard(null);
              }}
              className={edgeButtonClass("primary")}
            >
              Practise more
            </button>
            <button type="button" onClick={onExit} className={edgeButtonClass("secondary")}>
              Back to Practice
            </button>
          </div>
        </div>
      </div>
    );
  }

  const last = index + 1 >= rounds.length;
  return (
    <div data-say-the-picture="round" data-phase={phase} className={shell}>
      {header}
      <p className="mb-3 text-center ds-type-caption font-extrabold text-ds-ink-soft">
        Word {index + 1} of {rounds.length}
      </p>
      <div className="mx-auto w-full max-w-sm">
        <VocabImage
          url={word.image.url}
          alt={phase === "ask" ? "A picture of a word to say" : word.image.alt}
          className="aspect-square w-full rounded-[22px] shadow-[var(--ds-shadow-floating)]"
        />

        {phase === "ask" && (
          <div className="mt-5 grid justify-items-center gap-3">
            <button
              id="stp-record"
              type="button"
              disabled={transcribing}
              onClick={() => (recording ? stop() : void start())}
              aria-label={recording ? "Stop recording" : "Record your answer"}
              aria-pressed={recording}
              className={`grid size-20 place-items-center rounded-full transition-transform motion-reduce:transition-none ${
                recording
                  ? "bg-ds-wrong text-ds-on-wrong shadow-[0_5px_0_var(--c-wrong-edge)] motion-safe:scale-110"
                  : "bg-[linear-gradient(180deg,var(--c-action-hi)_0%,var(--c-action)_55%)] text-ds-on-action shadow-[0_5px_0_var(--c-action-edge)]"
              } disabled:opacity-50`}
            >
              <DsIcon name="mic" className="size-8" />
            </button>
            <p className="ds-type-caption text-ds-ink-soft" aria-live="polite">
              {recording
                ? "Listening. Tap to stop."
                : transcribing
                  ? "Checking what you said…"
                  : "What is this? Tap and say it."}
            </p>
            {error && (
              <p
                role="alert"
                className="rounded-full bg-ds-wrong-tint px-3 py-1 ds-type-caption text-ds-wrong-ink"
              >
                {error}
              </p>
            )}
            <button
              type="button"
              onClick={reveal}
              disabled={recording || transcribing}
              className={edgeButtonClass("tertiary")}
            >
              Show me the word
            </button>
          </div>
        )}

        {phase === "right" && (
          <div role="status" className="mt-5 grid justify-items-center gap-3">
            <p className="flex items-center gap-2 ds-type-title font-extrabold text-ds-right-ink">
              <DsIcon name="star" solid className="size-7 text-ds-action" />
              <span lang={course}>{word.term}</span>
            </p>
            <button type="button" onClick={next} className={edgeButtonClass("right")}>
              {last ? "Finish" : "Next"}
            </button>
          </div>
        )}

        {phase === "reveal" && (
          <div className="mt-5 grid gap-3">
            <div className="rounded-[18px] bg-ds-card px-4 py-3 text-center shadow-[var(--ds-shadow-resting)]">
              <p className="ds-type-overline text-ds-ink-soft">It is</p>
              <p lang={course} className="mt-1 ds-type-title font-extrabold text-ds-brand">
                {word.term}
              </p>
              <button
                type="button"
                onClick={() => void playModel(word.term)}
                className="mx-auto mt-2 flex items-center gap-1.5 rounded-full bg-ds-choice-tint px-3 py-1.5 ds-type-footnote font-bold text-ds-choice"
              >
                <DsIcon name="speaker" className="size-4" />
                Hear it
              </button>
            </div>
            <p className="text-center ds-type-caption text-ds-ink-soft" aria-live="polite">
              {recording
                ? "Listening. Tap to stop."
                : transcribing
                  ? "Checking what you said…"
                  : heard
                    ? "Nice. That is it for this word."
                    : "Now say it once yourself."}
            </p>
            {error && (
              <p
                role="alert"
                className="mx-auto rounded-full bg-ds-wrong-tint px-3 py-1 ds-type-caption text-ds-wrong-ink"
              >
                {error}
              </p>
            )}
            {!heard && canRecord && !needsConsent && (
              <button
                type="button"
                disabled={transcribing}
                onClick={() => (recording ? stop() : void start())}
                aria-label={recording ? "Stop recording" : "Record your answer"}
                aria-pressed={recording}
                className={`mx-auto grid size-16 place-items-center rounded-full bg-[linear-gradient(180deg,var(--c-action-hi)_0%,var(--c-action)_55%)] text-ds-on-action shadow-[0_5px_0_var(--c-action-edge)] disabled:opacity-50 ${recording ? "ring-4 ring-ds-wrong" : ""}`}
              >
                <DsIcon name="mic" className="size-7" />
              </button>
            )}
            <button
              type="button"
              onClick={next}
              disabled={recording || transcribing}
              className={edgeButtonClass(heard ? "primary" : "secondary")}
            >
              {last ? "Finish" : "Next word"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
