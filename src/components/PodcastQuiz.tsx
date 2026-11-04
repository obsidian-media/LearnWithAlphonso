import { useEffect, useReducer, useRef } from "react";
import { useProgress } from "../lib/progress";
import type { PodcastQuizResult } from "../lib/podcast-quiz.functions";
import {
  answersPayload,
  currentQuestion,
  quizFailure,
  quizReducer,
  startQuiz,
  type QuizQuestion,
} from "../lib/podcast-quiz-run";
import { Modal } from "./Modal";

type Props = {
  title: string;
  episodeId: string;
  /** The course the episode's XP is paid into. */
  course: string;
  questions: QuizQuestion[];
  best: { correct: number; xp: number } | null;
  onClose: () => void;
  /** Called with the server's result once it is saved, so the caller can refresh its "best" label. */
  onSaved?: (result: PodcastQuizResult) => void;
};

/**
 * The quiz offered after an episode (or from its row). The learner picks an answer, checks it, and moves on; the score
 * and the XP are decided by the server from the choices alone (completePodcastQuiz). The right answer shown after each
 * check is for the learner's benefit and never affects what is paid. Right and wrong are stated in words and icons, not
 * only in colour.
 */
export function PodcastQuiz({
  title,
  episodeId,
  course,
  questions,
  best,
  onClose,
  onSaved,
}: Props) {
  const [state, dispatch] = useReducer(quizReducer, questions, startQuiz);
  const choiceRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const statusRef = useRef<HTMLDivElement | null>(null);

  // One request each time the quiz enters "submitting" (the last answer, or a retry). No cancellation: once sent, the
  // result is still saved and the XP still counted even if the learner closes the dialog.
  useEffect(() => {
    if (state.phase !== "submitting") return;
    const payload = answersPayload(state);
    void (async () => {
      try {
        const { completePodcastQuiz } = await import("../lib/podcast-quiz.functions");
        const result = await completePodcastQuiz({ data: { episodeId, answers: payload } });
        if (result.xpGain > 0 && useProgress.getState().course === course) {
          const s = useProgress.getState();
          useProgress.setState({ xp: s.xp + result.xpGain });
        }
        onSaved?.(result);
        dispatch({ type: "saved", result });
      } catch (err) {
        dispatch({ type: "failed", ...quizFailure(err) });
      }
    })();
    // The payload is fixed once the phase is "submitting"; only entering the phase should start a request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);

  // When the question area is replaced by an error or the result, focus would otherwise fall to <body>.
  useEffect(() => {
    if (state.phase === "error" || state.phase === "done") statusRef.current?.focus();
  }, [state.phase]);

  const q = currentQuestion(state);

  // Arrow keys move through the choices like a native radio group (Left/Up back, Right/Down forward, wrapping).
  const onChoiceKeyDown = (event: React.KeyboardEvent, from: number, count: number) => {
    if (state.checked) return;
    const delta =
      event.key === "ArrowDown" || event.key === "ArrowRight"
        ? 1
        : event.key === "ArrowUp" || event.key === "ArrowLeft"
          ? -1
          : 0;
    if (delta === 0) return;
    event.preventDefault();
    const next = (from + delta + count) % count;
    dispatch({ type: "select", index: next });
    choiceRefs.current[next]?.focus();
  };

  const onAction = () => dispatch({ type: state.checked ? "next" : "check" });

  return (
    <Modal labelledBy="podcast-quiz-title" onEscape={onClose} className="max-w-[430px]">
      <div className="p-5">
        <h2 id="podcast-quiz-title" className="font-display text-lg font-semibold text-ink">
          Quiz: {title}
        </h2>

        {state.phase === "answering" && q ? (
          <div className="mt-4">
            <p className="text-xs text-ink-soft/70">
              Question {state.index + 1} of {state.questions.length}
              {best ? ` · your best: ${best.correct} of ${state.questions.length}` : ""}
            </p>
            <p className="mt-2 text-base font-medium text-ink">{q.prompt}</p>
            <div role="radiogroup" aria-label={q.prompt} className="mt-3 flex flex-col gap-2">
              {q.choices.map((choice, i) => {
                const isPicked = state.selected === i;
                const isRight = state.checked && i === q.answerIndex;
                const isWrong = state.checked && isPicked && i !== q.answerIndex;
                // One tab stop for the group: the chosen answer, or the first before any is chosen.
                const tabStop = state.selected === null ? i === 0 : isPicked;
                return (
                  <button
                    key={choice}
                    ref={(el) => {
                      choiceRefs.current[i] = el;
                    }}
                    type="button"
                    role="radio"
                    aria-checked={isPicked}
                    tabIndex={tabStop ? 0 : -1}
                    disabled={state.checked}
                    onClick={() => dispatch({ type: "select", index: i })}
                    onKeyDown={(event) => onChoiceKeyDown(event, i, q.choices.length)}
                    className={[
                      "rounded-xl border px-4 py-3 text-left text-sm text-ink",
                      isRight
                        ? "border-moss bg-moss/10"
                        : isWrong
                          ? "border-rose-500 bg-rose-50"
                          : isPicked
                            ? "border-moss"
                            : "border-hairline",
                    ].join(" ")}
                  >
                    <span className="block">{choice}</span>
                    {isRight ? (
                      <span
                        data-testid="verdict"
                        className="mt-1 block text-xs font-semibold text-moss"
                      >
                        <span aria-hidden="true">✓ </span>Correct answer
                      </span>
                    ) : null}
                    {isWrong ? (
                      <span
                        data-testid="verdict"
                        className="mt-1 block text-xs font-semibold text-rose-600"
                      >
                        <span aria-hidden="true">✕ </span>Your answer, not correct
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 flex items-center justify-between">
              <button type="button" onClick={onClose} className="text-sm text-ink-soft">
                Leave quiz
              </button>
              {/* One button for Check and Next, so keyboard focus stays on it when its label changes. */}
              <button
                type="button"
                disabled={!state.checked && state.selected === null}
                onClick={onAction}
                className="rounded-full bg-moss px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                {!state.checked
                  ? "Check"
                  : state.index + 1 >= state.questions.length
                    ? "Finish"
                    : "Next"}
              </button>
            </div>
          </div>
        ) : null}

        {state.phase === "submitting" ? (
          <p role="status" className="mt-6 text-sm text-ink-soft">
            Saving your answers…
          </p>
        ) : null}

        {state.phase === "error" ? (
          <div ref={statusRef} tabIndex={-1} className="mt-4 outline-none">
            <p role="alert" className="text-sm text-rose-600">
              {state.error}
            </p>
            <div className="mt-4 flex items-center justify-between">
              <button type="button" onClick={onClose} className="text-sm text-ink-soft">
                Close
              </button>
              {state.retryable !== false ? (
                <button
                  type="button"
                  onClick={() => dispatch({ type: "retry" })}
                  className="rounded-full bg-moss px-4 py-2 text-sm font-semibold text-white"
                >
                  Try again
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {state.phase === "done" && state.result ? (
          <div ref={statusRef} tabIndex={-1} className="mt-4 outline-none">
            <p className="text-2xl font-semibold text-ink">
              {state.result.correct} of {state.result.total} correct
            </p>
            <p className="mt-1 text-sm text-ink-soft" role="status">
              {state.result.xpGain > 0
                ? `+${state.result.xpGain} XP`
                : `No new XP this time. Your best is ${state.result.bestCorrect} of ${state.result.total}.`}
            </p>
            {state.result.missedQuestionIds.length > 0 ? (
              <div className="mt-4">
                <p className="text-sm font-medium text-ink">To review</p>
                <ul className="mt-2 flex flex-col gap-2">
                  {state.questions
                    .filter((x) => state.result?.missedQuestionIds.includes(x.id))
                    .map((x) => (
                      <li key={x.id} className="text-sm text-ink">
                        {x.prompt}
                        <span className="block text-ink-soft">
                          Answer: {x.choices[x.answerIndex]}
                        </span>
                      </li>
                    ))}
                </ul>
              </div>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="mt-5 rounded-full bg-moss px-4 py-2 text-sm font-semibold text-white"
            >
              Done
            </button>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
