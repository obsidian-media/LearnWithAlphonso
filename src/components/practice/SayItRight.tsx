import { useEffect, useMemo, useRef, useState } from "react";
import { DsIcon } from "../ds/DsIcon";
import { edgeButtonClass } from "../lesson/LessonParts";
import { PracticeStars } from "./PracticeStars";
import { AI_CONSENT_COPY } from "@/lib/ai-consent-copy";
import { useOptionalAiConsent } from "@/lib/ai-consent-context";
import { useSpeechCapture } from "@/lib/use-speech-capture";
import { useModelSpeech } from "@/lib/use-model-speech";
import { useProgress } from "@/lib/progress";
import {
  MIN_POOL,
  drawRounds,
  judgeAttempt,
  learnedWordPool,
  sessionStars,
  type Verdict,
} from "@/lib/pronunciation";
import type { VocabItem } from "@/data/vocab";
import type { Course } from "@/data/courses";

/**
 * Say it right (Practice drill): a learned word, a "Hear it" model, and a recording judged on how clearly it was
 * understood (Deepgram's transcript and confidence through the existing /api/stt, the speaking daily quota). A miss
 * replays the model and allows one retry, then the session goes on. No hearts, no penalty. The words are the learner's
 * LEARNED words, derived live when a session starts, so the pool grows as they learn.
 */
type Phase = "ask" | "retry" | "result" | "done";

const MESSAGE: Record<Verdict, string> = {
  great: "Great!",
  almost: "Almost - say it a touch clearer.",
  again: "Let's try again.",
};

