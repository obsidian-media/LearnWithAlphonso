import { createFileRoute, useNavigate, useParams, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LessonFrame } from "../../components/AppShell";
import { AnswerOption } from "../../components/AnswerOption";
import { AnswerFeedback } from "../../components/AnswerFeedback";
import { SpeakAnswer } from "../../components/SpeakAnswer";
import { TranslateAnswer } from "../../components/TranslateAnswer";
import { MascotBanner } from "../../components/MascotBanner";
import { useTheme } from "../../lib/theme";
import { HeartIcon } from "../../components/icons";
import { getCourse, localeForCourse, type Course } from "../../data/courses";
import { pickReinforcementQuestion, reshuffleQuestion } from "../../data/bank-engine";
import type { Question } from "../../data/curriculum";
import { VOCAB_IMAGES } from "../../data/vocab-images";
import { canSpeak, speak } from "../../lib/speech";
import { useProgress } from "../../lib/progress";
import {
  completeLessonRemote,
  loseHeartRemote,
  startLessonSession,
} from "../../lib/sync.functions";
import { recordMisses } from "../../lib/review.functions";
import { deriveAnswerCorrectness } from "../../lib/srs";
import { requestTranslationVerdict } from "../../lib/grade-translation.client";
import type { TranslationVerdict } from "../api/grade-translation";
import { ACHIEVEMENTS_BY_ID } from "../../data/achievements";
import { vocabForLesson, type VocabItem } from "../../data/vocab";
import { authHeaders } from "../../lib/auth-headers";

