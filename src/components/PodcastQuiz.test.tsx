// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useProgress } from "../lib/progress";

const completePodcastQuiz = vi.fn();
vi.mock("../lib/podcast-quiz.functions", () => ({ completePodcastQuiz }));

const { PodcastQuiz } = await import("./PodcastQuiz");

const EP = "11111111-1111-4111-8111-111111111111";
const questions = [
  { id: "q1", prompt: "Which is first?", choices: ["Alpha", "Beta", "Gamma"], answerIndex: 1 },
  { id: "q2", prompt: "Which is second?", choices: ["Delta", "Epsilon"], answerIndex: 0 },
];

function renderQuiz(overrides: Partial<React.ComponentProps<typeof PodcastQuiz>> = {}) {
  const onClose = vi.fn();
  render(
    <PodcastQuiz
      title="Ordering Coffee"
      episodeId={EP}
      course="en"
      questions={questions}
      best={null}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { onClose, user: userEvent.setup() };
}

async function answerAll(user: ReturnType<typeof userEvent.setup>, picks: string[]) {
  for (let i = 0; i < picks.length; i++) {
    await user.click(screen.getByRole("radio", { name: picks[i] }));
    await user.click(screen.getByRole("button", { name: "Check" }));
    await user.click(
      screen.getByRole("button", { name: i === picks.length - 1 ? "Finish" : "Next" }),
    );
  }
}

beforeEach(() => {
  completePodcastQuiz.mockReset();
  useProgress.setState({ xp: 100, course: "en" });
});

describe("PodcastQuiz", () => {
  it("shows one question at a time and cannot be checked before a choice is made", async () => {
    const { user } = renderQuiz();
    expect(screen.getByText("Which is first?")).toBeInTheDocument();
    expect(screen.getByText(/Question 1 of 2/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check" })).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: "Alpha" }));
    expect(screen.getByRole("button", { name: "Check" })).toBeEnabled();
  });

  it("tells the learner which answer was right after checking, in text and not only colour", async () => {
    const { user } = renderQuiz();
    await user.click(screen.getByRole("radio", { name: "Alpha" }));
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(screen.getByText("(correct answer)")).toBeInTheDocument();
    expect(screen.getByText("(your answer, not correct)")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Beta/ })).toBeDisabled();
  });

  it("sends the chosen answers only, then shows the server's score and XP and updates the XP total", async () => {
    completePodcastQuiz.mockResolvedValue({
      status: "applied",
      correct: 1,
      total: 2,
      xpGain: 10,
      bestCorrect: 1,
      bestXp: 10,
      missedQuestionIds: ["q2"],
    });
    const { user } = renderQuiz();
    await answerAll(user, ["Beta", "Epsilon"]);

    expect(await screen.findByText("1 of 2 correct")).toBeInTheDocument();
    expect(screen.getByText("+10 XP")).toBeInTheDocument();
    expect(completePodcastQuiz).toHaveBeenCalledTimes(1);
    expect(completePodcastQuiz).toHaveBeenCalledWith({
      data: {
        episodeId: EP,
        answers: [
          { questionId: "q1", choiceIndex: 1 },
          { questionId: "q2", choiceIndex: 1 },
        ],
      },
    });
    expect(useProgress.getState().xp).toBe(110);
    // The missed question is reviewed with its answer.
    expect(screen.getByText("Answer: Delta")).toBeInTheDocument();
  });

  it("the score on screen is the server's, whatever the learner's own marking said", async () => {
    completePodcastQuiz.mockResolvedValue({
      status: "applied",
      correct: 0,
      total: 2,
      xpGain: 0,
      bestCorrect: 0,
      bestXp: 0,
      missedQuestionIds: ["q1", "q2"],
    });
    const { user } = renderQuiz();
    await answerAll(user, ["Beta", "Delta"]); // both right locally
    expect(await screen.findByText("0 of 2 correct")).toBeInTheDocument();
  });

  it("a replay with no improvement says so and does not touch the XP total", async () => {
    completePodcastQuiz.mockResolvedValue({
      status: "applied",
      correct: 1,
      total: 2,
      xpGain: 0,
      bestCorrect: 2,
      bestXp: 20,
      missedQuestionIds: ["q2"],
    });
    const { user } = renderQuiz({ best: { correct: 2, xp: 20 } });
    expect(screen.getByText(/your best: 2 of 2/)).toBeInTheDocument();
    await answerAll(user, ["Beta", "Epsilon"]);
    expect(
      await screen.findByText(/No new XP this time. Your best is 2 of 2./),
    ).toBeInTheDocument();
    expect(useProgress.getState().xp).toBe(100);
  });

  it("XP for another course's episode does not change the active course's total", async () => {
    completePodcastQuiz.mockResolvedValue({
      status: "applied",
      correct: 2,
      total: 2,
      xpGain: 20,
      bestCorrect: 2,
      bestXp: 20,
      missedQuestionIds: [],
    });
    const { user } = renderQuiz({ course: "fr" });
    await answerAll(user, ["Beta", "Delta"]);
    await screen.findByText("2 of 2 correct");
    expect(useProgress.getState().xp).toBe(100);
  });

  it("a refusal for going too fast is calm, keeps the answers, and retry sends the same ones", async () => {
    completePodcastQuiz.mockRejectedValueOnce(new Error("rate-limited"));
    completePodcastQuiz.mockResolvedValueOnce({
      status: "applied",
      correct: 2,
      total: 2,
      xpGain: 20,
      bestCorrect: 2,
      bestXp: 20,
      missedQuestionIds: [],
    });
    const { user } = renderQuiz();
    await answerAll(user, ["Beta", "Delta"]);
    expect(await screen.findByRole("alert")).toHaveTextContent("Slow down a little and try again.");

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("2 of 2 correct")).toBeInTheDocument();
    expect(completePodcastQuiz).toHaveBeenCalledTimes(2);
    expect(completePodcastQuiz.mock.calls[1]![0]).toEqual(completePodcastQuiz.mock.calls[0]![0]);
  });

  it("any other failure offers a retry and never shows a score", async () => {
    completePodcastQuiz.mockRejectedValue(new Error("boom"));
    const { user } = renderQuiz();
    await answerAll(user, ["Beta", "Delta"]);
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't save/);
    expect(screen.queryByText(/correct$/)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled());
  });

  it("sends once even when React runs effects twice (development StrictMode)", async () => {
    completePodcastQuiz.mockResolvedValue({
      status: "applied",
      correct: 2,
      total: 2,
      xpGain: 20,
      bestCorrect: 2,
      bestXp: 20,
      missedQuestionIds: [],
    });
    const user = userEvent.setup();
    render(
      <StrictMode>
        <PodcastQuiz
          title="T"
          episodeId={EP}
          course="en"
          questions={questions}
          best={null}
          onClose={vi.fn()}
        />
      </StrictMode>,
    );
    await answerAll(user, ["Beta", "Delta"]);
    await screen.findByText("2 of 2 correct");
    expect(completePodcastQuiz).toHaveBeenCalledTimes(1);
    expect(useProgress.getState().xp).toBe(120);
  });

  it("leaving closes the dialog", async () => {
    const { user, onClose } = renderQuiz();
    await user.click(screen.getByRole("button", { name: "Leave quiz" }));
    expect(onClose).toHaveBeenCalled();
  });
});
