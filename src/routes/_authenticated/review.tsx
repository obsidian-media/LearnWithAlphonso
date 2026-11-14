import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AnswerExplanation } from "../../components/AnswerFeedback";
import { ExplainInMyLanguage } from "../../components/ExplainInMyLanguage";
import { DsPill, Icon, dsButtonClass } from "../../components/ds/Blocks";
import {
  AlphonsoBubble,
  LessonAnswer,
  VerdictSheet,
  WordTile,
  edgeButtonClass,
} from "../../components/lesson/LessonParts";
import { LessonScreen } from "../../components/lesson/LessonScreen";
import { wrongAnswerRequest } from "../../lib/explain-client";
import { correctAnswerText } from "../../lib/answer-verdict";
import {
  doneSummary,
  dueCount,
  emptyBody,
  reviewProgress,
  reviewStage,
} from "../../lib/review-state";
import { SaveWordProvider } from "../../components/SaveWord";
import { VocabImage } from "../../components/VocabImage";
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
import { TranslateAnswer } from "../../components/TranslateAnswer";
import type { TranslationVerdict } from "../api/grade-translation";

export const Route = createFileRoute("/_authenticated/review")({
  component: ReviewPageWithSave,
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

/** Tapping a word in this page's text opens the save dialog (phase 4 of save-any-word). */
function ReviewPageWithSave() {
  return (
    <SaveWordProvider>
      <ReviewPage />
    </SaveWordProvider>
  );
}

type Card = { itemKey: string; question: Question };

function ReviewPage() {
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
  // For a translate item the SERVER decides, and this holds what it decided.
  // The player displays this rather than computing its own verdict, which is
  // what makes a disagreement between screen and scheduler impossible rather
  // than merely unlikely -- the failure mode being "Still got it" on an item
  // that was just lapsed.
  const [translationVerdict, setTranslationVerdict] = useState<TranslationVerdict | null>(null);
  const [checking, setChecking] = useState(false);
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
          // Self-contained rows ('weakness' from Hector, 'saved_word' from
          // save-any-word, 'podcast_quiz' from a missed podcast quiz question)
          // carry their own prompt, choices and answer: there is
          // no bundled question to look up, and dropping them here would still
          // leave them counted in the queue total.
          if (
            item.source === "weakness" ||
            item.source === "saved_word" ||
            item.source === "podcast_quiz"
          ) {
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
    return deriveAnswerCorrectness(q, submittedAnswer, course);
  }, [q, submittedAnswer, course]);

  // What the learner is shown. For translate that is the server's verdict,
  // which is the only one that knows about the AI second opinion.
  const shownCorrect =
    q?.type === "translate" && translationVerdict ? translationVerdict.correct : isCorrect;

  function check() {
    if (!card || !submittedAnswer) return;

    // Every type except translate is graded by pure string comparison on both
    // sides, so the local verdict cannot disagree with the server's and the
    // feedback can show immediately rather than waiting on the network.
    if (q?.type !== "translate") {
      setChecked(true);
      const ok = isCorrect;
      setStats((s) => ({ ...s, right: s.right + (ok ? 1 : 0), wrong: s.wrong + (ok ? 0 : 1) }));
      void grade({ data: { itemKey: card.itemKey, answer: submittedAnswer, course } })
        .then((r) => {
          if (r.retired) setStats((s) => ({ ...s, retired: s.retired + 1 }));
        })
        .catch(() => {});
      return;
    }

    // A translation waits, because the curated phrasings are only a floor and
    // the AI second opinion that can lift them runs server-side.
    setChecking(true);
    void grade({ data: { itemKey: card.itemKey, answer: submittedAnswer, course } })
      .then((r) => {
        const ok = typeof r.correct === "boolean" ? r.correct : isCorrect;
        setTranslationVerdict({ correct: ok, reason: null, source: "local" });
        setStats((s) => ({ ...s, right: s.right + (ok ? 1 : 0), wrong: s.wrong + (ok ? 0 : 1) }));
        if (r.retired) setStats((s) => ({ ...s, retired: s.retired + 1 }));
      })
      .catch(() => {
        // Unreachable server: fall back to the local verdict rather than
        // leaving the learner on a question that will not resolve.
        setTranslationVerdict({ correct: isCorrect, reason: null, source: "local" });
        setStats((s) => ({
          ...s,
          right: s.right + (isCorrect ? 1 : 0),
          wrong: s.wrong + (isCorrect ? 0 : 1),
        }));
      })
      .finally(() => {
        setChecking(false);
        setChecked(true);
      });
  }

  function next() {
    setIdx((i) => i + 1);
    setPicked(null);
    setOrderPicks([]);
    setChecked(false);
    setTranslationVerdict(null);
  }

  const stage = reviewStage(cards === null ? null : cards.length, idx);

  if (stage === "loading") {
    return (
      <LessonScreen>
        <div className="grid flex-1 place-items-center p-6 ds-type-footnote text-ds-ink-soft">
          Loading your review queue…
        </div>
      </LessonScreen>
    );
  }

  if (stage === "empty") {
    return (
      <LessonScreen>
        <Empty title="Nothing due today" body={emptyBody(total)} />
      </LessonScreen>
    );
  }

  if (stage === "done" || !card || !q || !cards) {
    return (
      <LessonScreen>
        <Empty
          title="Review complete"
          body={doneSummary(stats)}
          bonus={heartBonusGranted ? "Queue cleared: +1 heart" : undefined}
        />
      </LessonScreen>
    );
  }

  const due = dueCount(idx, cards.length);
  const voice = canSpeak();
  const bubbleLabel =
    q.type === "listening"
      ? "Listening"
      : q.type === "speak"
        ? "Speaking"
        : q.type === "translate"
          ? "Write it yourself"
          : "Alphonso asks";
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
  const hasImage = q.type === "mc" && !!q.imageKey && !!VOCAB_IMAGES[q.imageKey];

  return (
    <LessonScreen>
      <div className="flex flex-1 flex-col">
        <div className="flex items-center gap-3 px-4 pt-3">
          <span
            data-review-course=""
            className="inline-flex h-11 shrink-0 items-center rounded-full bg-ds-card px-3.5 ds-type-footnote font-extrabold text-ds-brand shadow-[var(--ds-shadow-resting)]"
          >
            {course.toUpperCase()}
          </span>
          <div
            role="progressbar"
            aria-label="Review progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(reviewProgress(idx, cards.length, checked) * 100)}
            className="h-4 min-w-0 flex-1 overflow-hidden rounded-lg bg-ds-sunk"
          >
            <div
              className="h-full rounded-lg bg-ds-action transition-[width] duration-[var(--ds-duration-progress)] ease-[var(--ds-ease-out)] motion-reduce:transition-none"
              style={{ width: `${reviewProgress(idx, cards.length, checked) * 100}%` }}
            />
          </div>
          <DsPill tone="xp">
            <span className="tnum">
              {due.position}/{due.of}
            </span>
            &nbsp;due
          </DsPill>
          <Link to="/learn" className={dsButtonClass("secondary", { small: true })}>
            Done
          </Link>
        </div>

        <ReviewScene pose="reading" />

        <div className="relative z-[4] flex flex-1 flex-col gap-3 px-4 pb-4">
          <div className="-mt-6">
            <AlphonsoBubble
              label={bubbleLabel}
              onPlay={onPlay}
              playLabel={q.type === "listening" ? "Play audio" : "Play the question"}
              compact={q.prompt.length > 60}
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
          {/* A listening question is unanswerable without audio, so when the browser cannot speak, the sentence is
              shown instead -- same reasoning as the lesson player's identical fallback. */}
          {q.type === "listening" && !voice && (
            <div className="rounded-[18px] bg-ds-card px-4 py-3 shadow-[var(--ds-shadow-resting)]">
              <p className="ds-type-caption text-ds-ink-soft">
                Audio is unavailable on this device — here is what you would hear:
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
                // Fresh capture state per item -- same reasoning as the lesson player's identical key.
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
            correct={shownCorrect}
            title={shownCorrect ? "Still got it." : "Back in the queue."}
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
              shownCorrect ? null : (
                <ExplainInMyLanguage request={wrongAnswerRequest(q, submittedAnswer, course)} />
              )
            }
            continueLabel={idx < cards.length - 1 ? "Continue" : "Finish"}
            onContinue={next}
          />
        ) : (
          <div
            data-dock=""
            className="sticky bottom-0 z-20 bg-ds-surface/95 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3"
          >
            <button
              disabled={
                // `checking` matters as much as the emptiness check: `checked` only flips in the .finally(), so
                // without it the button stays live for the whole round trip and a second tap grades the item
                // twice -- two vendor calls, double-counted stats, and a second call the server rejects as
                // not-yet-due, whose failure path then overwrites the verdict with the local one.
                checking ||
                (q.type === "reorder"
                  ? orderPicks.length !== q.tokens.length
                  : // Whitespace is not an answer.
                    !picked?.trim())
              }
              onClick={check}
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

/** The Hector library scene at the top of every Review screen, with Alphonso reading in front of it. */
function ReviewScene({ pose, tall = false }: { pose: "reading" | "proud"; tall?: boolean }) {
  return (
    <div
      data-review-scene=""
      className={`relative mx-4 mt-3 overflow-hidden rounded-3xl bg-ds-sunk bg-cover ${tall ? "h-[230px]" : "h-[150px]"}`}
      style={{ backgroundImage: "url(/scenes/hector.jpg)", backgroundPosition: "center 30%" }}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(transparent, color-mix(in srgb, var(--c-hero-b) 55%, transparent))",
        }}
      />
      <img
        src={
          pose === "reading" ? "/figures/alphonso-reading-book.webp" : "/figures/alphonso-proud.png"
        }
        alt={pose === "reading" ? "" : "Alphonso, proud"}
        decoding="async"
        draggable={false}
        className={`absolute -bottom-1.5 right-3 w-auto ${tall ? "h-[220px]" : "h-[140px]"}`}
      />
    </div>
  );
}

/** The Review screen's empty and finished cards: the scene, a card with what happened, and the way back. */
export function Empty({ title, body, bonus }: { title: string; body: string; bonus?: string }) {
  const isComplete = title === "Review complete";
  return (
    <div className="flex flex-1 flex-col pb-6">
      <ReviewScene pose={isComplete ? "proud" : "reading"} tall />
      <div className="relative z-[4] -mt-6 grid gap-3 px-4">
        <div className="grid justify-items-center gap-2 rounded-[22px] border-2 border-ds-line bg-ds-card p-4 text-center shadow-[var(--ds-shadow-floating)]">
          <h1 className="ds-type-display text-ds-ink">{title}</h1>
          <p className="ds-type-body max-w-[300px] text-ds-ink-soft">{body}</p>
          {bonus && (
            <p className="inline-flex items-center gap-1.5 rounded-full bg-ds-heart-tint px-3 py-1.5 ds-type-footnote font-extrabold text-ds-heart-text">
              <Icon name="red_heart" size={20} />
              {bonus}
            </p>
          )}
        </div>
        <Link to="/learn" className={edgeButtonClass("primary")}>
          Back to path
        </Link>
      </div>
    </div>
  );
}
