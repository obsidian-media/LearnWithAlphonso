import { AnimatePresence, motion } from "framer-motion";
import { useSyncExternalStore, type ReactNode } from "react";
import { DsIcon } from "../ds/DsIcon";
import { expressionSrc, type LessonExpression } from "../../lib/lesson-stage";
import { usePrefersReducedMotion } from "../../lib/use-prefers-reduced-motion";

/**
 * The lesson's parts in the round-6 design system (the approved A+B mix, Royal by default): the unit's room with
 * Alphonso and the HUD, his speech bubble, the numbered answer buttons, the pressable buttons and the verdict sheet.
 * Every colour and type size is a token (--c-* / ds-type-*), so Meadow is a palette switch and nothing else.
 * The iOS LessonStageViews and Android LessonStage draw the same parts.
 */

const subscribeToResize = (notify: () => void) => {
  window.addEventListener("resize", notify);
  return () => window.removeEventListener("resize", notify);
};

/** The window's height, 0 on the server and in the first hydration paint (roomLayout reads 0 as a tall phone). */
export function useViewportHeight(): number {
  return useSyncExternalStore(
    subscribeToResize,
    () => window.innerHeight,
    () => 0,
  );
}

// ---------------------------------------------------------------- buttons

export type EdgeVariant = "primary" | "secondary" | "tertiary" | "right" | "wrong";

const EDGE_BASE =
  "inline-flex min-h-14 w-full items-center justify-center gap-2.5 rounded-[var(--ds-radius-control)] px-6 ds-type-headline font-extrabold transition-[transform,box-shadow,opacity] duration-[var(--ds-duration-press)] ease-[var(--ds-ease-out)] motion-reduce:transition-none disabled:cursor-default";

const EDGE_VARIANT: Record<EdgeVariant, string> = {
  primary:
    "bg-[linear-gradient(180deg,var(--c-action-hi)_0%,var(--c-action)_55%)] text-ds-on-action shadow-[inset_0_1px_0_color-mix(in_srgb,var(--c-card)_45%,transparent),0_5px_0_var(--c-action-edge)] active:translate-y-1 active:shadow-[0_1px_0_var(--c-action-edge)] disabled:translate-y-[5px] disabled:bg-none disabled:bg-ds-sunk disabled:text-ds-ink-faint disabled:shadow-none",
  secondary:
    "bg-ds-card text-ds-brand shadow-[inset_0_0_0_2px_var(--c-line),0_4px_0_var(--c-line)] active:translate-y-[3px] active:shadow-[inset_0_0_0_2px_var(--c-line),0_1px_0_var(--c-line)] disabled:opacity-60",
  tertiary: "min-h-11 bg-transparent text-ds-choice active:opacity-60 disabled:opacity-50",
  right:
    "bg-ds-right text-ds-on-right shadow-[0_5px_0_var(--c-right-edge)] active:translate-y-1 active:shadow-[0_1px_0_var(--c-right-edge)]",
  wrong:
    "bg-ds-wrong text-ds-on-wrong shadow-[0_5px_0_var(--c-wrong-edge)] active:translate-y-1 active:shadow-[0_1px_0_var(--c-wrong-edge)]",
};

/** The pressable button's classes, for a <button> or a router <Link>. Disabled primary sinks flat ("off"). */
export function edgeButtonClass(variant: EdgeVariant): string {
  return `${EDGE_BASE} ${EDGE_VARIANT[variant]}`;
}

// ---------------------------------------------------------------- HUD

