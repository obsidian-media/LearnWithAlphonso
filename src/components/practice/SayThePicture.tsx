import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DsIcon } from "../ds/DsIcon";
import { VocabImage } from "../VocabImage";
import { edgeButtonClass } from "../lesson/LessonParts";
import { PracticeStars } from "./PracticeStars";
import { SayItRight } from "./SayItRight";
import { AI_CONSENT_COPY } from "@/lib/ai-consent-copy";
import { useOptionalAiConsent } from "@/lib/ai-consent-context";
import { usePhoneCover } from "@/lib/use-phone-cover";
import { useSpeechCapture } from "@/lib/use-speech-capture";
import { useModelSpeech } from "@/lib/use-model-speech";
import {
  MAX_RECORD_MS,
  MIN_POOL,
  comboCount,
  drawRounds,
  imageWordPool,
  missedWords,
  poseFor,
  saidThePicture,
  saveSentence,
  sessionStars,
  type PictureWord,
  type RoundResult,
} from "@/lib/say-the-picture";
import { releaseStops } from "@/lib/say-it-right";
import { validateSavedWordInput, type SavedWordInput } from "@/lib/saved-word";
import {
  SavedWordError,
  allowsSaving,
  saveErrorFor,
  saveWord,
  type SavedWordResult,
} from "@/lib/saved-word-client";
import type { Course } from "@/data/courses";

/**
 * Say the picture (Practice activity): a word's photo with no text, full-bleed, and the learner says it. A frosted
 * stage at the bottom holds the hold-to-talk ring; Alphonso reacts in pose. A miss reveals the written word ON the
 * photo and plays the model, the learner repeats once, and the session goes on. No hearts, no penalty.
 * Speech goes through the existing /api/stt (the speaking daily quota); the model through /api/tts.
 */
type Phase = "ask" | "right" | "reveal" | "done";
type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; saved: number; skipped: number }
  | { kind: "error"; message: string };

const BUBBLE: Record<"ask" | "listening" | "reveal" | "right", string> = {
  ask: "Have a look. What's this one?",
  listening: "Mm-hm, I'm listening...",
  reveal: "Now say it with me.",
  right: "First try. Brilliant!",
};