export function SayItRight({
  course,
  onExit,
  words,
}: {
  course: Course;
  onExit: () => void;
  /** Hand-picked words to drill (Say the picture's missed words); without it the drill draws from the learned pool. */
  words?: VocabItem[];
}) {
  // The live pool is read when a session starts: a word learned since the last session is in this one.
  const [session, setSession] = useState(0);
  const rounds = useMemo<VocabItem[]>(
    () =>
      words && words.length > 0
        ? words
        : drawRounds(learnedWordPool(course, useProgress.getState().completedLessons)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [course, session],
  );
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("ask");
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [greatFirst, setGreatFirst] = useState(0);
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
    setVerdict(null);
    if (index + 1 >= rounds.length) setPhase("done");
    else {
      setIndex(index + 1);
      setPhase("ask");
    }
  };

  const { state, error, canRecord, start, stop } = useSpeechCapture({
    course,
    onTranscript: (text, confidence) => {
      const w = wordRef.current;
      if (!w) return;
      const v = judgeAttempt(text, confidence, w.term, course);
      setVerdict(v);
      if (phaseRef.current === "ask") {
        if (v === "great") {
          setGreatFirst((n) => n + 1);
          setPhase("result");
        } else {
          setPhase("retry");
          void playModel(w.term);
        }
      } else {
        // The one retry: whatever it was, the session goes on.
        setPhase("result");
      }
    },
  });
  const recording = state === "recording";
  const transcribing = state === "transcribing";
  const recordingOff = needsConsent || !canRecord;

  useEffect(() => {
    if (phase === "ask") document.getElementById("sir-record")?.focus();
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
      <h1 className="ds-type-headline font-extrabold">Say it right</h1>
      <span className="size-11" aria-hidden="true" />
    </div>
  );

  if (rounds.length < (words && words.length > 0 ? 1 : MIN_POOL)) {
    return (
      <div data-say-it-right="empty" className={shell}>
        {header}
        <div role="status" className="grid gap-3 rounded-[18px] bg-ds-card p-4">
          <p className="ds-type-body text-ds-ink-soft">
            Learn a few words first. Say it right practises the words you have already met in
            lessons.
          </p>
          <button type="button" onClick={onExit} className={edgeButtonClass("secondary")}>
            Back to Practice
          </button>
        </div>
      </div>
    );
  }

  if (phase === "done") {
    const stars = sessionStars(greatFirst, rounds.length);
    return (
      <div data-say-it-right="done" className={shell}>
        {header}
        <div className="grid justify-items-center gap-3 rounded-[22px] bg-ds-card p-6 text-center shadow-[var(--ds-shadow-resting)]">
          <PracticeStars n={stars} size="md" />
          <h2 className="ds-type-title font-extrabold">Practised {rounds.length} words</h2>
          <p className="ds-type-body text-ds-ink-soft">
            {greatFirst} of {rounds.length} said clearly first time. Every word you say out loud
            sticks a little more.
          </p>
          <div className="mt-2 grid w-full gap-2.5">
            <button
              type="button"
              onClick={() => {
                setSession((s) => s + 1);
                setIndex(0);
                setPhase("ask");
                setGreatFirst(0);
                setVerdict(null);
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
  const recordButton = (
    <button
      id="sir-record"
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
  );

  return (
    <div
      data-say-it-right="round"
      data-phase={phase}
      data-verdict={verdict ?? ""}
      className={shell}
    >
      {header}
      <p className="mb-3 text-center ds-type-caption font-extrabold text-ds-ink-soft">
        Word {index + 1} of {rounds.length}
      </p>
      <div className="mx-auto grid w-full max-w-sm gap-4">
        <div className="rounded-[22px] bg-ds-card px-4 py-6 text-center shadow-[var(--ds-shadow-floating)]">
          <p lang={course} className="ds-type-display font-extrabold text-ds-brand">
            {word.term}
          </p>
          {word.meaning && (
            <p className="mt-1 ds-type-caption font-semibold text-ds-ink-soft">{word.meaning}</p>
          )}
          <button
            type="button"
            onClick={() => void playModel(word.term)}
            className="mx-auto mt-3 flex items-center gap-1.5 rounded-full bg-ds-choice-tint px-4 py-2 ds-type-footnote font-bold text-ds-choice"
          >
            <DsIcon name="speaker" className="size-4" />
            Hear it
          </button>
        </div>

        {phase !== "result" && (
          <div className="grid justify-items-center gap-3">
            {recordingOff ? (
              <div role="status" className="grid gap-3 rounded-[18px] bg-ds-card p-4">
                <p className="ds-type-body text-ds-ink-soft">
                  {needsConsent
                    ? consentKnown
                      ? AI_CONSENT_COPY.speakFallbackNoConsent
                      : consent?.status === "unknown"
                        ? AI_CONSENT_COPY.checkFailedTitle
                        : "Checking your settings."
                    : "Recording needs a microphone and a connection, and this device can't record right now. You can still hear the word."}
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
              </div>
            ) : (
              <>
                {phase === "retry" && verdict && (
                  <p
                    role="status"
                    data-verdict-message={verdict}
                    className="rounded-full bg-ds-choice-tint px-4 py-1.5 ds-type-footnote font-extrabold text-ds-choice"
                  >
                    {MESSAGE[verdict]}
                  </p>
                )}
                {recordButton}
                <p className="ds-type-caption text-ds-ink-soft" aria-live="polite">
                  {recording
                    ? "Listening. Tap to stop."
                    : transcribing
                      ? "Checking how clear that was…"
                      : phase === "retry"
                        ? "Listen, then try once more."
                        : "Tap and say it."}
                </p>
              </>
            )}
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
              onClick={next}
              disabled={recording || transcribing}
              className={edgeButtonClass("tertiary")}
            >
              {last ? "Finish" : "Skip this word"}
            </button>
          </div>
        )}

        {phase === "result" && verdict && (
          <div role="status" className="grid justify-items-center gap-3">
            {verdict === "great" ? (
              <p
                data-verdict-message="great"
                className="flex items-center gap-2 ds-type-title font-extrabold text-ds-right-ink"
              >
                <DsIcon name="star" solid className="size-7 text-ds-action" />
                Great!
              </p>
            ) : (
              <p
                data-verdict-message="moveon"
                className="ds-type-headline font-extrabold text-ds-ink"
              >
                Good try. It gets easier each time.
              </p>
            )}
            <button type="button" onClick={next} className={edgeButtonClass("right")}>
              {last ? "Finish" : "Next"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