/** Close, the thick progress bar and the hearts pill, floating over the room. */
export function LessonHud({
  progress,
  hearts,
  onClose,
  onLight = false,
  valueText,
}: {
  /** 0 to 1. */
  progress: number;
  /** A number, or null for Alphonso Pro (unlimited, shown as ∞). */
  hearts: number | null;
  onClose: () => void;
  /** On a plain screen (no room behind it): solid pills and a sunk track. */
  onLight?: boolean;
  /** What a screen reader says for the bar, e.g. "Question 3 of 8". */
  valueText?: string;
}) {
  const pct = Math.round(Math.max(0, Math.min(1, progress)) * 100);
  const pill = onLight ? "bg-ds-card" : "bg-ds-card/90";
  return (
    <div data-lesson-hud="" className="flex items-center gap-3">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className={`grid size-10 shrink-0 place-items-center rounded-full ${pill} text-ds-brand shadow-[var(--ds-shadow-resting)]`}
      >
        <DsIcon name="close" className="size-5" />
      </button>
      <div
        role="progressbar"
        aria-label="Lesson progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={valueText}
        className={`h-4 min-w-0 flex-1 overflow-hidden rounded-lg ${onLight ? "bg-ds-sunk" : "bg-ds-card/60"} shadow-[inset_0_1px_2px_color-mix(in_srgb,var(--c-hero-b)_22%,transparent)]`}
      >
        <div
          data-progress-fill=""
          className="h-full rounded-lg bg-ds-action shadow-[inset_0_-3px_0_color-mix(in_srgb,var(--c-action-edge)_60%,transparent),inset_0_3px_0_color-mix(in_srgb,var(--c-card)_42%,transparent)] transition-[width] duration-[var(--ds-duration-progress)] ease-[var(--ds-ease-out)] motion-reduce:transition-none"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span
        data-hearts=""
        aria-label={hearts === null ? "Unlimited hearts" : `${hearts} hearts`}
        className={`flex h-10 shrink-0 items-center gap-1.5 rounded-full ${pill} pl-2.5 pr-3.5 ds-type-headline font-extrabold tabular-nums text-ds-ink shadow-[var(--ds-shadow-resting)]`}
      >
        <DsIcon name="heart" solid className="size-[22px] text-ds-heart" />
        <span aria-hidden="true">{hearts === null ? "∞" : hearts}</span>
      </span>
    </div>
  );
}

// ---------------------------------------------------------------- room

const EXPRESSION_ALT: Record<LessonExpression, string> = {
  talk: "Alphonso, talking",
  neutral: "Alphonso, listening",
  happy: "Alphonso, smiling",
  hmm: "Alphonso, thinking",
  wow: "Alphonso, amazed",
};

/** One vertical gradient: navy for the HUD, clear over the room, then into the screen colour under the bubble. */
const ROOM_SCRIM =
  "linear-gradient(180deg, color-mix(in srgb, var(--c-hero-b) 46%, transparent) 0, transparent 30%, transparent 62%, var(--c-surface) 100%)";
/** Lesson start: the same top, then darkening under the title so white type reads on any room. */
const ROOM_SCRIM_TITLE =
  "linear-gradient(180deg, color-mix(in srgb, var(--c-hero-b) 46%, transparent) 0, transparent 30%, transparent 48%, color-mix(in srgb, var(--c-hero-b) 72%, transparent) 100%)";
const ROOM_GLOW =
  "radial-gradient(60% 48% at 50% 64%, color-mix(in srgb, var(--c-on-hero-kick) 55%, transparent), transparent 70%)";

/**
 * The unit's room with Alphonso standing in it, bottom-centred and slightly cut by the bubble. His expression swaps
 * with a short crossfade (none under Reduce Motion). `overlay` sits above everything (the HUD, a title, confetti).
 */
export function LessonRoom({
  roomSrc,
  expression,
  height,
  alphonsoWidth,
  glow = false,
  titleScrim = false,
  overlay,
}: {
  roomSrc: string;
  expression: LessonExpression;
  height: number;
  alphonsoWidth: number;
  glow?: boolean;
  /** Darken the foot of the room for a title over it (lesson start). */
  titleScrim?: boolean;
  overlay?: ReactNode;
}) {
  const reduce = usePrefersReducedMotion();
  return (
    <div
      data-room={roomSrc}
      className="relative shrink-0 overflow-hidden bg-ds-sunk bg-cover"
      style={{ height, backgroundImage: `url(${roomSrc})`, backgroundPosition: "center 38%" }}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 z-[1]"
        style={{ background: titleScrim ? ROOM_SCRIM_TITLE : ROOM_SCRIM }}
      />
      {glow && (
        <div
          aria-hidden="true"
          className="absolute inset-0 z-[1]"
          style={{ background: ROOM_GLOW }}
        />
      )}
      <AnimatePresence initial={false}>
        <motion.img
          key={expression}
          data-expression={expression}
          src={expressionSrc(expression)}
          alt={EXPRESSION_ALT[expression]}
          decoding="async"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.2 }}
          className="absolute -bottom-3.5 left-1/2 z-[2] max-w-none -translate-x-1/2 select-none"
          style={{ width: alphonsoWidth }}
          draggable={false}
        />
      </AnimatePresence>
      {overlay}
    </div>
  );
}

