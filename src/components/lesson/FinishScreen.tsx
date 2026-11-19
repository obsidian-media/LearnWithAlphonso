/**
 * The end of a lesson: Not saved yet (the completion did not reach the server) and the finish celebration. Kept out
 * of the lesson route file on purpose: TanStack's code splitter leaves a route file's extra exports in the
 * always-loaded half of the route, so an export there put the whole curriculum in the entry chunk of every page.
 */
import { Link } from "@tanstack/react-router";
import { PracticeWithHector } from "../../components/PracticeWithHector";
import { usePrefersReducedMotion } from "../../lib/use-prefers-reduced-motion";
import { lessonRewardChips } from "../../lib/lesson-rewards";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AnswerExplanation } from "../../components/AnswerFeedback";
import { DsIcon } from "../../components/ds/DsIcon";
import {
  AlphonsoBubble,
  edgeButtonClass,
  LessonAnswer,
  LessonChip,
  LessonRoom,
} from "../../components/lesson/LessonParts";
import { AchievementUnlockSheet } from "../../components/AchievementUnlockSheet";
import { LeaguePromotionTakeover } from "../../components/lesson/LeaguePromotionTakeover";
import { AchievementToast, Confetti, RewardTiles } from "../../components/lesson/LessonCelebration";
import { roomSrcForUnit } from "../../lib/lesson-stage";
import { lessonXpBreakdown } from "../../lib/lesson-xp";
import { formatElapsed } from "../../lib/lesson-time";
import { finishCues, playSfxCues } from "../../lib/sfx";
import { localeForCourse } from "../../data/courses";
import type { Question } from "../../data/curriculum";
import { canSpeak, speak } from "../../lib/speech";
import { useProgress } from "../../lib/progress";
import { ACHIEVEMENTS_BY_ID, type LeagueTier } from "../../data/achievements";
import { authHeaders } from "../../lib/auth-headers";
import { readApiError } from "../../lib/read-api-error";

/** The end of a lesson whose completion did not reach the server: nothing is celebrated until it is saved. */
export function NotSavedScreen({
  roomSrc,
  notice,
  saving,
  onRetry,
}: {
  roomSrc: string;
  /** Replaces the connection line, e.g. when the server asked the learner to slow down. */
  notice?: string;
  saving: boolean;
  onRetry: () => void;
}) {
  return (
    <div data-stage="not-saved" className="flex flex-1 flex-col">
      <LessonRoom roomSrc={roomSrc} expression="hmm" height={320} alphonsoWidth={290} />
      <div className="relative z-[4] grid gap-2 px-4 pb-4 pt-4 text-center">
        <h1 className="ds-type-title text-ds-ink">Not saved yet</h1>
        <p role="status" className="ds-type-body text-ds-ink-soft">
          {notice ??
            "Your lesson didn't reach us. Your answers are still here: check your connection and try again."}
        </p>
      </div>
      <div className="sticky bottom-0 z-20 mt-auto grid gap-2 bg-ds-surface/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <button onClick={onRetry} disabled={saving} className={edgeButtonClass("primary")}>
          {saving ? "Saving…" : "Try again"}
        </button>
        <Link to="/learn" className={edgeButtonClass("tertiary")}>
          Leave without saving
        </Link>
      </div>
    </div>
  );
}

/** Makes each finish screen's cue key unique (two screens in the same millisecond); no randomness needed. */
let finishScreenSeq = 0;