export function SayThePicture({
  course,
  onExit,
  save = saveWord,
}: {
  course: Course;
  onExit: () => void;
  /** The save-word call; injectable for tests. */
  save?: (input: SavedWordInput) => Promise<SavedWordResult>;
}) {
  // The live pool is read when a session starts (a new photo batch shows up in the next session).
  const [session, setSession] = useState(0);
  const rounds = useMemo<PictureWord[]>(
    () => drawRounds(imageWordPool(course)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [course, session],
  );
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("ask");
  const [results, setResults] = useState<RoundResult[]>([]);
  const [heard, setHeard] = useState<string | null>(null);
  const [drill, setDrill] = useState<PictureWord[] | null>(null);
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  // The round's full-screen cover on a phone: body scroll locked, the app shell behind it inert (usePhoneCover).
  const [cover, setCover] = useState<HTMLDivElement | null>(null);
  usePhoneCover(cover);
  const word = rounds[index];
  const firstTry = results.filter((r) => r === "first").length;

  const consent = useOptionalAiConsent();
  const needsConsent = !!consent && !consent.granted;
  const consentKnown = !consent || (consent.status !== "loading" && consent.status !== "unknown");
  const wordRef = useRef(word);
  wordRef.current = word;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const indexRef = useRef(index);
  indexRef.current = index;
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
    // A miss (or "Show me the word") ends the run of first-time wins; the word was taught, not earned.
    const at = indexRef.current;
    setResults((r) => (r.length === at ? [...r, "missed"] : r));
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
        const at = indexRef.current;
        setResults((r) => (r.length === at ? [...r, "first"] : r));
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

  // Hold to talk, or tap to start and tap to stop (the same rule as Say it right). A press starts recording; a release
  // after a real hold (LATCH_MS or more) sends it, while a quick tap LATCHES the recording on so a second tap stops it.
  // A plain click (keyboard, screen reader) toggles, so the ring is never a hold-only control. The recording also stops
  // by itself at MAX_RECORD_MS.
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
    void start();
  };
  const release = () => {
    if (!holding.current) return;
    holding.current = false;
    // A quick tap latches the recording on; only a real hold sends on release.
    if (releaseStops(Date.now() - pressedAt.current)) stop();
  };
  // The pointer left the ring (or was cancelled) while held: no click follows and the gesture is not a tap, so the
  // recording stops, and the next keyboard press must not be taken for the click that follows a hold.
  const abandon = () => {
    if (!holding.current) return;
    holding.current = false;
    pressedByPointer.current = false;
    stop();
  };
  // The ring fills over MAX_RECORD_MS; when it is full the recording stops and is sent.
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
    else void start();
  };

  const ring = (size: "lg" | "sm", id?: string) => (
    <MicRing
      id={id}
      size={size}
      recording={recording}
      disabled={transcribing}
      onPointerDown={press}
      onPointerUp={release}
      onPointerCancel={abandon}
      onPointerLeave={abandon}
      onClick={toggle}
    />
  );

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

  if (drill) {
    return <SayItRight course={course} words={drill} onExit={() => setDrill(null)} />;
  }

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
    const missed = missedWords(rounds, results);
    const savable = missed.filter((w) => validateSavedWordInput(saveInput(w, course)).ok);
    const canSave = allowsSaving(course) && savable.length > 0;
    const saveAll = async () => {
      setSaveState({ kind: "saving" });
      let saved = 0;
      try {
        for (const w of savable) {
          await save(saveInput(w, course));
          saved += 1;
        }
      } catch (e) {
        setSaveState({
          kind: "error",
          message: saveErrorFor(e instanceof SavedWordError ? e.kind : "unavailable"),
        });
        return;
      }
      setSaveState({ kind: "saved", saved, skipped: missed.length - savable.length });
    };
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
          <ul
            aria-label="Your pictures"
            data-testid="stp-recap"
            className="mt-1 grid w-full grid-cols-4 gap-2"
          >
            {rounds.map((w, i) => {
              const ok = results[i] === "first";
              return (
                <li
                  key={w.term}
                  data-result={ok ? "first" : "missed"}
                  aria-label={`${w.term}, ${ok ? "said first time" : "missed"}`}
                  className="grid gap-1"
                >
                  <span
                    className={`relative block aspect-square overflow-hidden rounded-[14px] ${
                      ok ? "ring-[3px] ring-ds-action" : "ring-[1.5px] ring-ds-line"
                    }`}
                  >
                    <VocabImage
                      url={w.image.url}
                      alt=""
                      className="absolute inset-0 h-full w-full"
                    />
                    {!ok && (
                      <span
                        aria-hidden="true"
                        className="absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-ds-card text-xs font-extrabold text-ds-brand shadow-[var(--ds-shadow-resting)]"
                      >
                        ↺
                      </span>
                    )}
                  </span>
                  <span lang={course} aria-hidden="true" className="truncate ds-type-caption">
                    {w.term}
                  </span>
                </li>
              );
            })}
          </ul>
          {missed.length > 0 && (
            <div className="grid w-full gap-2 text-left">
              <button
                type="button"
                onClick={() => setDrill(missed)}
                className={edgeButtonClass("secondary")}
              >
                Say it right the ones you missed
              </button>
              {canSave && (
                <button
                  type="button"
                  onClick={() => void saveAll()}
                  disabled={saveState.kind === "saving" || saveState.kind === "saved"}
                  className={edgeButtonClass("secondary")}
                >
                  {saveState.kind === "saving"
                    ? "Adding..."
                    : saveState.kind === "saved"
                      ? "Added to your review deck"
                      : "Add them to your review deck"}
                </button>
              )}
              <p
                role="status"
                aria-live="polite"
                className="text-center ds-type-caption text-ds-ink-soft"
              >
                {saveState.kind === "saved"
                  ? `${saveState.saved} ${saveState.saved === 1 ? "word" : "words"} added to your review deck.${
                      saveState.skipped > 0 ? " Phrases can't be saved, so those stayed out." : ""
                    }`
                  : saveState.kind === "error"
                    ? saveState.message
                    : ""}
              </p>
            </div>
          )}
          <div className="mt-2 grid w-full gap-2.5">
            <button
              type="button"
              onClick={() => {
                setSession((s) => s + 1);
                setIndex(0);
                setPhase("ask");
                setResults([]);
                setHeard(null);
                setSaveState({ kind: "idle" });
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
  const pose = poseFor(phase, recording);
  const combo = comboCount(results);
  const bubble =
    phase === "right"
      ? combo >= 2
        ? `${combo} in a row!`
        : BUBBLE.right
      : recording
        ? BUBBLE.listening
        : phase === "reveal"
          ? BUBBLE.reveal
          : BUBBLE.ask;
  const live = recording
    ? "Listening. Let go or tap to send."
    : transcribing
      ? "Checking what you said…"
      : null;

  return (
    <div
      ref={setCover}
      data-say-the-picture="round"
      data-phase={phase}
      data-pose={pose}
      className="relative flex min-h-dvh flex-col overflow-x-clip bg-ds-brand font-[family-name:var(--ds-font-body)] text-white max-md:fixed max-md:inset-0 max-md:z-40 max-md:overflow-y-auto max-md:overscroll-contain"
    >
      {/* On a phone the round is a full-screen cover over the app's top bar and tab bar. Left in the page it was
          110px taller than the screen, so tapping a button near the bottom scrolled the page and the sticky top bar
          hid the revealed word. */}
      {/* The photo is the hero. While asking, its own description would give the answer away. */}
      {/* Clipped here, not on the screen: the result must never be cut off when the phone is short or the text large. */}
      <div className="absolute inset-0 overflow-hidden" data-stp-backdrop="">
        <VocabImage
          url={word.image.url}
          alt={phase === "ask" ? "A picture of a word to say" : word.image.alt}
          className="stp-kenburns absolute inset-0 h-full w-full"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/10"
        />
      </div>

      <div className="relative z-10 flex items-center gap-2.5 px-3.5 pb-2.5 pt-4">
        <button
          type="button"
          onClick={onExit}
          aria-label="Back to Practice"
          className="grid size-11 place-items-center rounded-full border border-white/25 bg-white/20 text-white backdrop-blur-md"
        >
          <DsIcon name="close" className="size-[18px]" />
        </button>
        <h1 className="sr-only">Say the picture</h1>
        <span className="sr-only">
          Word {index + 1} of {rounds.length}
        </span>
        <div
          aria-hidden="true"
          data-testid="stp-dots"
          className="flex flex-1 items-center justify-center gap-[5px]"
        >
          {rounds.map((w, i) => {
            const kind =
              i === index
                ? "now"
                : results[i] === "first"
                  ? "first"
                  : results[i]
                    ? "missed"
                    : "todo";
            return (
              <i
                key={w.term}
                data-dot={kind}
                className={`h-[7px] rounded-full shadow-sm ${
                  kind === "now"
                    ? "w-5 bg-white"
                    : kind === "first"
                      ? "w-[7px] bg-ds-action"
                      : kind === "missed"
                        ? "w-[7px] bg-white/80"
                        : "w-[7px] bg-white/45"
                }`}
              />
            );
          })}
        </div>
        <span className="size-11" aria-hidden="true" />
      </div>

      {/* Win: the word stamps on, a few sparks, the combo chip. Static under Reduce Motion. */}
      {phase === "right" && (
        <div
          role="status"
          data-testid="stp-win"
          className="relative z-10 mt-2 flex flex-col items-center gap-2"
        >
          <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-24">
            {[
              "left-[18%] top-5 size-5",
              "right-[20%] top-2 size-4 [animation-delay:120ms]",
              "right-[14%] top-[70px] size-[18px] [animation-delay:200ms]",
              "left-[12%] top-[64px] size-4 [animation-delay:280ms]",
            ].map((c) => (
              <DsIcon
                key={c}
                name="star"
                solid
                className={`stp-spark absolute text-ds-on-hero-kick drop-shadow-md ${c}`}
              />
            ))}
          </span>
          <span
            data-testid="stp-combo"
            className="inline-flex items-center gap-1.5 rounded-full bg-ds-surface/95 px-3 py-1 ds-type-footnote font-extrabold text-ds-brand shadow-[var(--ds-shadow-resting)]"
          >
            <DsIcon name="flame" solid className="size-4 text-ds-flame" />
            {combo >= 2 ? `${combo} in a row` : "First try"}
          </span>
          <span
            lang={course}
            className="stp-stamp font-[family-name:var(--ds-font-display)] ds-type-display font-extrabold leading-none tracking-tight text-white drop-shadow-lg"
          >
            {word.term}
          </span>
        </div>
      )}

      {/* A miss reveals the word ON the photo. */}
      {phase === "reveal" && (
        <div
          data-testid="stp-reveal"
          className="relative z-10 mt-3 flex flex-col items-center gap-1.5 px-4 text-center"
        >
          <p className="ds-type-overline font-extrabold text-ds-on-hero-kick">It is</p>
          <p
            lang={course}
            className="stp-stamp font-[family-name:var(--ds-font-display)] ds-type-display font-extrabold leading-none tracking-tight text-white drop-shadow-lg"
          >
            {word.term}
          </p>
          <button
            type="button"
            onClick={() => void playModel(word.term)}
            className="mt-1 inline-flex min-h-11 items-center gap-2 rounded-full bg-ds-action px-4 py-2 ds-type-footnote font-extrabold text-ds-on-action shadow-[0_4px_0_var(--c-action-edge)]"
          >
            <DsIcon name="speaker" className="size-[18px]" />
            Hear it
          </button>
        </div>
      )}

      {/* Alphonso, fully in frame, reacting in pose with a small speech bubble. */}
      <div
        className="relative z-10 mt-auto flex items-end gap-1 overflow-y-clip px-2"
        data-testid="stp-tutor"
      >
        <img
          key={pose}
          src={`/figures/alphonso-${pose}.webp`}
          alt=""
          data-pose={pose}
          className="stp-pose h-[28dvh] max-h-[260px] w-auto drop-shadow-xl max-[420px]:[@media(max-height:640px)]:h-[16dvh]"
        />
        <p
          aria-hidden="true"
          className="relative mb-[22dvh] max-w-[190px] max-[420px]:[@media(max-height:640px)]:mb-[12dvh] rounded-2xl border-[1.5px] border-ds-line bg-white px-3 py-2 ds-type-footnote font-bold leading-snug text-ds-ink shadow-[var(--ds-shadow-floating)] before:absolute before:-left-[7px] before:bottom-3 before:size-[13px] before:rotate-45 before:border-b-[1.5px] before:border-l-[1.5px] before:border-ds-line before:bg-white before:content-['']"
        >
          {bubble}
        </p>
      </div>

      {/* The frosted control stage. */}
      <div className="relative z-10 grid justify-items-center gap-2.5 rounded-t-[30px] border-t-[1.5px] border-white/70 bg-ds-surface/95 px-[18px] pb-[calc(18px+env(safe-area-inset-bottom,0px))] pt-4 text-ds-ink shadow-[var(--ds-shadow-floating)] backdrop-blur-xl">
        {phase === "ask" && (
          <>
            {ring("lg", "stp-record")}
            <p
              id="stp-hint"
              className="ds-type-caption font-semibold text-ds-ink-soft"
              aria-live="polite"
            >
              {live ?? "What is this? Hold to talk, or tap to start and tap to stop."}
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
          </>
        )}

        {phase === "right" && (
          <>
            <button type="button" onClick={next} className={`${edgeButtonClass("right")} w-full`}>
              {last ? "Finish" : "Next"}
            </button>
          </>
        )}

        {phase === "reveal" && (
          <>
            <p
              id="stp-hint"
              className="text-center ds-type-caption font-semibold text-ds-ink-soft"
              aria-live="polite"
            >
              {live ?? (heard ? "Nice. That is it for this word." : "Now say it once yourself.")}
            </p>
            {error && (
              <p
                role="alert"
                className="rounded-full bg-ds-wrong-tint px-3 py-1 ds-type-caption text-ds-wrong-ink"
              >
                {error}
              </p>
            )}
            {!heard && canRecord && !needsConsent && ring("sm")}
            <button
              type="button"
              onClick={next}
              disabled={recording || transcribing}
              className={`${edgeButtonClass(heard ? "primary" : "secondary")} w-full`}
            >
              {last ? "Finish" : "Next word"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function saveInput(w: PictureWord, course: Course): SavedWordInput {
  return { word: w.term, sentence: saveSentence(w), course };
}

/**
 * The gold mic inside a ring that fills while it is held, red while recording. A button with its state and the hold
 * instructions in its name; the fill is a transition that Reduce Motion turns into an instant full ring.
 */
function MicRing({
  id,
  size,
  recording,
  disabled,
  onPointerDown,
  onPointerUp,
  onPointerCancel,
  onPointerLeave,
  onClick,
}: {
  id?: string;
  size: "lg" | "sm";
  recording: boolean;
  disabled: boolean;
  onPointerDown: () => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  onPointerLeave: () => void;
  onClick: () => void;
}): ReactNode {
  const box = size === "lg" ? "size-[98px]" : "size-[76px]";
  const core = size === "lg" ? "size-[76px]" : "size-14";
  const r = 43;
  const c = 2 * Math.PI * r;
  return (
    <button
      id={id}
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
      aria-describedby="stp-hint"
      data-recording={recording ? "true" : "false"}
      data-testid="stp-mic"
      className={`relative grid touch-none select-none place-items-center rounded-full disabled:opacity-50 ${box}`}
    >
      <svg viewBox="0 0 98 98" aria-hidden="true" className="absolute inset-0 size-full -rotate-90">
        <circle cx="49" cy="49" r={r} fill="none" strokeWidth="4" className="stroke-ds-ink/10" />
        <circle
          data-testid="stp-ring"
          cx="49"
          cy="49"
          r={r}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={recording ? 0 : c}
          className={`transition-[stroke-dashoffset] ease-linear motion-reduce:transition-none ${
            recording
              ? "stroke-ds-wrong duration-[6000ms]" /* = MAX_RECORD_MS */
              : "stroke-ds-action duration-200"
          }`}
        />
      </svg>
      <span
        className={`relative grid place-items-center rounded-full ${core} ${
          recording
            ? "bg-ds-wrong text-ds-on-wrong shadow-[0_5px_0_var(--c-wrong-edge)]"
            : "bg-[linear-gradient(180deg,var(--c-action-hi)_0%,var(--c-action)_55%)] text-ds-on-action shadow-[0_5px_0_var(--c-action-edge)]"
        }`}
      >
        <DsIcon name="mic" className={size === "lg" ? "size-8" : "size-6"} />
      </span>
    </button>
  );
}