// ---------------------------------------------------------------- speech bubble

/**
 * Alphonso's line: a play button that reads it aloud, a small label ("Alphonso asks") and the text. The question
 * stays the screen's h2, so headings and screen readers are unchanged. The tail points up at him.
 */
export function AlphonsoBubble({
  label,
  children,
  onPlay,
  playLabel = "Play the question",
  compact = false,
  heading = true,
}: {
  label: string;
  children: ReactNode;
  onPlay?: () => void;
  playLabel?: string;
  compact?: boolean;
  heading?: boolean;
}) {
  const Text = heading ? "h2" : "p";
  return (
    <div
      data-bubble=""
      className="relative grid grid-cols-[44px_minmax(0,1fr)] items-start gap-3 rounded-[var(--ds-radius-bubble)] bg-ds-card py-3.5 pl-3.5 pr-4 shadow-[var(--ds-shadow-floating)]"
    >
      <span
        aria-hidden="true"
        className="absolute -top-[7px] left-1/2 size-[18px] -translate-x-1/2 rotate-45 rounded-[4px] bg-ds-card"
      />
      {onPlay ? (
        <button
          type="button"
          onClick={onPlay}
          aria-label={playLabel}
          className="relative z-[1] grid size-11 place-items-center rounded-full bg-ds-choice-tint text-ds-choice shadow-[inset_0_0_0_1.5px_color-mix(in_srgb,var(--c-choice)_18%,transparent)] active:bg-ds-choice active:text-ds-card"
        >
          <DsIcon name="play" className="size-5" />
        </button>
      ) : (
        <span
          aria-hidden="true"
          className="relative z-[1] grid size-11 place-items-center rounded-full bg-ds-choice-tint text-ds-choice"
        >
          <DsIcon name="speaker" className="size-5" />
        </span>
      )}
      <div className="relative min-w-0 break-words">
        <p className="mb-[3px] mt-0.5 ds-type-overline text-ds-action-text">{label}</p>
        <Text
          className={`${compact ? "ds-type-question-small" : "ds-type-question"} text-pretty text-ds-brand`}
        >
          {children}
        </Text>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- answers

export type AnswerState = "idle" | "selected" | "correct" | "incorrect" | "dimmed";

/** Picked, right, wrong, or dimmed once the verdict is in (any choice that is neither yours nor the answer). */
export function answerState({
  checked,
  isPicked,
  isRight,
}: {
  checked: boolean;
  isPicked: boolean;
  isRight: boolean;
}): AnswerState {
  if (checked && isRight) return "correct";
  if (checked && isPicked) return "incorrect";
  if (checked) return "dimmed";
  return isPicked ? "selected" : "idle";
}

const ANSWER_FACE: Record<AnswerState, string> = {
  idle: "border-ds-line bg-ds-card text-ds-brand shadow-[0_4px_0_var(--c-line)] active:translate-y-[3px] active:shadow-[0_1px_0_var(--c-line)]",
  selected:
    "border-ds-choice bg-ds-choice-tint text-ds-brand shadow-[0_4px_0_var(--c-choice-edge)]",
  correct:
    "border-ds-right bg-ds-right-tint text-ds-right-ink shadow-[0_4px_0_var(--c-right-edge)]",
  incorrect:
    "border-ds-wrong bg-ds-wrong-tint text-ds-wrong-ink shadow-[0_4px_0_var(--c-wrong-edge)]",
  dimmed: "border-ds-line bg-ds-card text-ds-brand opacity-[0.48] shadow-[0_4px_0_var(--c-line)]",
};
const ANSWER_KEY: Record<AnswerState, string> = {
  idle: "border-ds-line bg-ds-card text-ds-ink-soft",
  selected: "border-ds-choice bg-ds-choice text-ds-card",
  correct: "border-ds-right bg-ds-right text-ds-on-right",
  incorrect: "border-ds-wrong bg-ds-wrong text-ds-on-wrong",
  dimmed: "border-ds-line bg-ds-card text-ds-ink-soft",
};

/**
 * A full-width numbered answer with a pressable bottom edge. The number becomes a tick or a cross with the verdict.
 * Long answers wrap; the number lines up with the first line.
 */
export function LessonAnswer({
  index,
  label,
  checked,
  isPicked,
  isRight,
  disabled,
  onClick,
}: {
  index: number;
  label: string;
  checked: boolean;
  isPicked: boolean;
  isRight: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const state = answerState({ checked, isPicked, isRight });
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={isPicked}
      data-answer-state={state}
      // Room for the verdict sheet when the right answer is scrolled into view above it.
      className={`mb-1 scroll-mb-[300px] flex min-h-[62px] w-full items-start gap-3.5 rounded-[var(--ds-radius-control)] border-2 py-4 pl-4 pr-4 text-left ds-type-answer transition-[transform,box-shadow,background-color,border-color] duration-[var(--ds-duration-select)] ease-[var(--ds-ease-out)] motion-reduce:transition-none ${ANSWER_FACE[state]}`}
    >
      <span
        aria-hidden="true"
        className={`-mt-[3px] grid size-[30px] shrink-0 place-items-center rounded-[var(--ds-radius-key)] border-2 ds-type-caption font-extrabold ${ANSWER_KEY[state]}`}
      >
        {state === "correct" ? (
          <DsIcon name="check" className="size-4 [stroke-width:3]" />
        ) : state === "incorrect" ? (
          <DsIcon name="close" className="size-4 [stroke-width:3]" />
        ) : (
          index + 1
        )}
      </span>
      <span className="min-w-0 text-pretty">{label}</span>
    </button>
  );
}

/** A word tile for word banks and sentence building: the answer button's look, without the number. */
export function WordTile({
  word,
  picked = false,
  disabled,
  onClick,
  placed = false,
}: {
  word: string;
  picked?: boolean;
  disabled: boolean;
  onClick: () => void;
  /** A word already placed in the sentence: solid robe blue, tap to take it back. */
  placed?: boolean;
}) {
  const face = placed
    ? "border-ds-choice bg-ds-choice text-ds-card shadow-[0_3px_0_var(--c-choice-edge)]"
    : picked
      ? "border-ds-choice bg-ds-choice-tint text-ds-brand shadow-[0_4px_0_var(--c-choice-edge)]"
      : "border-ds-line bg-ds-card text-ds-brand shadow-[0_4px_0_var(--c-line)] active:translate-y-[3px] active:shadow-[0_1px_0_var(--c-line)]";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={placed ? undefined : picked}
      className={`mb-1 min-h-12 rounded-[14px] border-2 px-4 py-2.5 ds-type-answer transition-[transform,box-shadow] duration-[var(--ds-duration-press)] disabled:opacity-60 motion-reduce:transition-none ${face}`}
    >
      {word}
    </button>
  );
}

// ---------------------------------------------------------------- verdict sheet

/**
 * The verdict, pinned to the bottom of the lesson: Alphonso's face, Exactly! or Not quite, the XP for a right
 * answer, the correct answer first when you missed (with a speaker to hear it), the one-line why, and the button on.
 * It slides up (a fade under Reduce Motion). Long reasons scroll inside it while the button stays put.
 */
export function VerdictSheet({
  correct,
  title,
  xp,
  correctAnswer,
  onHearAnswer,
  explanation,
  extra,
  continueLabel,
  onContinue,
}: {
  correct: boolean;
  title: string;
  /** "+10 XP" style label, or null. */
  xp?: string | null;
  correctAnswer?: string;
  onHearAnswer?: () => void;
  explanation: ReactNode;
  /** Under the reason, above the button: the "Explain in my language" chip on a wrong answer. */
  extra?: ReactNode;
  continueLabel: string;
  onContinue: () => void;
}) {
  const reduce = usePrefersReducedMotion();
  return (
    <motion.div
      role="status"
      aria-live="polite"
      data-verdict={correct ? "correct" : "wrong"}
      initial={reduce ? { opacity: 0 } : { y: "100%" }}
      animate={reduce ? { opacity: 1 } : { y: 0 }}
      transition={reduce ? { duration: 0.15 } : { duration: 0.38, ease: [0.32, 0.72, 0, 1] }}
      className={`sticky bottom-0 z-30 grid gap-3 rounded-t-[var(--ds-radius-sheet)] px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5 shadow-[var(--ds-shadow-sheet)] ${
        correct ? "bg-ds-right-tint" : "bg-ds-wrong-tint"
      }`}
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="size-14 shrink-0 rounded-full bg-ds-card bg-[length:190%] bg-[center_24%] bg-no-repeat shadow-[0_0_0_3px_var(--c-card),var(--ds-shadow-resting)]"
          style={{ backgroundImage: `url(${expressionSrc(correct ? "happy" : "hmm")})` }}
        />
        <p
          className={`ds-type-title font-extrabold ${correct ? "text-ds-right-ink" : "text-ds-wrong-ink"}`}
        >
          {title}
        </p>
        {xp && (
          <span className="ml-auto flex items-center gap-1 rounded-full bg-ds-card px-2.5 py-1 ds-type-footnote font-extrabold text-ds-right-ink">
            <DsIcon name="bolt" solid className="size-4 text-ds-xp" />
            {xp}
          </span>
        )}
      </div>
      {!correct && correctAnswer && (
        <div className="flex items-center gap-2.5 rounded-[14px] bg-ds-card/75 px-3 py-2.5">
          <div className="min-w-0">
            <p className="ds-type-overline text-ds-wrong-ink">Correct answer</p>
            <p className="ds-type-headline text-ds-ink">{correctAnswer}</p>
          </div>
          {onHearAnswer && (
            <button
              type="button"
              onClick={onHearAnswer}
              aria-label="Hear the correct answer"
              className="ml-auto grid size-9 shrink-0 place-items-center rounded-full bg-ds-card text-ds-choice shadow-[inset_0_0_0_1.5px_var(--c-line)]"
            >
              <DsIcon name="speaker" className="size-[18px]" />
            </button>
          )}
        </div>
      )}
      <div
        data-verdict-reason=""
        className="max-h-[116px] overflow-auto pr-1 ds-type-body font-semibold text-ds-ink [mask-image:linear-gradient(var(--c-ink)_70%,transparent)]"
      >
        {explanation}
      </div>
      {extra}
      <button
        type="button"
        onClick={onContinue}
        className={`mt-0.5 ${edgeButtonClass(correct ? "right" : "wrong")}`}
      >
        {continueLabel}
      </button>
    </motion.div>
  );
}

// ---------------------------------------------------------------- chips

export function LessonChip({
  icon,
  tone = "plain",
  children,
}: {
  icon: "clock" | "words" | "bolt" | "heart" | "target" | "book";
  tone?: "plain" | "gold" | "heart";
  children: ReactNode;
}) {
  const face =
    tone === "gold"
      ? "bg-ds-xp-tint text-ds-xp-text"
      : tone === "heart"
        ? "bg-ds-heart-tint text-ds-heart-text"
        : "bg-ds-card text-ds-brand shadow-[inset_0_0_0_1.5px_var(--c-line)]";
  const iconTone =
    tone === "gold" ? "text-ds-xp" : tone === "heart" ? "text-ds-heart" : "text-ds-choice";
  const solid = icon === "bolt" || icon === "heart";
  return (
    <span
      className={`inline-flex h-[34px] items-center gap-1.5 whitespace-nowrap rounded-full pl-2.5 pr-3.5 ds-type-footnote font-bold ${face}`}
    >
      {solid ? (
        <DsIcon name={icon as "bolt" | "heart"} solid className={`size-[18px] ${iconTone}`} />
      ) : (
        <DsIcon
          name={icon as "clock" | "words" | "target" | "book"}
          className={`size-[18px] ${iconTone}`}
        />
      )}
      {children}
    </span>
  );
}
