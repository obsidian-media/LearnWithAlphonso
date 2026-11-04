import type { PodcastQuizResult } from "./podcast-quiz.functions";

export type QuizQuestion = {
  id: string;
  prompt: string;
  choices: string[];
  /** Used only to show the learner which answer was right; the score is always the server's. */
  answerIndex: number;
};

export type QuizState = {
  questions: QuizQuestion[];
  phase: "empty" | "answering" | "submitting" | "done" | "error";
  index: number;
  selected: number | null;
  checked: boolean;
  answers: { questionId: string; choiceIndex: number }[];
  result?: PodcastQuizResult;
  error?: string;
};

export type QuizAction =
  | { type: "select"; index: number }
  | { type: "check" }
  | { type: "next" }
  | { type: "saved"; result: PodcastQuizResult }
  | { type: "failed"; message: string }
  | { type: "retry" };

export function startQuiz(questions: QuizQuestion[]): QuizState {
  return {
    questions,
    phase: questions.length === 0 ? "empty" : "answering",
    index: 0,
    selected: null,
    checked: false,
    answers: [],
  };
}

export function currentQuestion(state: QuizState): QuizQuestion | undefined {
  return state.questions[state.index];
}

/** What is sent to the server: the choices only. */
export function answersPayload(state: QuizState): { questionId: string; choiceIndex: number }[] {
  return state.answers.map(({ questionId, choiceIndex }) => ({ questionId, choiceIndex }));
}

export function quizReducer(state: QuizState, action: QuizAction): QuizState {
  switch (action.type) {
    case "select": {
      const q = currentQuestion(state);
      if (state.phase !== "answering" || state.checked || !q) return state;
      if (!Number.isInteger(action.index) || action.index < 0 || action.index >= q.choices.length)
        return state;
      return { ...state, selected: action.index };
    }
    case "check":
      if (state.phase !== "answering" || state.selected === null) return state;
      return { ...state, checked: true };
    case "next": {
      const q = currentQuestion(state);
      if (state.phase !== "answering" || !state.checked || state.selected === null || !q)
        return state;
      const answers = [...state.answers, { questionId: q.id, choiceIndex: state.selected }];
      const last = state.index + 1 >= state.questions.length;
      return last
        ? { ...state, answers, phase: "submitting", selected: null, checked: false }
        : { ...state, answers, index: state.index + 1, selected: null, checked: false };
    }
    case "saved":
      return state.phase === "submitting"
        ? { ...state, phase: "done", result: action.result }
        : state;
    case "failed":
      return state.phase === "submitting"
        ? { ...state, phase: "error", error: action.message }
        : state;
    case "retry":
      return state.phase === "error" ? { ...state, phase: "submitting", error: undefined } : state;
  }
}
