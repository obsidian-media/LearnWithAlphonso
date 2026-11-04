import { describe, expect, it } from "vitest";
import {
  answersPayload,
  currentQuestion,
  quizReducer,
  startQuiz,
  type QuizQuestion,
} from "./podcast-quiz-run";

const questions: QuizQuestion[] = [
  { id: "q1", prompt: "First?", choices: ["a", "b", "c"], answerIndex: 1 },
  { id: "q2", prompt: "Second?", choices: ["a", "b", "c"], answerIndex: 0 },
];

function play(picks: number[]) {
  let s = startQuiz(questions);
  for (const pick of picks) {
    s = quizReducer(s, { type: "select", index: pick });
    s = quizReducer(s, { type: "check" });
    s = quizReducer(s, { type: "next" });
  }
  return s;
}

describe("podcast quiz run", () => {
  it("starts on the first question with nothing chosen", () => {
    const s = startQuiz(questions);
    expect(s).toMatchObject({
      phase: "answering",
      index: 0,
      selected: null,
      checked: false,
      answers: [],
    });
    expect(currentQuestion(s)?.id).toBe("q1");
  });

  it("will not check until a choice is picked, and will not move on until checked", () => {
    let s = startQuiz(questions);
    s = quizReducer(s, { type: "check" });
    expect(s.checked).toBe(false);
    s = quizReducer(s, { type: "select", index: 2 });
    s = quizReducer(s, { type: "next" });
    expect(s.index).toBe(0);
    expect(s.answers).toEqual([]);
  });

  it("locks the choice once it is checked", () => {
    let s = startQuiz(questions);
    s = quizReducer(s, { type: "select", index: 2 });
    s = quizReducer(s, { type: "check" });
    s = quizReducer(s, { type: "select", index: 1 });
    expect(s.selected).toBe(2);
  });

  it("ignores a choice that does not exist", () => {
    let s = startQuiz(questions);
    s = quizReducer(s, { type: "select", index: 7 });
    s = quizReducer(s, { type: "select", index: -1 });
    expect(s.selected).toBeNull();
  });

  it("records one answer per question and goes to submitting after the last", () => {
    const s = play([1, 2]);
    expect(s.phase).toBe("submitting");
    expect(answersPayload(s)).toEqual([
      { questionId: "q1", choiceIndex: 1 },
      { questionId: "q2", choiceIndex: 2 },
    ]);
  });

  it("sends only the choices, never a score", () => {
    const payload = answersPayload(play([1, 0]));
    for (const a of payload) expect(Object.keys(a).sort()).toEqual(["choiceIndex", "questionId"]);
  });

  it("keeps the answers when saving fails, so a retry resubmits the same ones", () => {
    let s = play([1, 0]);
    s = quizReducer(s, { type: "failed", message: "Slow down" });
    expect(s).toMatchObject({ phase: "error", error: "Slow down" });
    const before = answersPayload(s);
    s = quizReducer(s, { type: "retry" });
    expect(s.phase).toBe("submitting");
    expect(answersPayload(s)).toEqual(before);
  });

  it("finishes with the server's result and nothing from the client's own marking", () => {
    let s = play([1, 0]);
    const result = {
      status: "applied" as const,
      correct: 1,
      total: 2,
      xpGain: 10,
      bestCorrect: 1,
      bestXp: 10,
      missedQuestionIds: ["q2"],
    };
    s = quizReducer(s, { type: "saved", result });
    expect(s).toMatchObject({ phase: "done", result });
  });

  it("an empty quiz is never started", () => {
    expect(startQuiz([]).phase).toBe("empty");
  });
});
