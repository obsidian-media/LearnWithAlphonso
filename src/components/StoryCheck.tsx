import { useEffect, useReducer } from "react";
import type { PodcastQuizResult } from "../lib/podcast-quiz.functions";
import {
  answersPayload,
  currentQuestion,
  quizFailure,
  quizReducer,
  startQuiz,
  type QuizQuestion,
} from "../lib/podcast-quiz-run";
import { DsButton, DsCard, Overline } from "./ds/Blocks";

type Props = {
  questions: QuizQuestion[];
  /** Sends the answers; the server grades and credits the reading skill. Rejects with the quiz error codes. */
  submit: (answers: { questionId: string; choiceIndex: number }[]) => Promise<PodcastQuizResult>;
  onSaved?: (result: PodcastQuizResult) => void;
};

/**
 * The short comprehension check at the end of a story. The same state machine as the podcast quiz (pick, check, next,
 * save), shown inline under the text. The right answer revealed after each check is for the learner; the score is always
 * the server's. Right and wrong are said in words as well as colour.
 */
export function StoryCheck({ questions, submit, onSaved }: Props) {
  const [state, dispatch] = useReducer(quizReducer, questions, startQuiz);

  useEffect(() => {
    if (state.phase !== "submitting") return;
    const payload = answersPayload(state);
    void (async () => {
      try {
        const result = await submit(payload);
        onSaved?.(result);
        dispatch({ type: "saved", result });
      } catch (err) {
        dispatch({ type: "failed", ...quizFailure(err) });
      }
    })();
    // Only entering the phase starts a request; the payload is fixed by then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);

  const q = currentQuestion(state);
  if (state.phase === "empty") return null;

  return (
    <DsCard data-story-check="">
      <Overline>Check your understanding</Overline>
      {state.phase === "answering" && q ? (
        <>
          <p className="ds-type-caption text-ds-ink-soft">
            Question {state.index + 1} of {state.questions.length}
          </p>
          <p className="ds-type-question-small text-ds-brand">{q.prompt}</p>
          <div role="radiogroup" aria-label={q.prompt} className="grid gap-2">
            {q.choices.map((choice, i) => {
              const picked = state.selected === i;
              const right = state.checked && i === q.answerIndex;
              const wrong = state.checked && picked && i !== q.answerIndex;
              return (
                <button
                  key={choice}
                  type="button"
                  role="radio"
                  aria-checked={picked}
                  disabled={state.checked}
                  onClick={() => dispatch({ type: "select", index: i })}
                  className={[
                    "rounded-[16px] border-2 border-b-4 px-4 py-3.5 text-left ds-type-answer",
                    right
                      ? "border-ds-right bg-ds-right-tint text-ds-right-ink"
                      : wrong
                        ? "border-ds-wrong bg-ds-wrong-tint text-ds-wrong-ink"
                        : picked
                          ? "border-ds-choice bg-ds-choice-tint text-ds-brand"
                          : "border-ds-line bg-ds-card text-ds-brand",
                  ].join(" ")}
                >
                  <span className="block">{choice}</span>
                  {right ? (
                    <span data-testid="verdict" className="mt-1 block ds-type-caption">
                      <span aria-hidden="true">✓ </span>Correct answer
                    </span>
                  ) : null}
                  {wrong ? (
                    <span data-testid="verdict" className="mt-1 block ds-type-caption">
                      <span aria-hidden="true">✕ </span>Your answer, not correct
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          <DsButton
            small
            disabled={!state.checked && state.selected === null}
            onClick={() => dispatch({ type: state.checked ? "next" : "check" })}
          >
            {!state.checked
              ? "Check"
              : state.index + 1 >= state.questions.length
                ? "Finish"
                : "Next"}
          </DsButton>
        </>
      ) : null}

      {state.phase === "submitting" ? (
        <p role="status" className="ds-type-footnote text-ds-ink-soft">
          Saving your answers…
        </p>
      ) : null}

      {state.phase === "error" ? (
        <>
          <p role="alert" className="ds-type-footnote font-bold text-ds-wrong-ink">
            {state.error}
          </p>
          {state.retryable !== false ? (
            <DsButton small onClick={() => dispatch({ type: "retry" })}>
              Try again
            </DsButton>
          ) : null}
        </>
      ) : null}

      {state.phase === "done" && state.result ? (
        <>
          <p className="ds-type-display text-ds-ink" data-story-score="">
            {state.result.correct} of {state.result.total} correct
          </p>
          <p role="status" className="ds-type-footnote text-ds-ink-soft">
            This counts toward your reading practice.
          </p>
          {state.result.missedQuestionIds.length > 0 ? (
            <ul className="grid gap-2">
              {state.questions
                .filter((x) => state.result?.missedQuestionIds.includes(x.id))
                .map((x) => (
                  <li
                    key={x.id}
                    className="rounded-[14px] bg-ds-sunk px-3 py-2 ds-type-footnote text-ds-ink"
                  >
                    {x.prompt}
                    <span className="block text-ds-ink-soft">
                      Answer: {x.choices[x.answerIndex]}
                    </span>
                  </li>
                ))}
            </ul>
          ) : null}
        </>
      ) : null}
    </DsCard>
  );
}