export function FinishScreen({
  xp,
  awardedCorrect,
  unlocked,
  heartsBonus,
  lessonTitle,
  correct,
  total,
  missedQs,
  lessonId,
  course,
  roomSrc = roomSrcForUnit(undefined),
  elapsedMs,
  saved = true,
  notice,
  promotion,
}: {
  xp: number;
  /** The league this completion moved the learner up from and to: the takeover opens after the celebration. */
  promotion?: { from: LeagueTier; to: LeagueTier };
  /** The server's count of right answers behind `xp`; the XP lines use it, so a re-grade is never called a replay. */
  awardedCorrect?: number;
  unlocked: string[];
  heartsBonus: "streak" | "perfect" | null;
  /** False when the completion did not reach the server: then no streak is shown, since none was confirmed. */
  saved?: boolean;
  /** A calm line shown instead of a save failure, e.g. when the server asked the learner to slow down. */
  notice?: string;
  lessonTitle: string;
  correct: number;
  total: number;
  missedQs: { q: Question; yours: string }[];
  lessonId: string;
  course: string;
  /** The unit's room: the celebration happens where the lesson did. */
  roomSrc?: string;
  /** The lesson's time on screen, for the Time tile. */
  elapsedMs?: number;
}) {
  const streak = useProgress((s) => s.streak);
  const reduceMotion = usePrefersReducedMotion();
  // What the server counted right (it re-grades every answer); the client's own tally only when it sent none.
  const rightCount = awardedCorrect ?? correct;
  const chips = lessonRewardChips({
    xp,
    streak: saved ? streak : null,
    correct: rightCount,
    total,
  });
  // He says "wow", then smiles (1.4 s in). Under Reduce Motion he is already smiling.
  const [amazed, setAmazed] = useState(!reduceMotion);
  // The jingle with the confetti, then XP and any achievement as their tiles land. Keyed per screen, so a re-render
  // (or React's development double effect) never plays them twice. Sound plays under Reduce Motion too.
  const [cueKey] = useState(() => `finish:${lessonId}:${Date.now()}:${++finishScreenSeq}`);
  const cueXp = saved ? xp : 0;
  const cueUnlocked = unlocked.length;
  useEffect(
    () => playSfxCues(finishCues({ xp: cueXp, unlocked: cueUnlocked }), cueKey),
    [cueKey, cueXp, cueUnlocked],
  );
  useEffect(() => {
    if (reduceMotion) return;
    const t = window.setTimeout(() => setAmazed(false), 1400);
    return () => window.clearTimeout(t);
  }, [reduceMotion]);
  // A new badge gets its own sheet once the tiles and toasts have landed (straight away under Reduce Motion).
  // A league promotion comes first (2.4 s in, CD 01); a new badge waits until Continue has closed it.
  const [promotionOpen, setPromotionOpen] = useState(false);
  const [promotionShown, setPromotionShown] = useState(false);
  const hasPromotion = promotion !== undefined;
  useEffect(() => {
    if (!hasPromotion) return;
    const t = window.setTimeout(
      () => {
        setPromotionOpen(true);
        setPromotionShown(true);
      },
      reduceMotion ? 300 : 2400,
    );
    return () => window.clearTimeout(t);
  }, [hasPromotion, reduceMotion]);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const waitingForPromotion = hasPromotion && (!promotionShown || promotionOpen);
  useEffect(() => {
    if (cueUnlocked === 0 || waitingForPromotion) return;
    const t = window.setTimeout(() => setUnlockOpen(true), reduceMotion ? 300 : 2800);
    return () => window.clearTimeout(t);
  }, [cueUnlocked, reduceMotion, waitingForPromotion]);
  // Only a saved completion has a real award to explain; the lines always add up to it (lesson-xp.ts).
  const xpLines = saved ? lessonXpBreakdown({ correct: rightCount, total, awarded: xp }).lines : [];
  const headline = total > 0 ? `Nice work! You got ${rightCount} of ${total}.` : "Nice work!";
  return (
    <div data-stage="complete" className="flex flex-1 flex-col">
      <motion.div
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <LessonRoom
          roomSrc={roomSrc}
          expression={amazed ? "wow" : "happy"}
          height={430}
          alphonsoWidth={345}
          glow
          overlay={
            <>
              <Confetti reduce={reduceMotion} />
              <p className="absolute inset-x-0 top-12 z-[5] text-center ds-type-display-x-l text-ds-on-hero [text-shadow:0_2px_16px_color-mix(in_srgb,var(--c-hero-b)_45%,transparent)]">
                Lesson complete
              </p>
            </>
          }
        />
      </motion.div>
      <div className="relative z-[4] grid gap-3.5 px-4 pb-4">
        <div className="-mt-9">
          <AlphonsoBubble
            label="Alphonso says"
            compact
            heading={false}
            onPlay={canSpeak() ? () => speak(headline, localeForCourse("en")) : undefined}
            playLabel="Hear Alphonso"
          >
            {headline}
          </AlphonsoBubble>
        </div>
        <h2 className="sr-only">{lessonTitle}</h2>
        {notice ? (
          <p role="status" className="text-center ds-type-footnote text-ds-ink-soft">
            {notice}
          </p>
        ) : null}
        <RewardTiles
          chips={chips}
          time={elapsedMs === undefined ? null : formatElapsed(elapsedMs)}
          reduce={reduceMotion}
        />
        {xpLines.length > 1 && (
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
            {xpLines.map((line) => (
              <span
                key={line.kind}
                data-xp-line={line.xp}
                className="ds-type-footnote text-ds-ink-soft"
              >
                {`${line.label} ${line.xp < 0 ? "−" : "+"}${Math.abs(line.xp)}`}
              </span>
            ))}
          </div>
        )}
        <p className="text-center ds-type-footnote tabular-nums text-ds-ink-soft">
          {rightCount}/{total} correct
        </p>
        {heartsBonus && (
          <span className="justify-self-center">
            <LessonChip icon="heart" tone="heart">
              {heartsBonus === "streak"
                ? "Streak milestone: hearts fully refilled"
                : "Perfect lesson: +1 heart"}
            </LessonChip>
          </span>
        )}

        <AnimatePresence>
          {unlocked.length > 0 && (
            <div className="grid gap-2">
              {unlocked.map((id, i) => {
                const a = ACHIEVEMENTS_BY_ID[id];
                if (!a) return null;
                return (
                  <AchievementToast key={id} achievement={a} index={i} reduce={reduceMotion} />
                );
              })}
            </div>
          )}
        </AnimatePresence>

        {promotionOpen && promotion && (
          <LeaguePromotionTakeover
            from={promotion.from}
            to={promotion.to}
            onContinue={() => setPromotionOpen(false)}
          />
        )}

        {unlockOpen && (
          <AchievementUnlockSheet ids={unlocked} onDone={() => setUnlockOpen(false)} />
        )}

        <PracticeWithHector />

        {missedQs.length > 0 && (
          <div className="grid gap-2 text-left">
            <p className="ds-type-overline text-ds-ink-soft">
              Review · {missedQs.length} to practice again
            </p>
            {missedQs.map(({ q, yours }, i) => (
              <div
                key={`${q.id}-${i}`}
                className="rounded-[18px] bg-ds-card px-4 py-3 shadow-[var(--ds-shadow-resting)]"
              >
                <p className="ds-type-footnote text-ds-ink">{q.prompt}</p>
                <p className="mt-1 ds-type-caption font-semibold text-ds-ink-soft">
                  You said <span className="line-through">{yours}</span> ·{" "}
                  <span className="text-ds-right-ink">
                    {q.type === "mc"
                      ? q.choices[q.answer]
                      : q.type === "translate"
                        ? // One of several accepted wordings, so it is shown as
                          // an example rather than as "the" answer.
                          q.acceptableAnswers[0]
                        : q.answer}
                  </span>
                </p>
              </div>
            ))}
          </div>
        )}

        <GeneratedPracticeSection lessonId={lessonId} course={course} />
      </div>

      {/* Pinned to the bottom of the screen: the way on is never scrolled out of view. */}
      <div
        data-finish-footer
        className="sticky bottom-0 z-20 mt-auto bg-ds-surface/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-1px_0_var(--c-line)]"
      >
        <Link to="/learn" className={edgeButtonClass("primary")}>
          Continue
        </Link>
      </div>
    </div>
  );
}