export const Route = createFileRoute("/_authenticated/lesson/$id")({
  component: LessonPage,
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

function LessonPage() {
  const isStudioInk = useTheme((s) => s.theme === "studio-ink");
  const { id } = useParams({ from: "/_authenticated/lesson/$id" });
  const navigate = useNavigate();
  const course = useProgress((s) => s.course);
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
  const state = useProgress();

  const [idx, setIdx] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [missed, setMissed] = useState<string[]>([]);
  const [missedQs, setMissedQs] = useState<{ q: Question; yours: string }[]>([]);
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
    unlocked: string[];
    heartsBonus: "streak" | "perfect" | null;
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

  const [sessionToken, setSessionToken] = useState<string | null>(null);
  useEffect(() => {
    if (!maybeLesson) return;
    let alive = true;
    void startLessonSession({ data: { lessonId: maybeLesson.id, course } })
      .then((res) => {
        if (alive) setSessionToken(res.token);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [maybeLesson, course]);

  if (!maybeLesson) {
    return (
      <LessonFrame>
        <div className="p-6 text-center">
          <p className="text-sm text-ink-soft">Lesson not found.</p>
          <Link to="/learn" className="mt-4 inline-block text-moss underline">
            Back to learn
          </Link>
        </div>
      </LessonFrame>
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
    let isCorrect = deriveAnswerCorrectness(q, submittedAnswer);
    // A written translation gets a second opinion when the curated phrasings
    // do not already accept it -- there are more right ways to say a thing
    // than any list anticipates. A null verdict (offline, vendor down, quota
    // spent) leaves the local answer standing rather than failing the learner
    // for something that is not about their English.
    if (!isCorrect && q.type === "translate") {
      setChecking(true);
      const verdict = await requestTranslationVerdict({
        lessonId: lesson.id,
        questionId: q.id,
        submission: submittedAnswer,
        course,
      });
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
    // Reinforcement rounds are supplementary practice only -- they never
    // touch correct/missed/hearts/XP, regardless of outcome.
    if (isReinforcing) return;
    if (isCorrect) setCorrect((c) => c + 1);
    else {
      setMissed((m) => [...m, `${lesson.id}:${q.id}`]);
      setMissedQs((m) => [...m, { q, yours: submittedAnswer }]);
      loseHeartLocal();
      void loseHeartRemote();
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
    if (missed.length) {
      void recordMisses({
        data: {
          lessonId: lesson.id,
          level: lessonLevel,
          itemKeys: missed,
          course,
          sessionToken: sessionToken ?? "",
        },
      }).catch(() => {});
    }
    try {
      const res = await completeLessonRemote({
        data: {
          lessonId: lesson.id,
          total,
          missedQuestionIds: missedQs.map(({ q }) => q.id),
          course,
          sessionToken: sessionToken ?? "",
        },
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
          [lesson.id]: { correct, total },
        },
        unlockedAchievements: [
          ...state.unlockedAchievements,
          ...res.newlyUnlocked.filter((a) => !state.unlockedAchievements.includes(a)),
        ],
      });
      setDone({ xp: res.xpGain, unlocked: res.newlyUnlocked, heartsBonus: res.heartsBonus });
    } catch {
      setDone({ xp: 0, unlocked: [], heartsBonus: null });
    }
  }

  const answered =
    q.type === "translate" && translationVerdict
      ? translationVerdict.correct
      : deriveAnswerCorrectness(q, submittedAnswer ?? "");

  return (
    <LessonFrame>
      <div className="px-5 pt-5">
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
          <button
            onClick={() => navigate({ to: "/learn" })}
            aria-label="Close"
            className="grid size-8 shrink-0 place-items-center rounded-full text-ink-soft/70 hover:bg-parchment"
          >
            ✕
          </button>
          <div className="min-w-0 overflow-hidden rounded-full bg-parchment">
            <div
              className="h-2 rounded-full bg-moss transition-all"
              style={{
                width: done
                  ? "100%"
                  : phase !== "quiz"
                    ? "0%"
                    : `${((idx + (checked ? 1 : 0)) / total) * 100}%`,
              }}
            />
          </div>
          <span className="tnum shrink-0 text-[11px] font-medium text-ink-soft">
            {done
              ? "Done"
              : phase === "quiz"
                ? `${idx + 1}/${total}`
                : phase === "vocab"
                  ? "Words"
                  : "Start"}
          </span>
        </div>
        <div className="mt-3 flex gap-1.5">
          {(["overview", "vocab", "quiz", "done"] as const).map((s) => {
            const order = ["overview", "vocab", "quiz", "done"];
            const current = done ? "done" : phase;
            const active = order.indexOf(s) <= order.indexOf(current);
            return (
              <span
                key={s}
                className={`h-1 flex-1 rounded-full ${active ? "bg-ink" : "bg-hairline"}`}
              />
            );
          })}
        </div>
      </div>

      {done ? (
        <FinishScreen
          xp={done.xp}
          unlocked={done.unlocked}
          heartsBonus={done.heartsBonus}
          lessonTitle={lesson.title}
          correct={correct}
          total={total}
          missedQs={missedQs}
          lessonId={lesson.id}
          course={course}
        />
      ) : phase === "overview" ? (
        <OverviewScreen
          title={lesson.title}
          subtitle={lesson.subtitle}
          words={vocab.length}
          questions={total}
          onStart={() => setPhase(vocab.length > 0 ? "vocab" : "quiz")}
        />
      ) : phase === "vocab" && vocab.length > 0 ? (
        <VocabScreen
          items={vocab}
          title={lesson.title}
          subtitle={lesson.subtitle}
          course={course}
          onStart={() => setPhase("quiz")}
        />
      ) : (
        <div className="flex flex-1 flex-col px-6 pb-6 pt-8">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-ember">
            {isReinforcing ? "Quick practice" : lesson.subtitle}
          </p>
          {q.type === "mc" && q.imageKey && VOCAB_IMAGES[q.imageKey] && (
            <img
              src={VOCAB_IMAGES[q.imageKey].url}
              alt={VOCAB_IMAGES[q.imageKey].alt}
              loading="lazy"
              className="mb-4 h-40 w-full rounded-2xl object-cover"
              // A dead/rate-limited image URL degrades to no image rather
              // than a broken-image icon with no retry.
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          )}
          {q.type === "listening" && (
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-soft/70">
              Listening
            </p>
          )}
          {q.type === "speak" && (
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-soft/70">
              Speaking
            </p>
          )}
          {q.type === "listening" && canSpeak() && (
            <button
              type="button"
              onClick={() => speak(q.audioText, localeForCourse(course))}
              className="mb-3 flex w-fit items-center gap-2 rounded-full border border-hairline bg-surface px-4 py-2 text-sm font-medium text-ink transition hover:border-ink/30"
            >
              🔊 Play audio
            </button>
          )}
          {/* A listening question is unanswerable without audio, so when the
              browser cannot speak, the sentence is shown instead. Guessing
              one-in-four costs a heart; reading it does not. */}
          {q.type === "listening" && !canSpeak() && (
            <div className="mb-3 rounded-2xl border border-hairline bg-parchment px-4 py-3">
              <p className="text-xs text-ink-soft">
                Audio is unavailable on this device — here is what you would hear:
              </p>
              <p className="mt-1 text-base font-medium text-ink">{q.audioText}</p>
            </div>
          )}
          <h2 className="font-display text-[25px] font-semibold leading-tight text-ink">
            {q.prompt}
          </h2>

          <div className={isStudioInk ? "mt-6" : "mt-6 space-y-2.5"}>
            {q.type === "mc" || q.type === "listening" ? (
              q.choices.map((c) => (
                <AnswerOption
                  key={c}
                  label={c}
                  checked={checked}
                  isPicked={picked === c}
                  // mc stores the answer's index, listening its text.
                  isRight={q.type === "mc" ? q.choices[q.answer] === c : q.answer === c}
                  disabled={checked}
                  onClick={() => setPicked(c)}
                />
              ))
            ) : q.type === "reorder" ? (
              <div>
                <div className="mb-3 flex min-h-11 flex-wrap gap-2 rounded-2xl border border-dashed border-hairline bg-parchment p-3">
                  {orderPicks.length === 0 ? (
                    <span className="text-xs text-ink-soft/60">Tap the words below in order</span>
                  ) : (
                    orderPicks.map((tokenIdx, position) => (
                      <button
                        key={`${tokenIdx}-${position}`}
                        type="button"
                        disabled={checked}
                        onClick={() => setOrderPicks((arr) => arr.filter((_, i) => i !== position))}
                        className="rounded-full bg-ink px-3 py-1.5 text-sm font-medium text-surface"
                      >
                        {q.tokens[tokenIdx]}
                      </button>
                    ))
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {q.tokens.map((t, i) =>
                    orderPicks.includes(i) ? null : (
                      <button
                        key={i}
                        type="button"
                        disabled={checked}
                        onClick={() => setOrderPicks((arr) => [...arr, i])}
                        className="rounded-full border border-hairline bg-surface px-3 py-1.5 text-sm text-ink-soft hover:text-ink"
                      >
                        {t}
                      </button>
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
              />
            ) : q.type === "fill" ? (
              <div>
                <input
                  type="text"
                  disabled={checked}
                  value={picked ?? ""}
                  onChange={(e) => setPicked(e.target.value)}
                  placeholder="Type your answer"
                  className="w-full rounded-2xl border border-hairline bg-surface px-4 py-3.5 text-base outline-none focus:border-moss"
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  {q.bank.map((w) => (
                    <button
                      key={w}
                      disabled={checked}
                      onClick={() => setPicked(w)}
                      className="rounded-full border border-hairline bg-surface px-3 py-1.5 text-sm text-ink-soft hover:text-ink"
                    >
                      {w}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {checked && (
            <AnswerFeedback
              correct={answered}
              headline={answered ? "Nice." : "Not quite."}
              explanation={q.explanation}
            />
          )}

          <div className="mt-auto pt-6">
            {!checked ? (
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
                className="w-full rounded-full bg-ink px-4 py-3.5 text-sm font-semibold text-surface transition hover:opacity-90 disabled:opacity-40"
              >
                {checking ? "Checking…" : "Check"}
              </button>
            ) : (
              <button
                onClick={next}
                className="w-full rounded-full bg-ember px-4 py-3.5 text-sm font-semibold text-ink-on-ember transition hover:opacity-90"
              >
                {isReinforcing || pendingReinforcement || idx < total - 1 ? "Continue" : "Finish"}
              </button>
            )}
          </div>
        </div>
      )}
    </LessonFrame>
  );
}

function VocabScreen({
  items,
  title,
  subtitle,
  course,
  onStart,
}: {
  items: VocabItem[];
  title: string;
  subtitle: string;
  course: Course;
  onStart: () => void;
}) {
  const isStudioInk = useTheme((s) => s.theme === "studio-ink");
  return (
    <div className="flex flex-1 flex-col px-6 pb-6 pt-8">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-ember">
        Vocabulary · {subtitle}
      </p>
      <h2 className="font-display text-[22px] font-semibold leading-tight text-ink">{title}</h2>
      <p className="mt-1.5 text-sm text-ink-soft/80">
        {items.length} word{items.length === 1 ? "" : "s"} to learn before you practise.
      </p>

      <div className={isStudioInk ? "mt-6 divide-y divide-hairline" : "mt-6 space-y-2.5"}>
        {items.map((v, i) =>
          isStudioInk ? (
            <motion.div
              key={`${v.term}-${i}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="py-3.5"
            >
              {v.image && (
                <img
                  src={v.image.url}
                  alt={v.image.alt}
                  loading="lazy"
                  className="mb-3 h-32 w-full object-cover"
                  // A dead/rate-limited image URL degrades to no image
                  // rather than a broken-image icon with no retry.
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              )}
              <div className="flex items-center gap-2">
                <p className="font-display text-base font-semibold text-ink">{v.term}</p>
                <button
                  type="button"
                  onClick={() => speak(v.term, localeForCourse(course))}
                  aria-label={`Play pronunciation for ${v.term}`}
                  className="grid size-7 shrink-0 place-items-center rounded-full border border-hairline bg-surface text-ink-soft transition hover:border-ink/30 hover:text-ink"
                >
                  🔊
                </button>
              </div>
              <p className="mt-0.5 text-xs text-ink-soft/80">{v.meaning}</p>
              <p className="mt-2 border-l-[3px] border-l-hairline pl-3 text-[12px] italic text-ink-soft">
                {v.example}
              </p>
            </motion.div>
          ) : (
            <motion.div
              key={`${v.term}-${i}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden rounded-2xl border border-hairline bg-surface"
            >
              {v.image && (
                <img
                  src={v.image.url}
                  alt={v.image.alt}
                  loading="lazy"
                  className="h-32 w-full object-cover"
                  // A dead/rate-limited image URL degrades to no image
                  // rather than a broken-image icon with no retry.
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              )}
              <div className="px-4 py-3.5">
                <div className="flex items-center gap-2">
                  <p className="font-display text-base font-semibold text-ink">{v.term}</p>
                  <button
                    type="button"
                    onClick={() => speak(v.term, localeForCourse(course))}
                    aria-label={`Play pronunciation for ${v.term}`}
                    className="grid size-7 shrink-0 place-items-center rounded-full border border-hairline bg-surface text-ink-soft transition hover:border-ink/30 hover:text-ink"
                  >
                    🔊
                  </button>
                </div>
                <p className="mt-0.5 text-xs text-ink-soft/80">{v.meaning}</p>
                <p className="mt-2 rounded-xl bg-parchment px-3 py-2 text-[12px] italic text-ink-soft">
                  {v.example}
                </p>
              </div>
            </motion.div>
          ),
        )}
      </div>

      <div className="mt-auto pt-6">
        <button
          onClick={onStart}
          className="w-full rounded-full bg-ink px-4 py-3.5 text-sm font-semibold text-surface transition hover:opacity-90"
        >
          Start practice
        </button>
      </div>
    </div>
  );
}

function OverviewScreen({
  title,
  subtitle,
  words,
  questions,
  onStart,
}: {
  title: string;
  subtitle: string;
  words: number;
  questions: number;
  onStart: () => void;
}) {
  const isStudioInk = useTheme((s) => s.theme === "studio-ink");
  const steps = [
    { label: "Vocabulary", detail: `${words} word${words === 1 ? "" : "s"} with examples` },
    { label: "Practice", detail: `${questions} questions` },
    { label: "Review", detail: "Anything you miss comes back later" },
  ];
  return (
    <div className="flex flex-1 flex-col px-6 pb-6 pt-8">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-ember">
        {subtitle}
      </p>
      <h2 className="text-balance font-display text-[26px] font-semibold leading-tight text-ink">
        {title}
      </h2>
      <div className={isStudioInk ? "mt-6 divide-y divide-hairline" : "mt-6 space-y-2.5"}>
        {steps.map((s, i) => (
          <div
            key={s.label}
            className={
              isStudioInk
                ? "grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 py-3.5"
                : "grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-2xl border border-hairline bg-surface px-4 py-3.5"
            }
          >
            <span className="tnum grid size-8 shrink-0 place-items-center rounded-full bg-parchment text-xs font-semibold text-ink">
              {i + 1}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-ink">{s.label}</span>
              <span className="block truncate text-xs text-ink-soft/80">{s.detail}</span>
            </span>
          </div>
        ))}
      </div>
      <div className="mt-auto pt-6">
        <button
          onClick={onStart}
          className="w-full rounded-full bg-ink px-4 py-3.5 text-sm font-semibold text-surface transition hover:opacity-90"
        >
          Begin lesson
        </button>
      </div>
    </div>
  );
}

export function FinishScreen({
  xp,
  unlocked,
  heartsBonus,
  lessonTitle,
  correct,
  total,
  missedQs,
  lessonId,
  course,
}: {
  xp: number;
  unlocked: string[];
  heartsBonus: "streak" | "perfect" | null;
  lessonTitle: string;
  correct: number;
  total: number;
  missedQs: { q: Question; yours: string }[];
  lessonId: string;
  course: string;
}) {
  const isStudioInk = useTheme((s) => s.theme === "studio-ink");
  return (
    <div className="flex flex-1 flex-col items-center px-6 pb-8 pt-6 text-center">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 220, damping: 18 }}
        className="mb-6 w-full"
      >
        <MascotBanner mascot="alphonso" message="Nice work — lesson complete!" />
      </motion.div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ember">
        Lesson complete
      </p>
      <h2 className="mt-1 font-display text-[24px] font-semibold text-ink">{lessonTitle}</h2>
      <p className="mt-3 tnum text-lg font-semibold text-moss">+{xp} XP</p>
      <p className="tnum mt-1 text-xs text-ink-soft">
        {correct}/{total} correct
      </p>
      {heartsBonus && (
        <p className="mt-2 flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-500">
          <HeartIcon className="size-3.5" />
          {heartsBonus === "streak"
            ? "Streak milestone: hearts fully refilled"
            : "Perfect lesson: +1 heart"}
        </p>
      )}

      {missedQs.length > 0 && (
        <div
          className={
            isStudioInk
              ? "mt-6 w-full divide-y divide-hairline text-left"
              : "mt-6 w-full space-y-2 text-left"
          }
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-soft/70">
            Review · {missedQs.length} to practise again
          </p>
          {missedQs.map(({ q, yours }, i) => (
            <div
              key={`${q.id}-${i}`}
              className={
                isStudioInk ? "py-3" : "rounded-2xl border border-hairline bg-parchment px-4 py-3"
              }
            >
              <p className="text-sm font-medium text-ink">{q.prompt}</p>
              <p className="mt-1 text-xs text-ink-soft/80">
                You said <span className="line-through">{yours}</span> ·{" "}
                <span className="font-semibold text-moss">
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

      <AnimatePresence>
        {unlocked.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={
              isStudioInk ? "mt-6 w-full divide-y divide-hairline" : "mt-6 w-full space-y-2"
            }
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-soft/70">
              Achievements unlocked
            </p>
            {unlocked.map((id) => {
              const a = ACHIEVEMENTS_BY_ID[id];
              if (!a) return null;
              return (
                <div
                  key={id}
                  className={
                    isStudioInk
                      ? "flex items-center gap-3 py-2 text-left"
                      : "flex items-center gap-3 rounded-2xl border border-hairline bg-parchment px-3 py-2 text-left"
                  }
                >
                  <span className="grid size-8 place-items-center rounded-full bg-ember text-ink-on-ember text-xs">
                    ★
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-ink">{a.title}</p>
                    <p className="text-[11px] text-ink-soft">{a.description}</p>
                  </div>
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      <GeneratedPracticeSection lessonId={lessonId} course={course} />

      <Link
        to="/learn"
        className="mt-8 w-full rounded-full bg-ink px-4 py-3.5 text-center text-sm font-semibold text-surface"
      >
        Back to path
      </Link>
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
  const [picked, setPicked] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  async function generate() {
    setStatus("loading");
    try {
      const resp = await fetch("/api/generate-practice", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ lessonId, course }),
      });
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
      <div className="mt-8 w-full">
        <button
          onClick={() => void generate()}
          disabled={status === "loading"}
          className="w-full rounded-full border border-hairline bg-surface px-4 py-3 text-sm font-semibold text-ink transition hover:border-ink/30 disabled:opacity-50"
        >
          {status === "loading" ? "Writing more practice…" : "Generate more practice"}
        </button>
        {status === "empty" && (
          <p className="mt-2 text-center text-xs text-ink-soft">
            Couldn't generate practice for this lesson right now.
          </p>
        )}
        {status === "error" && (
          <p className="mt-2 text-center text-xs text-ink-soft">
            Something went wrong — try again.
          </p>
        )}
      </div>
    );
  }

  if (idx >= questions.length) {
    return (
      <div className="mt-8 w-full rounded-2xl border border-hairline bg-parchment p-4 text-center text-sm text-ink-soft">
        Nice work — that's all the extra practice for this lesson.
      </div>
    );
  }

  const q = questions[idx];
  const isCorrect = picked === q.choices[q.answerIndex];

  return (
    <div className="mt-8 w-full text-left">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-soft/70">
        Extra practice · {idx + 1}/{questions.length}
      </p>
      <p className="mt-2 text-base font-medium text-ink">{q.prompt}</p>
      <div className="mt-3 space-y-2">
        {q.choices.map((c) => (
          <AnswerOption
            key={c}
            label={c}
            checked={checked}
            isPicked={picked === c}
            isRight={q.choices[q.answerIndex] === c}
            disabled={checked}
            onClick={() => setPicked(c)}
          />
        ))}
      </div>
      {checked && (
        <AnswerFeedback
          correct={isCorrect}
          headline={isCorrect ? "Nice." : "Not quite."}
          explanation={q.explanation}
        />
      )}
      <button
        disabled={!checked && !picked}
        onClick={() => {
          if (!checked) {
            setChecked(true);
            return;
          }
          setIdx((i) => i + 1);
          setPicked(null);
          setChecked(false);
        }}
        className="mt-4 w-full rounded-full bg-ink px-4 py-3 text-sm font-semibold text-surface transition hover:opacity-90 disabled:opacity-40"
      >
        {!checked ? "Check" : idx < questions.length - 1 ? "Next" : "Finish practice"}
      </button>
    </div>
  );
}
