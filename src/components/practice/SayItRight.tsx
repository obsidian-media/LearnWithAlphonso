import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DsIcon } from "../ds/DsIcon";
import { edgeButtonClass } from "../lesson/LessonParts";
import { PracticeStars } from "./PracticeStars";
import { AI_CONSENT_COPY } from "@/lib/ai-consent-copy";
import { useOptionalAiConsent } from "@/lib/ai-consent-context";
import { useSpeechCapture } from "@/lib/use-speech-capture";
import { useSayItRightAudio } from "@/lib/use-say-it-right-audio";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";
import { WAVE_BARS } from "@/lib/waveform";
import { useProgress } from "@/lib/progress";
import {
  MIN_POOL,
  drawRounds,
  judgeAttempt,
  learnedWordPool,
  sessionStars,
  type Verdict,
} from "@/lib/pronunciation";
import {
  BUBBLE,
  LATCH_MS,
  MAX_RECORD_MS,
  MOVE_ON,
  PRAISE,
  clearlyLine,
  nextLineIndex,
  poseFor,
  releaseStops,
  type SirPhase,
} from "@/lib/say-it-right";
import type { VocabItem } from "@/data/vocab";
import type { Course } from "@/data/courses";

/**
 * Say it right ("Talk with Alphonso"): a warm 1:1 lesson. The word is the hero, shown inside Alphonso's speech bubble
 * with a "Hear it" model button; he reacts in pose to each state with a short, varied line, and the learner's mic sits
 * opposite him (blue at rest, red while recording; hold to talk, tap to toggle, auto-stop at MAX_RECORD_MS). Underneath
 * nothing changed: learned words, /api/stt through the existing speak capture, the great/almost/again bands, one
 * gentle retry on a miss, no hearts and no new quota kind.
 */