/** Mirrors generate-practice.ts's response shape exactly. Defined locally
 * rather than imported from practice-generation.server.ts -- that module
 * is server-only, this is client-rendered. */
type GeneratedPracticeQuestion = {
  prompt: string;
  choices: string[];
  answerIndex: number;
  explanation: string;
};

/**
 * V3 pkg 4b: "generative sentence content." On-demand extra practice a
 * learner can do immediately after finishing a lesson -- entirely
 * ephemeral (component-local state only), never touching XP/hearts/review
 * scheduling, same posture as in-lesson reinforcement above.
 */
function GeneratedPracticeSection({ lessonId, course }: { lessonId: string; course: string }) {
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "empty" | "error">("idle");
  const [questions, setQuestions] = useState<GeneratedPracticeQuestion[]>([]);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  async function generate() {
    setStatus("loading");
    setErrorText(null);
    try {
      const resp = await fetch("/api/generate-practice", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ lessonId, course }),
      });
      if (resp.status === 429) {
        setErrorText((await readApiError(resp)) || null);
        setStatus("error");
        return;
      }
      if (!resp.ok) throw new Error("request failed");
      const data = (await resp.json()) as { questions: GeneratedPracticeQuestion[] };
      if (data.questions.length === 0) {
        setStatus("empty");
        return;
      }
      setQuestions(data.questions);
      setIdx(0);
      setPicked(null);
      setChecked(false);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }

  if (status !== "ready") {
    return (
      <div className="w-full">
        <button
          onClick={() => void generate()}
          disabled={status === "loading"}
          className={edgeButtonClass("tertiary")}
        >
          {status === "loading" ? "Writing more practice…" : "Generate more practice"}
          <DsIcon name="chevron" className="size-5" />
        </button>
        {status === "empty" && (
          <p className="mt-2 text-center ds-type-caption text-ds-ink-soft">
            Couldn't generate practice for this lesson right now.
          </p>
        )}
        {status === "error" && (
          <p className="mt-2 text-center ds-type-caption text-ds-ink-soft">
            {errorText ?? "Something went wrong. Try again."}
          </p>
        )}
      </div>
    );
  }

  if (idx >= questions.length) {
    return (
      <div className="w-full rounded-[18px] bg-ds-card p-4 text-center ds-type-footnote text-ds-ink-soft shadow-[var(--ds-shadow-resting)]">
        Nice work — that's all the extra practice for this lesson.
      </div>
    );
  }

  const q = questions[idx];
  const isCorrect = picked === q.answerIndex;

  return (
    <div className="w-full text-left">
      <p className="ds-type-overline text-ds-ink-soft">
        Extra practice · {idx + 1}/{questions.length}
      </p>
      <p className="mt-2 ds-type-headline text-ds-brand">{q.prompt}</p>
      <div className="mt-3 grid gap-2">
        {q.choices.map((c, i) => (
          <LessonAnswer
            key={i}
            index={i}
            label={c}
            checked={checked}
            isPicked={picked === i}
            isRight={q.answerIndex === i}
            disabled={checked}
            onClick={() => setPicked(i)}
          />
        ))}
      </div>
      {checked && (
        <div
          role="status"
          data-verdict={isCorrect ? "correct" : "wrong"}
          className={`mt-3 rounded-[18px] px-4 py-3 ${isCorrect ? "bg-ds-right-tint" : "bg-ds-wrong-tint"}`}
        >
          <p
            className={`ds-type-headline font-extrabold ${isCorrect ? "text-ds-right-ink" : "text-ds-wrong-ink"}`}
          >
            {isCorrect ? "Nice." : "Not quite."}
          </p>
          <AnswerExplanation
            explanation={q.explanation}
            saveCourse={course}
            className="mt-0.5 ds-type-body text-ds-ink"
          />
        </div>
      )}
      <button
        disabled={!checked && picked === null}
        onClick={() => {
          if (!checked) {
            setChecked(true);
            return;
          }
          setIdx((i) => i + 1);
          setPicked(null);
          setChecked(false);
        }}
        className={`mt-4 ${edgeButtonClass("primary")}`}
      >
        {!checked ? "Check" : idx < questions.length - 1 ? "Next" : "Finish practice"}
      </button>
    </div>
  );
}
