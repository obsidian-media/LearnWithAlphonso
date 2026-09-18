import { createFileRoute, useNavigate, useParams, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LessonFrame } from "../../components/AppShell";
import { AnswerOption } from "../../components/AnswerOption";
import { AnswerFeedback } from "../../components/AnswerFeedback";
import { useTheme } from "../../lib/theme";
import { HeartIcon } from "../../components/icons";
import { getCourse } from "../../data/courses";
import { reshuffleQuestion } from "../../data/bank-engine";
import type { Question } from "../../data/curriculum";
import { useProgress } from "../../lib/progress";
import {
  completeLessonRemote,
  loseHeartRemote,
  startLessonSession,
} from "../../lib/sync.functions";
import { recordMisses } from "../../lib/review.functions";
import { ACHIEVEMENTS_BY_ID } from "../../data/achievements";
import { vocabForLesson, type VocabItem } from "../../data/vocab";

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

  const applyCompletion = useProgress((s) => s.applyCompletion);
  const loseHeartLocal = useProgress((s) => s.loseHeartLocal);
  const state = useProgress();

  const [idx, setIdx] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [missed, setMissed] = useState<string[]>([]);
  const [missedQs, setMissedQs] = useState<{ q: Question; yours: string }[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [done, setDone] = useState<{
    xp: number;
    unlocked: string[];
    heartsBonus: "streak" | "perfect" | null;
  } | null>(null);
  const vocab = useMemo(() => vocabForLesson(id), [id]);
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
  const q: Question = questions[idx];
  const total = questions.length;

  function checkAnswer() {
    if (!picked) return;
    const isCorrect =
      q.type === "mc"
        ? q.choices[q.answer] === picked
        : picked.trim().toLowerCase() === q.answer.trim().toLowerCase();
    setChecked(true);
    if (isCorrect) setCorrect((c) => c + 1);
    else {
      setMissed((m) => [...m, `${lesson.id}:${q.id}`]);
      setMissedQs((m) => [...m, { q, yours: picked }]);
      loseHeartLocal();
      void loseHeartRemote();
    }
  }

  async function next() {
    if (idx < total - 1) {
      setIdx((i) => i + 1);
      setPicked(null);
      setChecked(false);
      return;
    }
    if (missed.length) {
      void recordMisses({
        data: { lessonId: lesson.id, level: lessonLevel, itemKeys: missed, course },
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
    q.type === "mc"
      ? picked === q.choices[q.answer]
      : picked?.trim().toLowerCase() === q.answer.trim().toLowerCase();

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
          onStart={() => setPhase("quiz")}
        />
      ) : (
        <div className="flex flex-1 flex-col px-6 pb-6 pt-8">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-ember">
            {lesson.subtitle}
          </p>
          <h2 className="font-display text-[22px] font-semibold leading-tight text-ink">
            {q.prompt}
          </h2>

          <div className={isStudioInk ? "mt-6" : "mt-6 space-y-2.5"}>
            {q.type === "mc" ? (
              q.choices.map((c) => (
                <AnswerOption
                  key={c}
                  label={c}
                  checked={checked}
                  isPicked={picked === c}
                  isRight={q.choices[q.answer] === c}
                  disabled={checked}
                  onClick={() => setPicked(c)}
                />
              ))
            ) : (
              <div>
                <input
                  type="text"
                  disabled={checked}
                  value={picked ?? ""}
                  onChange={(e) => setPicked(e.target.value)}
                  placeholder="Type your answer"
                  className="w-full rounded-2xl border border-hairline bg-surface px-4 py-3.5 text-sm outline-none focus:border-moss"
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  {q.bank.map((w) => (
                    <button
                      key={w}
                      disabled={checked}
                      onClick={() => setPicked(w)}
                      className="rounded-full border border-hairline bg-surface px-3 py-1.5 text-xs text-ink-soft hover:text-ink"
                    >
                      {w}
                    </button>
                  ))}
                </div>
              </div>
            )}
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
                disabled={!picked}
                onClick={checkAnswer}
                className="w-full rounded-full bg-ink px-4 py-3.5 text-sm font-semibold text-surface transition hover:opacity-90 disabled:opacity-40"
              >
                Check
              </button>
            ) : (
              <button
                onClick={next}
                className="w-full rounded-full bg-ember px-4 py-3.5 text-sm font-semibold text-surface transition hover:opacity-90"
              >
                {idx < total - 1 ? "Continue" : "Finish"}
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
  onStart,
}: {
  items: VocabItem[];
  title: string;
  subtitle: string;
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
                />
              )}
              <p className="font-display text-base font-semibold text-ink">{v.term}</p>
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
                />
              )}
              <div className="px-4 py-3.5">
                <p className="font-display text-base font-semibold text-ink">{v.term}</p>
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

function FinishScreen({
  xp,
  unlocked,
  heartsBonus,
  lessonTitle,
  correct,
  total,
  missedQs,
}: {
  xp: number;
  unlocked: string[];
  heartsBonus: "streak" | "perfect" | null;
  lessonTitle: string;
  correct: number;
  total: number;
  missedQs: { q: Question; yours: string }[];
}) {
  const isStudioInk = useTheme((s) => s.theme === "studio-ink");
  return (
    <div className="flex flex-1 flex-col items-center px-6 pb-8 pt-6 text-center">
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 220, damping: 18 }}
        className="mb-6 grid size-24 place-items-center rounded-full bg-moss text-surface hard-shadow"
      >
        <svg viewBox="0 0 24 24" className="size-12" fill="none">
          <path
            d="m6 12 4 4 8-9"
            stroke="white"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
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
                  {q.type === "mc" ? q.choices[q.answer] : q.answer}
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
                  <span className="grid size-8 place-items-center rounded-full bg-ember text-surface text-xs">
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

      <Link
        to="/learn"
        className="mt-8 w-full rounded-full bg-ink px-4 py-3.5 text-center text-sm font-semibold text-surface"
      >
        Back to path
      </Link>
    </div>
  );
}