export function SayItRight({
  course,
  onExit,
  words,
  pick = Math.random,
  audioDeps,
}: {
  course: Course;
  onExit: () => void;
  /** Hand-picked words to drill (Say the picture's missed words); without it the drill draws from the learned pool. */
  words?: VocabItem[];
  /** Random roll in [0, 1) for the varied praise lines; injectable so tests are deterministic. */
  pick?: () => number;
  /** Test seams for the audio side: the sample decoder, the TTS fetch and the Audio element factory. */
  audioDeps?: Pick<
    Parameters<typeof useSayItRightAudio>[0],
    "decode" | "fetchModel" | "createAudio"
  >;
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
  const [phase, setPhase] = useState<SirPhase>("ask");
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [greatFirst, setGreatFirst] = useState(0);
  // Greats shown so far this session (first time or on the retry): it alternates the cheer and the impressed pose.
  const [greatShown, setGreatShown] = useState(0);
  const [line, setLine] = useState<string>(BUBBLE.ask);
  const lastLine = useRef<Partial<Record<Verdict, number>>>({});
  const word = rounds[index];

  const consent = useOptionalAiConsent();
  const needsConsent = !!consent && !consent.granted;
  const consentKnown = !consent || (consent.status !== "loading" && consent.status !== "unknown");
  const wordRef = useRef(word);
  wordRef.current = word;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const pickRef = useRef(pick);
  pickRef.current = pick;
  const recordingRef = useRef(false);
  const cancelRef = useRef<() => void>(() => {});
  // The last attempt's audio and Alphonso's model, in memory only; freed when the word changes and on exit.
  const audio = useSayItRightAudio({
    course,
    resetKey: `${session}:${index}`,
    onPlayStart: () => {
      // Playing a clip stops any recording (and throws that recording away rather than judging it).
      if (recordingRef.current) cancelRef.current();
    },
    ...audioDeps,
  });
  const playModel = audio.playModel;
  const reduceMotion = usePrefersReducedMotion();

  const say = (v: Verdict) => {
    const bank = PRAISE[v];
    const i = nextLineIndex(bank.length, lastLine.current[v] ?? null, pickRef.current());
    lastLine.current[v] = i;
    setLine(bank[i]);
  };

  const next = () => {
    setVerdict(null);
    setLine(BUBBLE.ask);
    if (index + 1 >= rounds.length) setPhase("done");
    else {
      setIndex(index + 1);
      setPhase("ask");
    }
  };

  const { state, error, canRecord, start, stop, cancel } = useSpeechCapture({
    course,
    onClip: (clip) => audio.setYouClip(clip),
    onTranscript: (text, confidence) => {
      const w = wordRef.current;
      if (!w) return;
      const v = judgeAttempt(text, confidence, w.term, course);
      setVerdict(v);
      if (v === "great") setGreatShown((n) => n + 1);
      if (phaseRef.current === "ask") {
        say(v);
        if (v === "great") {
          setGreatFirst((n) => n + 1);
          setPhase("result");
        } else {
          setPhase("retry");
          void playModel(w.term);
        }
      } else {
        // The one retry: whatever it was, the session goes on.
        if (v === "great") say(v);
        else setLine(MOVE_ON);
        setPhase("result");
      }
    },
  });
  const recording = state === "recording";
  recordingRef.current = recording;
  cancelRef.current = cancel;
  const transcribing = state === "transcribing";
  const recordingOff = needsConsent || !canRecord;

  useEffect(() => {
    if (phase === "ask") document.getElementById("sir-record")?.focus();
  }, [index, phase]);

  // Hold to talk, or tap to start and tap to stop. A press starts recording; a release after a real hold (LATCH_MS or
  // more) sends it, while a quick tap LATCHES the recording on so a second tap stops it. A plain click (keyboard,
  // screen reader) toggles, so the mic is never a hold-only control. The recording also stops by itself at MAX_RECORD_MS.
  const holding = useRef(false);
  const pressedAt = useRef(0);
  const pressedByPointer = useRef(false);
  const press = () => {
    if (transcribing) return;
    pressedByPointer.current = true;
    if (recording) {
      // A latched recording: this second tap stops it (the click that follows is swallowed).
      stop();
      return;
    }
    holding.current = true;
    pressedAt.current = Date.now();
    audio.stop();
    void start();
  };
  const release = () => {
    if (!holding.current) return;
    holding.current = false;
    // A quick tap latches the recording on; only a real hold sends on release.
    if (releaseStops(Date.now() - pressedAt.current)) stop();
  };
  // The pointer left the mic (or was cancelled) while held: no click follows and the gesture is not a tap, so the
  // recording stops, and the next keyboard press must not be taken for the click that follows a hold.
  const abandon = () => {
    if (!holding.current) return;
    holding.current = false;
    pressedByPointer.current = false;
    stop();
  };
  const stopRef = useRef(stop);
  stopRef.current = stop;
  useEffect(() => {
    if (!recording) return;
    const t = setTimeout(() => {
      holding.current = false;
      stopRef.current();
    }, MAX_RECORD_MS);
    return () => clearTimeout(t);
  }, [recording]);
  const toggle = () => {
    if (pressedByPointer.current) {
      pressedByPointer.current = false;
      return;
    }
    if (recording) stop();
    else {
      audio.stop();
      void start();
    }
  };

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
      <div data-say-it-right="done" data-pose="levelup-cheer" className={shell}>
        {header}
        <div className="grid justify-items-center gap-3 rounded-[22px] bg-ds-card p-6 text-center shadow-[var(--ds-shadow-resting)]">
          <img
            src="/figures/alphonso-levelup-cheer.webp"
            alt=""
            data-pose="levelup-cheer"
            className="stp-pose h-40 w-auto"
          />
          <PracticeStars n={stars} size="md" />
          <h2 className="ds-type-title font-extrabold">Practised {rounds.length} words</h2>
          <p data-testid="sir-clearly" className="ds-type-headline font-extrabold text-ds-brand">
            {clearlyLine(greatFirst, rounds.length)}
          </p>
          <p className="ds-type-body text-ds-ink-soft">
            Every word you say out loud sticks a little more.
          </p>
          <div className="mt-2 grid w-full gap-2.5">
            <button
              type="button"
              onClick={() => {
                setSession((s) => s + 1);
                setIndex(0);
                setPhase("ask");
                setGreatFirst(0);
                setGreatShown(0);
                setVerdict(null);
                setLine(BUBBLE.ask);
              }}
              className={edgeButtonClass("primary")}
            >
              Practise more
            </button>
            <button type="button" onClick={onExit} className={edgeButtonClass("secondary")}>
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  const last = index + 1 >= rounds.length;
  const listening = recording || transcribing;
  const pose = poseFor(phase, listening, verdict, greatShown);
  const bubbleLine = recording
    ? BUBBLE.listening
    : transcribing
      ? BUBBLE.checking
      : phase === "ask"
        ? BUBBLE.ask
        : line;
  const lineKind = phase === "result" && verdict !== "great" ? "moveon" : (verdict ?? undefined);

  return (
    <div
      data-say-it-right="round"
      data-phase={phase}
      data-verdict={verdict ?? ""}
      data-pose={pose}
      className={shell}
    >
      {header}
      <p className="mb-3 text-center ds-type-caption font-extrabold text-ds-ink-soft">
        Word {index + 1} of {rounds.length}
      </p>
      <div className="mx-auto grid w-full max-w-sm gap-4">
        {/* Alphonso, in pose, with the word in his speech bubble. */}
        <div className="flex items-end gap-2" data-testid="sir-tutor">
          <img
            key={pose}
            src={`/figures/alphonso-${pose}.webp`}
            alt=""
            data-pose={pose}
            className="stp-pose h-44 w-auto hidden shrink-0 min-[20rem]:block"
          />
          <div className="relative mb-6 grid min-w-0 flex-1 justify-items-center gap-1 rounded-[22px] border-[1.5px] border-ds-line bg-ds-card px-4 py-4 text-center shadow-[var(--ds-shadow-floating)] before:absolute before:-left-[7px] before:bottom-5 before:size-[13px] before:rotate-45 before:border-b-[1.5px] before:border-l-[1.5px] before:border-ds-line before:bg-ds-card before:content-['']">
            {/* The one live region of the round: the line changes with every state, the hint beside the mic does not announce. */}
            <p
              aria-live="polite"
              data-testid="sir-line"
              data-verdict-message={lineKind}
              className="ds-type-footnote font-extrabold text-ds-ink-soft"
            >
              {bubbleLine}
            </p>
            <p lang={course} className="break-words ds-type-display font-extrabold text-ds-brand">
              {word.term}
            </p>
            {word.meaning && (
              <p className="ds-type-caption font-semibold text-ds-ink-soft">{word.meaning}</p>
            )}
            <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => void playModel(word.term)}
                className="flex items-center gap-1.5 rounded-full bg-ds-choice-tint px-4 py-2 ds-type-footnote font-bold text-ds-choice"
              >
                <DsIcon name="speaker" className="size-4" />
                Hear it
              </button>
              {/* Replays the same audio at a slower rate in the browser: no second text-to-speech call. */}
              <button
                type="button"
                onClick={() => audio.toggleModel(word.term, true)}
                aria-pressed={audio.playing?.kind === "model" && audio.playing.slow}
                data-testid="sir-slower"
                className="flex items-center gap-1.5 rounded-full bg-ds-choice-tint px-4 py-2 ds-type-footnote font-bold text-ds-choice aria-pressed:bg-ds-choice aria-pressed:text-ds-on-choice"
              >
                <DsIcon name="clock" className="size-4" />
                Say it slower
              </button>
            </div>
          </div>
        </div>

        {phase !== "ask" && audio.hasYou && (
          <div data-testid="sir-compare" className="grid grid-cols-1 gap-3 min-[24rem]:grid-cols-2">
            <SirWave
              who="You"
              label="Play your recording"
              peaks={audio.youPeaks}
              playing={audio.playing?.kind === "you"}
              progress={audio.progress}
              reduceMotion={reduceMotion}
              tone="you"
              testId="sir-wave-you"
              onClick={audio.toggleYou}
            />
            <SirWave
              who="Alphonso"
              label="Play Alphonso's version"
              peaks={audio.modelPeaks}
              playing={audio.playing?.kind === "model" && !audio.playing.slow}
              progress={audio.progress}
              reduceMotion={reduceMotion}
              tone="model"
              testId="sir-wave-model"
              onClick={() => audio.toggleModel(word.term)}
            />
          </div>
        )}

        {phase !== "result" && (
          <div className="grid justify-items-end gap-3">
            {recordingOff ? (
              <div role="status" className="grid w-full gap-3 rounded-[18px] bg-ds-card p-4">
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
                <SirMic
                  recording={recording}
                  disabled={transcribing}
                  onPointerDown={press}
                  onPointerUp={release}
                  onPointerCancel={abandon}
                  onPointerLeave={abandon}
                  onClick={toggle}
                />
                <p id="sir-hint" className="ds-type-caption text-ds-ink-soft">
                  {recording
                    ? "Listening. Let go or tap to send."
                    : transcribing
                      ? "Checking how clear that was…"
                      : phase === "retry"
                        ? BUBBLE.retry
                        : "Hold to talk, or tap to start and tap to stop."}
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
              className={`${edgeButtonClass("tertiary")} justify-self-center`}
            >
              {last ? "Finish" : "Skip this word"}
            </button>
          </div>
        )}

        {phase === "result" && verdict && (
          <div className="grid justify-items-center gap-3">
            <button type="button" onClick={next} className={edgeButtonClass("right")}>
              {last ? "Finish" : "Next"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The learner's mic: BLUE at rest, RED while recording (deliberately not Say the picture's gold). A button with its
 * state in its name; a ring fills over MAX_RECORD_MS while it records (an instant full ring under Reduce Motion).
 */
function SirMic({
  recording,
  disabled,
  onPointerDown,
  onPointerUp,
  onPointerCancel,
  onPointerLeave,
  onClick,
}: {
  recording: boolean;
  disabled: boolean;
  onPointerDown: () => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  onPointerLeave: () => void;
  onClick: () => void;
}): ReactNode {
  const r = 43;
  const c = 2 * Math.PI * r;
  return (
    <button
      id="sir-record"
      type="button"
      disabled={disabled}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerLeave={onPointerLeave}
      onClick={onClick}
      onContextMenu={(e) => e.preventDefault()}
      aria-label={recording ? "Stop recording" : "Record your answer"}
      aria-pressed={recording}
      aria-describedby="sir-hint"
      data-recording={recording ? "true" : "false"}
      data-testid="sir-mic"
      className="relative grid size-[98px] touch-none select-none place-items-center rounded-full disabled:opacity-50"
    >
      <svg viewBox="0 0 98 98" aria-hidden="true" className="absolute inset-0 size-full -rotate-90">
        <circle
          cx="49"
          cy="49"
          r={r}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={recording ? 0 : c}
          className={`stroke-ds-wrong transition-[stroke-dashoffset] ease-linear motion-reduce:transition-none ${
            recording ? "duration-[6000ms]" /* = MAX_RECORD_MS */ : "duration-200"
          }`}
        />
      </svg>
      <span
        className={`relative grid size-[76px] place-items-center rounded-full ${
          recording
            ? "bg-ds-wrong text-ds-on-wrong shadow-[0_5px_0_var(--c-wrong-edge)]"
            : "bg-ds-choice text-ds-on-choice shadow-[0_5px_0_var(--c-choice-edge)]"
        }`}
      >
        <DsIcon name="mic" className="size-8" />
      </span>
    </button>
  );
}

/** Height of a bar that has no sound in it (and of every bar while the clip cannot be drawn). */
const MIN_BAR = 0.12;

/**
 * One side of "Hear you vs Alphonso": a single button holding a bar waveform. Its name is fixed ("Play your
 * recording" / "Play Alphonso's version") and `aria-pressed` carries the playing state. While it plays the bars sweep
 * from left to right; under Reduce Motion the whole row is simply highlighted (no sweep). A clip that could not be
 * decoded (peaks null) shows a flat row and still plays.
 */
function SirWave({
  who,
  label,
  peaks,
  playing,
  progress,
  reduceMotion,
  tone,
  testId,
  onClick,
}: {
  who: string;
  label: string;
  peaks: number[] | null;
  playing: boolean;
  progress: number;
  reduceMotion: boolean;
  tone: "you" | "model";
  testId: string;
  onClick: () => void;
}): ReactNode {
  const bars = peaks ?? new Array<number>(WAVE_BARS).fill(0);
  const lit = tone === "you" ? "bg-ds-choice" : "bg-ds-brand";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={playing}
      data-testid={testId}
      data-playing={playing ? "true" : "false"}
      data-flat={peaks ? "false" : "true"}
      className="grid min-h-[4.5rem] gap-1.5 rounded-[18px] bg-ds-card p-3 text-left shadow-[inset_0_0_0_1.5px_var(--c-line)] aria-pressed:shadow-[inset_0_0_0_2px_var(--c-brand)]"
    >
      <span aria-hidden="true" className="ds-type-caption font-extrabold text-ds-ink-soft">
        {who}
      </span>
      <span aria-hidden="true" className="flex h-10 items-center gap-[2px]">
        {bars.map((p, i) => {
          const on = playing && (reduceMotion || (i + 1) / bars.length <= progress);
          return (
            <span
              key={i}
              data-bar=""
              data-lit={on ? "true" : "false"}
              style={{ height: `${Math.max(MIN_BAR, p) * 100}%` }}
              className={`min-w-0 flex-1 rounded-full ${on ? lit : "bg-ds-line"}`}
            />
          );
        })}
      </span>
    </button>
  );
}
