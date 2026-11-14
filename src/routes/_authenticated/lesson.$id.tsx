import { isCompletionRefusal, SLOW_DOWN_MESSAGE } from "@/lib/anti-farming";
import { track } from "../../lib/analytics";
import { scoreBucket } from "../../lib/analytics-events";
import { createFileRoute, useNavigate, useParams, Link } from "@tanstack/react-router";
import { PracticeWithHector } from "../../components/PracticeWithHector";
import { usePrefersReducedMotion } from "../../lib/use-prefers-reduced-motion";
import { lessonRewardChips } from "../../lib/lesson-rewards";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LessonScreen } from "../../components/lesson/LessonScreen";
import { AnswerExplanation } from "../../components/AnswerFeedback";
import { ExplainInMyLanguage } from "../../components/ExplainInMyLanguage";
import { wrongAnswerRequest } from "../../lib/explain-client";
import { DsIcon } from "../../components/ds/DsIcon";
import {
  AlphonsoBubble,
  edgeButtonClass,
  LessonAnswer,
  LessonChip,
  LessonHud,
  LessonRoom,
  useViewportHeight,
  VerdictSheet,
  WordTile,
} from "../../components/lesson/LessonParts";
import { AchievementUnlockSheet } from "../../components/AchievementUnlockSheet";
import { AchievementToast, Confetti, RewardTiles } from "../../components/lesson/LessonCelebration";
import { lessonExpression, roomLayout, roomSrcForUnit } from "../../lib/lesson-stage";
import { answerXpChip, lessonXpBreakdown, maxLessonXp } from "../../lib/lesson-xp";
import { ActiveTimer, estimateLessonMinutes, formatElapsed } from "../../lib/lesson-time";
import { correctAnswerText, verdictTitle } from "../../lib/answer-verdict";
import { finishCues, playSfx, playSfxCues, SFX_DURATION_MS } from "../../lib/sfx";
import { deckButtonTitle } from "../../lib/vocab-deck";
import { SaveWordProvider } from "../../components/SaveWord";
import { SpeakAnswer } from "../../components/SpeakAnswer";
import { TranslateAnswer } from "../../components/TranslateAnswer";
import { VocabImage } from "../../components/VocabImage";
import { getCourse, localeForCourse, type Course } from "../../data/courses";
import { pickReinforcementQuestion, reshuffleQuestion } from "../../data/bank-engine";
import type { Question } from "../../data/curriculum";
import { VOCAB_IMAGES } from "../../data/vocab-images";
import { canSpeak, speak } from "../../lib/speech";
import { useProgress } from "../../lib/progress";
import { useProStatus } from "../../lib/use-pro-status";
import {
  buyHeartWithXpRemote,
  completeLessonRemote,
  loseHeartRemote,
  restoreHeartsRemote,
  startLessonSession,
} from "../../lib/sync.functions";
import { HeartsModal } from "../../components/HeartsModal";
import { deriveAnswerCorrectness } from "../../lib/srs";
import { useOptionalAiConsent } from "../../lib/ai-consent-context";
import { requestTranslationVerdict } from "../../lib/grade-translation-request";
import type { TranslationVerdict } from "../api/grade-translation";
import { ACHIEVEMENTS_BY_ID } from "../../data/achievements";
import { vocabForLesson, type VocabItem } from "../../data/vocab";
import { authHeaders } from "../../lib/auth-headers";
import { readApiError } from "../../lib/read-api-error";

export const Route = createFileRoute("/_authenticated/lesson/$id")({
  component: LessonPageWithSave,
  head: () => ({
    meta: [
      { title: "Lesson — Alphonso" },
      { name: "description", content: "Practice English with a quick interactive lesson." },
      { property: "og:title", content: "Lesson — Alphonso" },
      { property: "og:description", content: "Practice English with a quick interactive lesson." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "preconnect", href: "https://images.pexels.com" }],
  }),
});

/** Tapping a word in this page's text opens the save dialog (phase 4 of save-any-word). */
function LessonPageWithSave() {
  return (
    <SaveWordProvider>
      <LessonPage />
    </SaveWordProvider>
  );
}

