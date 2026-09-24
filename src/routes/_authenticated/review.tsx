import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useServerFn } from "@tanstack/react-start";
import { LessonFrame } from "../../components/AppShell";
import { AnswerOption } from "../../components/AnswerOption";
import { AnswerFeedback } from "../../components/AnswerFeedback";
import { MascotBanner } from "../../components/MascotBanner";
import { getCourse, localeForCourse } from "../../data/courses";
import type { Question } from "../../data/curriculum";
import { VOCAB_IMAGES } from "../../data/vocab-images";
import { canSpeak, speak } from "../../lib/speech";
import {
  fetchDueReviews,
  gradeReview,
  claimReviewClearBonusRemote,
} from "../../lib/review.functions";
import { useProgress } from "../../lib/progress";
import { deriveAnswerCorrectness } from "../../lib/srs";
import { SpeakAnswer } from "../../components/SpeakAnswer";
import { useTheme } from "../../lib/theme";
import { HeartIcon } from "../../components/icons";

export const Route = createFileRoute("/_authenticated/review")({
  component: ReviewPage,
  head: () => ({
    meta: [
      { title: "Review — Alphonso" },
      {
        name: "description",
        content: "Spaced-repetition review of the questions you got wrong.",
      },
      { property: "og:title", content: "Review — Alphonso" },
      {
        property: "og:description",
        content: "Bring back the items you missed, exactly when you're about to forget them.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Card = { itemKey: string; question: Question };

function ReviewPage() {
  const isStudioInk = useTheme((s) => s.theme === "studio-ink");
  const load = useServerFn(fetchDueReviews);
  const grade = useServerFn(gradeReview);
  const claimBonus = useServerFn(claimReviewClearBonusRemote);
  const course = useProgress((s) => s.course);
  const gainHeartsLocal = useProgress((s) => s.gainHeartsLocal);
  const [cards, setCards] = useState<Card[] | null>(null);
  const [total, setTotal] = useState(0);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  // "reorder" questions accumulate tapped token *indices* -- see
  // lesson.$id.tsx's identical pattern for why (a sentence can repeat a
  // word, so selection must be by index, not value).
  const [orderPicks, setOrderPicks] = useState<number[]>([]);
  const [checked, setChecked] = useState(false);
  const [stats, setStats] = useState({ right: 0, wrong: 0, retired: 0 });
  const [heartBonusGranted, setHeartBonusGranted] = useState(false);

  useEffect(() => {
    let alive = true;
    setCards(null);
    const questionIndex = getCourse(course).questionIndex;
    void load({ data: { course } })
      .then((res) => {
        if (!alive) return;
        const built: Card[] = [];
        for (const item of res.due) {
          if (item.source === "weakness") {
            if (item.prompt && item.choices && item.answerIndex !== null) {
              built.push({
                itemKey: item.itemKey,
                question: {
                  id: item.itemKey,
                  type: "mc",
                  prompt: item.prompt,
                  choices: item.choices,
                  answer: item.answerIndex,
                  explanation: item.explanation ?? "",
                },
              });
            }
            continue;
          }
          const ref = questionIndex[item.itemKey];
          if (ref) built.push({ itemKey: item.itemKey, question: ref.question });
        }
        setCards(built);
        setTotal(res.total);
      })
      .catch(() => setCards([]));
    return () => {
      alive = false;
    };
  }, [load, course]);

  const card = cards && idx < cards.length ? cards[idx] : null;
  const queueCleared = cards !== null && cards.length > 0 && idx >= cards.length;

  useEffect(() => {
    if (!queueCleared) return;
    let alive = true;
    void claimBonus({ data: { course } })
      .then((res) => {
        if (alive && res.granted) setHeartBonusGranted(true);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // Only depends on the transition into "cleared" -- claimBonus/course
    // are stable for the life of one review session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueCleared]);

  useEffect(() => {
    if (heartBonusGranted) gainHeartsLocal(1);
  }, [heartBonusGranted, gainHeartsLocal]);

  const q = card?.question;
  const submittedAnswer =
    q?.type === "reorder" ? orderPicks.map((i) => q.tokens[i]).join(" ") : picked;
  const isCorrect = useMemo(() => {
    if (!q || !submittedAnswer) return false;
    // The same helper the grade-review server uses, so what the learner is
    // shown here and what happens to the item's schedule cannot disagree --
    // which for a spoken answer means the tolerant transcript match.
    return deriveAnswerCorrectness(q, submittedAnswer);
  }, [q, submittedAnswer]);

  function check() {
    if (!card || !submittedAnswer) return;
    setChecked(true);
    const ok = isCorrect;
    setStats((s) => ({ ...s, right: s.right + (ok ? 1 : 0), wrong: s.wrong + (ok ? 0 : 1) }));
    void grade({ data: { itemKey: card.itemKey, answer: submittedAnswer, course } })
      .then((r) => {
        if (r.retired) setStats((s) => ({ ...s, retired: s.retired + 1 }));
      })
      .catch(() => {});
  }

  function next() {
    setIdx((i) => i + 1);
    setPicked(null);
    setOrderPicks([]);
    setChecked(false);
  }

  if (cards === null) {
    return (
      <LessonFrame>
        <div className="grid flex-1 place-items-center p-6 text-sm text-ink-soft">
          Loading your review queue…
        </div>
      </LessonFrame>
    );
  }

  if (cards.length === 0) {
    return (
      <LessonFrame>
        <Empty
          title="Nothing due today"
          body={
            total > 0
              ? `You have ${total} item${total === 1 ? "" : "s"} in review — none are due yet. Come back tomorrow.`
              : "Miss a question in a lesson and it lands here, returning at widening intervals until it sticks."
          }
        />
      </LessonFrame>
    );
  }

  if (!card || !q) {
    return (
      <LessonFrame>
        <Empty
          title="Review complete"
          body={`${stats.right} correct · ${stats.wrong} to revisit${
            stats.retired ? ` · ${stats.retired} mastered and retired` : ""
          }.`}
          bonus={heartBonusGranted ? "Queue cleared: +1 heart" : undefined}
        />
      </LessonFrame>
    );
  }

  return (
    <LessonFrame>
      <div className="flex items-center gap-3 px-5 pt-5">
        <Link
          to="/learn"
          aria-label="Close review"
          className="grid size-8 place-items-center rounded-full text-ink-soft/70 hover:bg-parchment"
        >
          ✕
        </Link>
        <div className="flex-1 overflow-hidden rounded-full bg-parchment">
          <div
            className="h-2 rounded-full bg-ember transition-all"
            style={{ width: `${(idx / cards.length) * 100}%` }}
          />
        </div>
        <span className="tnum text-[11px] font-medium text-ink-soft">
          {idx + 1}/{cards.length}
        </span>
      </div>

      <div className="flex flex-1 flex-col px-6 pb-6 pt-8">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-ember">
          Spaced review
        </p>
        {q.type === "mc" && q.imageKey && VOCAB_IMAGES[q.imageKey] && (
          <img
            src={VOCAB_IMAGES[q.imageKey].url}
            alt={VOCAB_IMAGES[q.imageKey].alt}
            loading="lazy"
            className="mb-4 h-40 w-full rounded-2xl object-cover"
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
        {/* A listening question is unanswerable without audio, so when the
            browser cannot speak, the sentence is shown instead -- same
            reasoning as the lesson player's identical fallback. */}
        {q.type === "listening" && !canSpeak() && (
          <div className="mb-3 rounded-2xl border border-hairline bg-parchment px-4 py-3">
            <p className="text-xs text-ink-soft">
              Audio is unavailable on this device — here is what you would hear:
            </p>
            <p className="mt-1 text-base font-medium text-ink">{q.audioText}</p>
          </div>
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
              target={q.answer}
              locale={localeForCourse(course)}
              value={picked}
              onChange={setPicked}
              checked={checked}
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
            correct={isCorrect}
            headline={isCorrect ? "Still got it." : "Back in the queue."}
            explanation={q.explanation}
          />
        )}

        <div className="mt-auto pt-6">
          {!checked ? (
            <button
              disabled={q.type === "reorder" ? orderPicks.length !== q.tokens.length : !picked}
              onClick={check}
              className="w-full rounded-full bg-ink px-4 py-3.5 text-sm font-semibold text-surface transition hover:opacity-90 disabled:opacity-40"
            >
              Check
            </button>
          ) : (
            <button
              onClick={next}
              className="w-full rounded-full bg-ember px-4 py-3.5 text-sm font-semibold text-ink-on-ember transition hover:opacity-90"
            >
              {idx < cards.length - 1 ? "Continue" : "Finish"}
            </button>
          )}
        </div>
      </div>
    </LessonFrame>
  );
}

export function Empty({ title, body, bonus }: { title: string; body: string; bonus?: string }) {
  const isComplete = title === "Review complete";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-1 flex-col items-center justify-center px-8 text-center"
    >
      {isComplete ? (
        <div className="mb-5 w-full">
          <MascotBanner mascot="alphonso" message="Review complete!" />
        </div>
      ) : (
        <div className="mb-5 grid size-16 place-items-center rounded-full bg-moss text-surface hard-shadow">
          <svg viewBox="0 0 24 24" className="size-8" fill="none" aria-hidden="true">
            <path
              d="m6 12 4 4 8-9"
              stroke="white"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}
      <h1 className="font-display text-[22px] font-semibold text-ink">{title}</h1>
      <p className="mt-2 max-w-[280px] text-sm text-ink-soft/80">{body}</p>
      {bonus && (
        <p className="mt-3 flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-500">
          <HeartIcon className="size-3.5" />
          {bonus}
        </p>
      )}
      <Link
        to="/learn"
        className="mt-8 w-full rounded-full bg-ink px-4 py-3.5 text-sm font-semibold text-surface"
      >
        Back to path
      </Link>
    </motion.div>
  );
}