function LessonPage() {
  const { id } = useParams({ from: "/_authenticated/lesson/$id" });
  const navigate = useNavigate();
  const course = useProgress((s) => s.course);
  // The written-translation second opinion sends the learner's answer to the AI grader, so it needs the account's
  // AI consent. Without it (or without a provider) the curated answer list alone decides.
  const aiConsent = useOptionalAiConsent();
  const aiGranted = aiConsent?.granted ?? false;
  const curriculum = useMemo(() => getCourse(course).curriculum, [course]);
  const maybeLesson = useMemo(() => {
    for (const u of curriculum) for (const l of u.lessons) if (l.id === id) return l;
    return null;
  }, [curriculum, id]);
  const lessonLevel = useMemo(() => {
    for (const u of curriculum) if (u.lessons.some((l) => l.id === id)) return u.level;
    return "A1";
  }, [curriculum, id]);
  // V3 pkg 4b: pools backing in-lesson reinforcement -- see
  // pickReinforcementQuestion's doc comment in bank-engine.ts for why
  // these two are kept separate (same-pack vs. wider-level) rather than
  // one combined pool.
  const unit = useMemo(
    () => curriculum.find((u) => u.lessons.some((l) => l.id === id)),
    [curriculum, id],
  );
  const siblingQuestions = useMemo(
    () => (unit?.lessons ?? []).filter((l) => l.id !== id).flatMap((l) => l.questions),
    [unit, id],
  );
  const levelQuestions = useMemo(
    () =>
      curriculum
        .filter((u) => u.level === lessonLevel && u.id !== unit?.id)
        .flatMap((u) => u.lessons.flatMap((l) => l.questions)),
    [curriculum, lessonLevel, unit],
  );

  const applyCompletion = useProgress((s) => s.applyCompletion);
  const loseHeartLocal = useProgress((s) => s.loseHeartLocal);
  const proStatus = useProStatus();
  const state = useProgress();
  const viewportHeight = useViewportHeight();
  const unitNumber = unit ? curriculum.indexOf(unit) + 1 : null;
  const roomSrc = roomSrcForUnit(unit?.id);
  const reduceMotion = usePrefersReducedMotion();

  const [idx, setIdx] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [missedQs, setMissedQs] = useState<{ q: Question; yours: string }[]>([]);
  // Every real (non-reinforcement) question's raw submission, correct or
  // not -- completeLessonRemote re-derives correctness itself from these
  // against the real answer key (§0.1-d #6), rather than trusting which
  // ones this client claims it missed.
  const [answeredQs, setAnsweredQs] = useState<{ questionId: string; answer: string }[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  // "reorder" questions accumulate a sequence of tapped token *indices*
  // (not values, since a sentence can repeat a word) instead of using
  // `picked` directly -- see submittedAnswer below for where these unify.
  const [orderPicks, setOrderPicks] = useState<number[]>([]);
  const [checked, setChecked] = useState(false);
  // A translation's verdict can outrank the local one: the curated phrasings
  // are a floor, and /api/grade-translation is asked about anything they
  // reject. Held in state because `answered` below and the miss bookkeeping in
  // checkAnswer must both use the SETTLED verdict, not the local guess.
  const [translationVerdict, setTranslationVerdict] = useState<TranslationVerdict | null>(null);
  // Only true while that second opinion is in flight, so Check can say so
  // rather than looking frozen.
  const [checking, setChecking] = useState(false);
  // V3 pkg 4b: in-lesson reinforcement, staged in two steps so the
  // learner sees the *missed* question's own feedback first, then the
  // reinforcement question fresh on the next "Continue" -- never affects
  // correct/missed/hearts/XP, purely supplementary practice.
  // `pendingReinforcement` is queued by a miss but not yet shown (the
  // learner is still looking at the missed question's feedback);
  // `activeReinforcement` is the one currently on screen.
  const [pendingReinforcement, setPendingReinforcement] = useState<Question | null>(null);
  const [activeReinforcement, setActiveReinforcement] = useState<Question | null>(null);
  const [done, setDone] = useState<{
    xp: number;
    /** The server's own count of right answers, which `xp` was computed from. */
    awardedCorrect?: number;
    unlocked: string[];
    heartsBonus: "streak" | "perfect" | null;
    saved: boolean;
    /** Set when the server refused the completion as machine-speed (anti-farming.ts); shown calmly, not as an error. */
    notice?: string;
    /** Time on screen from Start lesson to the last answer. */
    elapsedMs?: number;
  } | null>(null);
  const vocab = useMemo(() => vocabForLesson(id, course), [id, course]);
  const [phase, setPhase] = useState<"overview" | "vocab" | "quiz">("overview");
  // Fresh per-mount seed so replaying the same lesson shuffles answer
  // order differently each time, instead of always looking identical.
  const [attemptSeed] = useState(() => `${id}-${Date.now()}-${Math.random()}`);
  const questions = useMemo(
    () =>
      (maybeLesson?.questions ?? []).map((question, i) =>
        reshuffleQuestion(question, `${attemptSeed}-${i}`),
      ),
    [maybeLesson, attemptSeed],
  );

  // When the verdict sheet rises, the list scrolls the right answer into view above it.
  useEffect(() => {
    if (!checked) return;
    document
      .querySelector('[data-answer-state="correct"]')
      ?.scrollIntoView?.({ block: "nearest", behavior: reduceMotion ? "auto" : "smooth" });
  }, [checked, reduceMotion]);

  // The lesson's own time, from Start lesson to the last answer, counted only while the tab is visible.
  const timer = useRef<ActiveTimer | null>(null);
  // Set by the last question's Finish: a second tap while the completion is in flight must not complete the lesson
  // again (the second call would be a zero-XP replay, and whichever answer landed last would set the screen).
  const finishing = useRef(false);
  useEffect(() => {
    const onVisibility = () => {
      const t = timer.current;
      if (!t) return;
      if (document.hidden) t.pause(performance.now());
      else t.resume(performance.now());
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const [sessionToken, setSessionToken] = useState<string | null>(null);
  // The server refuses to start a lesson at 0 hearts. Held here so the page shows the hearts dialog
  // (countdown, XP purchase, review instead) instead of a lesson that could never be saved.
  const [heartsBlock, setHeartsBlock] = useState<{ refillAt: number | null } | null>(null);
  const [buyHeartError, setBuyHeartError] = useState<string | null>(null);
  const [sessionAttempt, setSessionAttempt] = useState(0);
  const heartsXp = useProgress((s) => s.xp);
  const spendXpForHeartLocal = useProgress((s) => s.spendXpForHeartLocal);
  const refillHeartsLocal = useProgress((s) => s.refillHeartsLocal);
  const setHeartsLocal = useProgress((s) => s.setHeartsLocal);
  useEffect(() => {
    if (!maybeLesson) return;
    let alive = true;
    void startLessonSession({ data: { lessonId: maybeLesson.id, course } })
      .then((res) => {
        if (!alive) return;
        if ("error" in res) {
          setHeartsBlock({ refillAt: res.refillAt });
          return;
        }
        setHeartsBlock(null);
        setSessionToken(res.token);
        void track("lesson_started", { lesson_id: maybeLesson.id, level: lessonLevel, course });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [maybeLesson, course, sessionAttempt, lessonLevel]);

  if (!maybeLesson) {
    return (
      <LessonScreen>
        <div className="p-6 text-center">
          <p className="ds-type-footnote text-ds-ink-soft">Lesson not found.</p>
          <Link to="/learn" className="mt-4 inline-block ds-type-footnote text-ds-choice underline">
            Back to learn
          </Link>
        </div>
      </LessonScreen>
    );
  }
  if (heartsBlock) {
    return (
      <LessonScreen>
        <HeartsModal
          open
          refillAt={heartsBlock.refillAt}
          xp={heartsXp}
          buyError={buyHeartError}
          onClose={() => navigate({ to: "/learn" })}
          onRefillDue={() => {
            refillHeartsLocal();
            void restoreHeartsRemote()
              .then((res) => setHeartsLocal(res.hearts, res.heartsRefillAt ?? null))
              .catch(() => {})
              .finally(() => setSessionAttempt((n) => n + 1));
          }}
          onBuyWithXp={() => {
            setBuyHeartError(null);
            void buyHeartWithXpRemote({ data: { course } })
              .then((res) => {
                if (res.ok) {
                  spendXpForHeartLocal(res.cost);
                  setSessionAttempt((n) => n + 1);
                } else {
                  setBuyHeartError(
                    res.reason === "hearts-full"
                      ? "Hearts already full."
                      : "Not enough XP for a heart.",
                  );
                }
              })
              .catch(() => setBuyHeartError("Something went wrong. Try again."));
          }}
          onPracticeInstead={() => navigate({ to: "/review" })}
        />
      </LessonScreen>
    );
  }
  const lesson = maybeLesson;
  const total = questions.length;
  const isReinforcing = activeReinforcement !== null;
  const q: Question = activeReinforcement ?? questions[idx];

  const submittedAnswer =
    q.type === "reorder" ? orderPicks.map((i) => q.tokens[i]).join(" ") : picked;

  async function checkAnswer() {
    if (!submittedAnswer) return;
    // Graded through the shared helper rather than inline, because the review
    // server re-derives correctness from that same helper. A spoken answer in
    // particular needs its tolerant transcript match here and there alike.
    let isCorrect = deriveAnswerCorrectness(q, submittedAnswer, course);
    // A written translation gets a second opinion when the curated phrasings
    // do not already accept it -- there are more right ways to say a thing
    // than any list anticipates. A null verdict (offline, vendor down, quota
    // spent) leaves the local answer standing rather than failing the learner
    // for something that is not about their English.
    if (!isCorrect && q.type === "translate" && !aiGranted) {
      // No AI consent: the curated answer list is the whole verdict, and nothing is sent anywhere.
      setTranslationVerdict({ correct: false, reason: null, source: "local" });
    } else if (!isCorrect && q.type === "translate") {
      // The grader takes a moment: the tap says the press landed.
      playSfx("tap");
      setChecking(true);
      const verdict = await requestTranslationVerdict(
        {
          lessonId: lesson.id,
          questionId: q.id,
          submission: submittedAnswer,
          course,
        },
        () => aiConsent?.markWithdrawn(),
      );
      setChecking(false);
      if (verdict) {
        setTranslationVerdict(verdict);
        isCorrect = verdict.correct;
      } else {
        setTranslationVerdict({ correct: false, reason: null, source: "local" });
      }
    } else if (q.type === "translate") {
      setTranslationVerdict({ correct: true, reason: null, source: "local" });
    }
    setChecked(true);
    // The verdict's sound (a lost heart follows the wrong-answer sound rather than over it). The heart sound plays only
    // when the header really shows one fewer: never for Pro, a reinforcement round, or with no hearts left to lose.
    const losesHeart =
      !isCorrect && !isReinforcing && proStatus.state !== "pro" && state.hearts > 0;
    if (isCorrect) playSfx("right");
    else
      playSfxCues(
        losesHeart
          ? [
              { event: "wrong", atMs: 0 },
              { event: "heartLost", atMs: SFX_DURATION_MS.wrong },
            ]
          : [{ event: "wrong", atMs: 0 }],
        `verdict:${attemptSeed}:${idx}:${isReinforcing ? "r" : "q"}`,
      );
    // Reinforcement rounds are supplementary practice only -- they never
    // touch correct/missed/hearts/XP, regardless of outcome.
    if (isReinforcing) return;
    setAnsweredQs((a) => [...a, { questionId: q.id, answer: submittedAnswer }]);
    if (isCorrect) setCorrect((c) => c + 1);
    else {
      setMissedQs((m) => [...m, { q, yours: submittedAnswer }]);
      // Alphonso Pro has unlimited hearts (the server agrees: lose_heart and the lesson settlement skip Pro).
      if (proStatus.state !== "pro") {
        loseHeartLocal();
        void loseHeartRemote();
      }
      // "Doing well" skews the reinforcement pool wider (see
      // pickReinforcementQuestion's doc comment) -- based on accuracy
      // over prior questions this attempt, not counting this miss.
      // Queued as *pending*, not shown yet -- the learner should see this
      // question's own feedback first; next() promotes it to active.
      const doingWell = idx > 0 && correct / idx >= 0.8;
      const reinforcement = pickReinforcementQuestion({
        siblingQuestions,
        levelQuestions,
        doingWell,
        seed: `${attemptSeed}-reinforce-${idx}`,
      });
      if (reinforcement) {
        setPendingReinforcement(
          reshuffleQuestion(reinforcement, `${attemptSeed}-reinforce-${idx}-r`),
        );
      }
    }
  }

  async function next() {
    playSfx("tap");
    if (pendingReinforcement) {
      setActiveReinforcement(pendingReinforcement);
      setPendingReinforcement(null);
      setPicked(null);
      setOrderPicks([]);
      setChecked(false);
      setTranslationVerdict(null);
      return;
    }
    if (activeReinforcement) {
      setActiveReinforcement(null);
      // falls through: finishing a reinforcement round still needs to
      // advance to the next real question (or finish the lesson) below.
    }
    if (idx < total - 1) {
      setIdx((i) => i + 1);
      setPicked(null);
      setOrderPicks([]);
      setChecked(false);
      // Without this the previous translation's verdict -- including its
      // revealed phrasing -- shows over the next question, which the learner
      // has not answered yet.
      setTranslationVerdict(null);
      return;
    }
    if (finishing.current) return;
    finishing.current = true;
    const elapsedMs = timer.current?.elapsedMs(performance.now());
    timer.current?.pause(performance.now());
    // Misses are re-derived server-side and enrolled by the same atomic
    // transaction as the completion. A separate fire-and-forget write here
    // could leave review items behind when completion failed.
    try {
      const res = await completeLessonRemote({
        data: {
          lessonId: lesson.id,
          total,
          answers: answeredQs,
          course,
          sessionToken: sessionToken ?? "",
        },
      });
      void track("lesson_completed", {
        lesson_id: lesson.id,
        level: lessonLevel,
        course,
        score_bucket: scoreBucket(total > 0 ? (res.correct / total) * 100 : 0),
      });
      const completed = state.completedLessons.includes(lesson.id)
        ? state.completedLessons
        : [...state.completedLessons, lesson.id];
      const today = res.progress.lastActiveDate;
      const activityDates = state.activityDates.includes(today)
        ? state.activityDates
        : [...state.activityDates, today].slice(-30);
      applyCompletion({
        ...res.progress,
        completedLessons: completed,
        activityDates,
        answersByLesson: {
          ...state.answersByLesson,
          // The best score is kept (as the server keeps it), so the next replay's XP chips start from it.
          [lesson.id]: {
            correct: Math.max(state.answersByLesson[lesson.id]?.correct ?? 0, correct),
            total,
          },
        },
        unlockedAchievements: [
          ...state.unlockedAchievements,
          ...res.newlyUnlocked.filter((a) => !state.unlockedAchievements.includes(a)),
        ],
      });
      setDone({
        xp: res.xpGain,
        awardedCorrect: res.correct,
        unlocked: res.newlyUnlocked,
        heartsBonus: res.heartsBonus,
        saved: true,
        elapsedMs,
      });
    } catch (err) {
      setDone({
        xp: 0,
        unlocked: [],
        heartsBonus: null,
        saved: false,
        notice: isCompletionRefusal(err) ? SLOW_DOWN_MESSAGE : undefined,
        elapsedMs,
      });
    }
  }

  const answered =
    q.type === "translate" && translationVerdict
      ? translationVerdict.correct
      : deriveAnswerCorrectness(q, submittedAnswer ?? "", course);

  // The learner's best earlier score on this lesson (the server's lesson_completions row), or null on a first try.
  const previousBest = state.answersByLesson[lesson.id]?.correct ?? null;
  const xpChipLabel = (rightSoFar: number) => {
    const xp = answerXpChip({ rightSoFar, previousBest });
    return xp === null ? null : `+${xp} XP`;
  };

  const close = () => navigate({ to: "/learn" });
  const hud = (progress: number, onLight = false, valueText?: string) => (
    <LessonHud
      progress={progress}
      valueText={valueText}
      hearts={proStatus.state === "pro" ? null : state.hearts}
      onClose={close}
      onLight={onLight}
    />
  );
  const unitLine = unitNumber && unit ? `Unit ${unitNumber} · ${unit.title}` : lesson.subtitle;

  if (done) {
    return (
      <LessonScreen>
        <FinishScreen
          xp={done.xp}
          awardedCorrect={done.awardedCorrect}
          elapsedMs={done.elapsedMs}
          unlocked={done.unlocked}
          heartsBonus={done.heartsBonus}
          saved={done.saved}
          notice={done.notice}
          lessonTitle={lesson.title}
          correct={correct}
          total={total}
          missedQs={missedQs}
          lessonId={lesson.id}
          course={course}
          roomSrc={roomSrc}
        />
      </LessonScreen>
    );
  }
  if (phase === "overview") {
    return (
      <LessonScreen>
        <OverviewScreen
          title={lesson.title}
          unitLine={unitLine}
          words={vocab.length}
          wordSample={vocab.slice(0, 3).map((v) => v.term.replace(/[.!?…]+$/, ""))}
          questions={total}
          minutes={estimateLessonMinutes(questions, vocab.length)}
          maxXp={maxLessonXp(total)}
          roomSrc={roomSrc}
          hud={hud(0)}
          onStart={() => {
            timer.current = new ActiveTimer(performance.now());
            setPhase(vocab.length > 0 ? "vocab" : "quiz");
          }}
        />
      </LessonScreen>
    );
  }
  if (phase === "vocab" && vocab.length > 0) {
    return (
      <LessonScreen>
        <VocabDeckScreen
          items={vocab}
          title={lesson.title}
          subtitle={lesson.subtitle}
          course={course}
          hud={hud(0, true)}
          onStart={() => setPhase("quiz")}
        />
      </LessonScreen>
    );
  }

  const layout = roomLayout({ viewportHeight, prompt: q.prompt });
  const expression = lessonExpression({
    picked: !!submittedAnswer?.trim() || orderPicks.length > 0,
    verdict: checked ? (answered ? "right" : "wrong") : null,
  });
  const hasImage = q.type === "mc" && !!q.imageKey && !!VOCAB_IMAGES[q.imageKey];
  const bubbleLabel = isReinforcing
    ? "Quick practice"
    : q.type === "listening"
      ? "Listening"
      : q.type === "speak"
        ? "Speaking"
        : q.type === "translate"
          ? "Write it yourself"
          : "Alphonso asks";
  const voice = canSpeak();
  // A listening question's button plays what to listen to, in the course's language; any other question's reads the
  // question itself, which is written in English for every course.
  const onPlay =
    q.type === "listening"
      ? voice
        ? () => speak(q.audioText, localeForCourse(course))
        : undefined
      : voice
        ? () => speak(q.prompt, localeForCourse("en"))
        : undefined;
  const hearAnswer = voice ? () => speak(correctAnswerText(q), localeForCourse(course)) : undefined;

  return (
    <LessonScreen>
      <div className="flex flex-1 flex-col">
        <LessonRoom
          roomSrc={roomSrc}
          expression={expression}
          height={layout.roomHeight}
          alphonsoWidth={layout.alphonsoWidth}
          overlay={
            <div className="absolute inset-x-4 top-4 z-20">
              {hud((idx + (checked ? 1 : 0)) / total, false, `Question ${idx + 1} of ${total}`)}
            </div>
          }
        />
        <div className="relative z-[4] flex flex-1 flex-col gap-3 px-4 pb-4">
          <div className={layout.size === "small" ? "-mt-9" : "-mt-11"}>
            <AlphonsoBubble
              label={bubbleLabel}
              onPlay={onPlay}
              playLabel={q.type === "listening" ? "Play audio" : "Play the question"}
              compact={layout.size === "small"}
            >
              {q.prompt}
            </AlphonsoBubble>
          </div>

          {hasImage && q.type === "mc" && q.imageKey && (
            <VocabImage
              url={VOCAB_IMAGES[q.imageKey].url}
              alt=""
              className="h-40 w-full rounded-[18px] shadow-[var(--ds-shadow-resting)]"
            />
          )}
          {/* A listening question is unanswerable without audio, so when the
              browser cannot speak, the sentence is shown instead. Guessing
              one-in-four costs a heart; reading it does not. */}
          {q.type === "listening" && !voice && (
            <div className="rounded-[18px] bg-ds-card px-4 py-3 shadow-[var(--ds-shadow-resting)]">
              <p className="ds-type-caption text-ds-ink-soft">
                Audio is unavailable on this device. Here is what you would hear:
              </p>
              <p className="mt-1 ds-type-headline text-ds-ink">{q.audioText}</p>
            </div>
          )}

          <div data-answers="">
            {q.type === "mc" || q.type === "listening" ? (
              <div className="grid gap-1.5">
                {q.choices.map((c, i) => (
                  <LessonAnswer
                    key={c}
                    index={i}
                    label={c}
                    checked={checked}
                    isPicked={picked === c}
                    // mc stores the answer's index, listening its text.
                    isRight={q.type === "mc" ? q.choices[q.answer] === c : q.answer === c}
                    disabled={checked}
                    onClick={() => setPicked(c)}
                  />
                ))}
              </div>
            ) : q.type === "reorder" ? (
              <div>
                <div
                  data-sentence-slot=""
                  className="mb-3 flex min-h-[60px] flex-wrap content-start gap-2 rounded-[18px] border-2 border-dashed border-ds-line bg-ds-sunk p-3"
                >
                  {orderPicks.length === 0 ? (
                    <span className="self-center ds-type-footnote text-ds-ink-faint">
                      Tap the words below in order
                    </span>
                  ) : (
                    orderPicks.map((tokenIdx, position) => (
                      <WordTile
                        key={`${tokenIdx}-${position}`}
                        word={q.tokens[tokenIdx]}
                        placed
                        disabled={checked}
                        onClick={() => setOrderPicks((arr) => arr.filter((_, i) => i !== position))}
                      />
                    ))
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {q.tokens.map((t, i) =>
                    orderPicks.includes(i) ? null : (
                      <WordTile
                        key={i}
                        word={t}
                        disabled={checked}
                        onClick={() => setOrderPicks((arr) => [...arr, i])}
                      />
                    ),
                  )}
                </div>
              </div>
            ) : q.type === "speak" ? (
              <SpeakAnswer
                // Fresh capture state per question: without it a "Didn't catch
                // that" error (and an in-flight recorder) survives into the
                // next speaking question, shown over one the learner has not
                // touched. The iOS players key their cards for the same reason.
                key={q.id}
                target={q.answer}
                locale={localeForCourse(course)}
                course={course}
                value={picked}
                onChange={setPicked}
                checked={checked}
              />
            ) : q.type === "translate" ? (
              <TranslateAnswer
                key={q.id}
                question={q}
                value={picked}
                onChange={setPicked}
                checked={checked}
                verdict={translationVerdict}
                showAiGradingOption
                // The verdict sheet leads with the accepted phrasing; here only the grader's reason.
                showAcceptedPhrasing={false}
              />
            ) : q.type === "fill" ? (
              <div>
                <input
                  type="text"
                  disabled={checked}
                  value={picked ?? ""}
                  onChange={(e) => setPicked(e.target.value)}
                  placeholder="Type your answer"
                  aria-label="Your answer"
                  className="w-full rounded-[var(--ds-radius-control)] border-2 border-ds-line bg-ds-card px-4 py-4 ds-type-answer text-ds-ink shadow-[0_4px_0_var(--c-line)] outline-none placeholder:text-ds-ink-faint focus:border-ds-choice"
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  {q.bank.map((w) => (
                    <WordTile
                      key={w}
                      word={w}
                      picked={picked === w}
                      disabled={checked}
                      onClick={() => setPicked(w)}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {checked ? (
          <VerdictSheet
            correct={answered}
            title={answered ? "Exactly!" : verdictTitle(false)}
            // The per-answer part of the server's XP formula; reinforcement rounds earn nothing, and a replay shows XP
            // only once the learner is past their best earlier score (a replay pays only the improvement).
            xp={answered && !isReinforcing ? xpChipLabel(correct) : null}
            correctAnswer={correctAnswerText(q)}
            onHearAnswer={hearAnswer}
            explanation={
              <AnswerExplanation
                explanation={q.explanation}
                saveCourse={course}
                question={q}
                className=""
              />
            }
            extra={
              answered ? null : (
                <ExplainInMyLanguage request={wrongAnswerRequest(q, submittedAnswer, course)} />
              )
            }
            continueLabel={
              isReinforcing || pendingReinforcement || idx < total - 1
                ? answered
                  ? "Continue"
                  : "Got it"
                : "Finish"
            }
            onContinue={next}
          />
        ) : (
          <div
            data-dock=""
            className="sticky bottom-0 z-20 bg-ds-surface/95 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3"
          >
            <button
              disabled={
                checking ||
                (q.type === "reorder"
                  ? orderPicks.length !== q.tokens.length
                  : // Whitespace is not an answer: gating on the trimmed text
                    // keeps it out of the score and spends no quota on it.
                    !picked?.trim())
              }
              onClick={() => void checkAnswer()}
              className={edgeButtonClass("primary")}
            >
              {checking ? "Checking…" : "Check"}
            </button>
          </div>
        )}
      </div>
    </LessonScreen>
  );
}

/** A card colour per word, so a deck without photos still feels illustrated. Tokens only. */
const WORD_BANDS = [
  "bg-ds-choice-tint text-ds-brand",
  "bg-ds-xp-tint text-ds-xp-text",
  "bg-ds-right-tint text-ds-right-ink",
  "bg-ds-heart-tint text-ds-heart-text",
  "bg-ds-flame-tint text-ds-ink",
] as const;
function wordBand(index: number): string {
  return WORD_BANDS[index % WORD_BANDS.length];
}

/**
 * Words to learn, one big card at a time: the picture, the word, its sound, the meaning and an example, with
 * Alphonso peeking over the corner. "Next word" moves on and the last card starts practice; Skip goes straight to
 * it. The arrow keys move between cards. Reduced motion swaps the slide for a fade.
 */
function VocabDeckScreen({
  items,
  title,
  subtitle,
  course,
  hud,
  onStart,
}: {
  items: VocabItem[];
  title: string;
  subtitle: string;
  course: Course;
  hud: React.ReactNode;
  onStart: () => void;
}) {
  const reduceMotion = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);
  const count = items.length;
  const v = items[Math.min(index, count - 1)];
  const last = index >= count - 1;
  const speakButton = (
    <button
      type="button"
      onClick={() => speak(v.term, localeForCourse(course))}
      aria-label={`Play pronunciation for ${v.term}`}
      className="grid size-11 shrink-0 place-items-center rounded-full bg-ds-card text-ds-choice shadow-[inset_0_0_0_1.5px_var(--c-line)]"
    >
      <DsIcon name="speaker" className="size-5" />
    </button>
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Arrows belong to whatever has focus: a field moves its caret, a dialog or arrow-driven widget its own selection (a focused button does not use them, and a click leaves one focused), and a
      // modified arrow is a browser or screen reader shortcut. This listener is mounted only while the deck is
      // showing, so no other screen can receive it.
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const target = e.target instanceof Element ? e.target : null;
      if (
        target?.closest(
          "input, textarea, select, [contenteditable], [role='dialog'], [role='slider'], [role='listbox'], [role='radiogroup'], [role='tablist']",
        )
      )
        return;
      if (e.key === "ArrowRight") setIndex((i) => Math.min(i + 1, count - 1));
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [count]);

  return (
    <div className="flex flex-1 flex-col px-4 pb-6 pt-4">
      {hud}
      <div className="mt-5 min-w-0">
        <p className="mb-1 ds-type-overline text-ds-action-text">Vocabulary · {subtitle}</p>
        <h2 className="ds-type-display text-ds-brand">{title}</h2>
        {/* Skip shares the counter's row: beside the title it crowded long titles. */}
        <div className="mt-1 flex items-center justify-between gap-3">
          <p
            aria-live="polite"
            aria-atomic="true"
            className="ds-type-footnote tabular-nums text-ds-ink-soft"
          >
            Word {index + 1} of {count}
          </p>
          {count > 1 && (
            <button
              type="button"
              onClick={onStart}
              className="-mr-3 min-h-11 shrink-0 rounded-full px-3 ds-type-footnote font-bold text-ds-choice"
            >
              Skip to practice
            </button>
          )}
        </div>
      </div>

      <div className="relative mt-5 flex flex-1 flex-col">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={index}
            data-vocab-card
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -24 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="relative overflow-hidden rounded-[var(--ds-radius-sheet)] bg-ds-card shadow-[var(--ds-shadow-floating)]"
          >
            <img
              src="/alphonso/lesson/talk.webp"
              alt=""
              width={64}
              height={64}
              decoding="async"
              className="pointer-events-none absolute -right-1 -top-1 z-10 size-16 rounded-full bg-ds-card bg-cover object-cover object-[center_20%] shadow-[0_0_0_3px_var(--c-card)]"
            />
            {v.image ? (
              <>
                <VocabImage url={v.image.url} alt={v.image.alt} className="h-44 w-full" />
                <div className="flex items-center gap-3 px-5 pr-14 pt-4">
                  <p className="ds-type-display-x-l text-ds-brand">{v.term}</p>
                  {speakButton}
                </div>
              </>
            ) : (
              // No photo (grammar words never have one): the word itself, large, on a tint that changes card to
              // card, so the deck still feels illustrated.
              <div className="p-3 pb-0">
                <div
                  data-word-band
                  className={`flex flex-col items-center gap-3 rounded-[22px] px-16 py-6 text-center ${wordBand(index)}`}
                >
                  <p className="text-balance ds-type-display-x-l">{v.term}</p>
                  {speakButton}
                </div>
              </div>
            )}
            <div className="px-5 pb-5 pt-3">
              {v.meaning && <p className="ds-type-body text-ds-ink-soft">{v.meaning}</p>}
              {v.example && (
                <p className="mt-3 rounded-[16px] bg-ds-sunk px-4 py-3 ds-type-body italic text-ds-ink">
                  {v.example}
                </p>
              )}
              <ExplainInMyLanguage
                className="mt-3"
                request={{
                  kind: "word",
                  course,
                  word: v.term.slice(0, 80),
                  ...(v.example ? { sentence: v.example.slice(0, 400) } : {}),
                }}
              />
            </div>
          </motion.div>
        </AnimatePresence>

        <div aria-hidden="true" className="mt-4 flex justify-center gap-1.5">
          {items.map((it, i) => (
            <span
              key={`${it.term}-${i}`}
              className={`h-2 rounded-full transition-all ${i === index ? "w-5 bg-ds-action" : "w-2 bg-ds-line"}`}
            />
          ))}
        </div>
      </div>

      <div className="mt-auto pt-6">
        <button
          onClick={() => (last ? onStart() : setIndex((i) => i + 1))}
          className={edgeButtonClass("primary")}
        >
          {deckButtonTitle(index, count)}
        </button>
      </div>
    </div>
  );
}

/**
 * Lesson start, in the unit's room: Alphonso introducing it, the unit and title over the scene, what the lesson
 * holds, and one gold button.
 */
function OverviewScreen({
  title,
  unitLine,
  words,
  wordSample,
  questions,
  minutes,
  maxXp,
  roomSrc,
  hud,
  onStart,
}: {
  title: string;
  unitLine: string;
  words: number;
  wordSample: string[];
  questions: number;
  minutes: number;
  maxXp: number;
  roomSrc: string;
  hud: React.ReactNode;
  onStart: () => void;
}) {
  const steps = [
    ...(words > 0
      ? [
          {
            key: "words",
            icon: "book" as const,
            label: `${words} new word${words === 1 ? "" : "s"}`,
            detail: `${wordSample.join(", ")}${words > wordSample.length ? "…" : ""}`,
          },
        ]
      : []),
    {
      key: "practice",
      icon: "check" as const,
      label: "Practice",
      detail: `${questions} question${questions === 1 ? "" : "s"}: pick, listen, say it back`,
    },
    {
      key: "review",
      icon: "star" as const,
      label: "Review",
      detail: "Anything you miss comes back later",
    },
  ];
  return (
    <div className="flex flex-1 flex-col">
      <LessonRoom
        roomSrc={roomSrc}
        expression="talk"
        height={380}
        alphonsoWidth={335}
        titleScrim
        overlay={
          <>
            <div className="absolute inset-x-4 top-4 z-20">{hud}</div>
            <div className="absolute inset-x-[18px] bottom-4 z-[5]">
              <p className="ds-type-overline text-ds-on-hero-kick [text-shadow:0_1px_8px_var(--c-hero-b)]">
                {unitLine}
              </p>
              <h2 className="text-balance ds-type-display-x-l text-ds-on-hero [text-shadow:0_2px_12px_color-mix(in_srgb,var(--c-hero-b)_60%,transparent)]">
                {title}
              </h2>
            </div>
          </>
        }
      />
      <p data-lesson-meta="" className="px-[18px] pt-3 ds-type-footnote font-bold text-ds-ink-soft">
        {`About ${minutes} min · ${questions} question${questions === 1 ? "" : "s"} · Up to ${maxXp} XP`}
      </p>
      <div className="grid gap-2 px-4 pt-3">
        {steps.map((s) => (
          <div
            key={s.key}
            data-step={s.key}
            className="flex items-center gap-3 rounded-[var(--ds-radius-control)] border-2 border-ds-line bg-ds-card px-3 py-2.5"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-ds-choice-tint text-ds-action-text">
              {s.icon === "star" ? (
                <DsIcon name="star" className="size-5" />
              ) : (
                <DsIcon name={s.icon} className="size-5" />
              )}
            </span>
            <span className="min-w-0">
              <span className="block ds-type-headline text-ds-brand">{s.label}</span>
              <span className="block truncate ds-type-caption font-semibold text-ds-ink-soft">
                {s.detail}
              </span>
            </span>
          </div>
        ))}
      </div>
      <div className="sticky bottom-0 z-20 mt-auto px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6">
        <button onClick={onStart} className={edgeButtonClass("primary")}>
          Start lesson
        </button>
      </div>
    </div>
  );
}

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
}: {
  xp: number;
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
  const chips = lessonRewardChips({ xp, streak: saved ? streak : null, correct, total });
  // He says "wow", then smiles (1.4 s in). Under Reduce Motion he is already smiling.
  const [amazed, setAmazed] = useState(!reduceMotion);
  // The jingle with the confetti, then XP and any achievement as their tiles land. Keyed per screen, so a re-render
  // (or React's development double effect) never plays them twice. Sound plays under Reduce Motion too.
  const [cueKey] = useState(() => `finish:${lessonId}:${Date.now()}:${Math.random()}`);
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
  const [unlockOpen, setUnlockOpen] = useState(false);
  useEffect(() => {
    if (cueUnlocked === 0) return;
    const t = window.setTimeout(() => setUnlockOpen(true), reduceMotion ? 300 : 2800);
    return () => window.clearTimeout(t);
  }, [cueUnlocked, reduceMotion]);
  // Only a saved completion has a real award to explain; the lines always add up to it (lesson-xp.ts).
  const xpLines = saved
    ? lessonXpBreakdown({ correct: awardedCorrect ?? correct, total, awarded: xp }).lines
    : [];
  const headline = total > 0 ? `Nice work! You got ${correct} of ${total}.` : "Nice work!";
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
          {correct}/{total} correct
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
