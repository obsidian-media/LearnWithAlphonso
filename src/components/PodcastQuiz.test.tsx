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

  it("states right and wrong in visible words and icons, not only colour or screen-reader text", async () => {
    const { user } = renderQuiz();
    await user.click(screen.getByRole("radio", { name: "Alpha" }));
    await user.click(screen.getByRole("button", { name: "Check" }));

    const verdicts = screen.getAllByTestId("verdict");
    expect(verdicts.map((v) => v.textContent)).toEqual([
      "✕ Your answer, not correct",
      "✓ Correct answer",
    ]);
    // Visible to a sighted learner: not inside a screen-reader-only (clipped) element.
    for (const verdict of verdicts) {
      expect(verdict.closest(".sr-only")).toBeNull();
      expect(verdict).toBeVisible();
    }
    // The icon is decoration; the words carry the meaning for a screen reader.
    expect(verdicts[1]!.querySelector('[aria-hidden="true"]')?.textContent).toBe("✓ ");
    expect(screen.getByRole("radio", { name: /Beta.*Correct answer/ })).toBeDisabled();
  });

  it("keeps keyboard focus on the same button when Check becomes Next", async () => {
    const { user } = renderQuiz();
    await user.click(screen.getByRole("radio", { name: "Alpha" }));
    const action = screen.getByRole("button", { name: "Check" });
    action.focus();
    await user.keyboard("{Enter}");
    const next = screen.getByRole("button", { name: "Next" });
    expect(next).toBe(action);
    expect(next).toHaveFocus();
  });

  it("moves through the choices with the arrow keys like a radio group, with one tab stop", async () => {
    const { user } = renderQuiz();
    const radios = () => screen.getAllByRole("radio");
    expect(radios().map((r) => r.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);
    radios()[0]!.focus();
    await user.keyboard("{ArrowDown}");
    expect(radios()[1]).toHaveFocus();
    expect(radios()[1]).toHaveAttribute("aria-checked", "true");
    expect(radios().map((r) => r.getAttribute("tabindex"))).toEqual(["-1", "0", "-1"]);
    await user.keyboard("{ArrowRight}{ArrowRight}"); // wraps
    expect(radios()[0]).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(radios()[2]).toHaveFocus();
    expect(radios()[2]).toHaveAttribute("aria-checked", "true");
  });

  it("the arrow keys do nothing once the answer is checked", async () => {
    const { user } = renderQuiz();
    await user.click(screen.getByRole("radio", { name: "Alpha" }));
    await user.click(screen.getByRole("button", { name: "Check" }));
    screen.getByRole("button", { name: "Next" }).focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("button", { name: "Next" })).toHaveFocus();
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

  it("a quiz that is gone says so plainly and offers no endless Try again", async () => {
    completePodcastQuiz.mockRejectedValue(new Error("not-found"));
    const { user } = renderQuiz();
    await answerAll(user, ["Beta", "Delta"]);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This quiz isn't available right now.",
    );
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
    expect(completePodcastQuiz).toHaveBeenCalledTimes(1);
  });

  it("malformed answers get their own copy and no retry", async () => {
    completePodcastQuiz.mockRejectedValue(new Error("invalid-answers"));
    const { user } = renderQuiz();
    await answerAll(user, ["Beta", "Delta"]);
    expect(await screen.findByRole("alert")).toHaveTextContent(/open it again/);
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("moves focus to the result so a keyboard or screen-reader user is not left on a removed button", async () => {
    completePodcastQuiz.mockResolvedValue({
      status: "applied",
      correct: 2,
      total: 2,
      xpGain: 20,
      streak: 1,
      bestCorrect: 2,
      bestXp: 20,
      missedQuestionIds: [],
    });
    const { user } = renderQuiz();
    await answerAll(user, ["Beta", "Delta"]);
    const score = await screen.findByText("2 of 2 correct");
    await waitFor(() => expect(score.parentElement).toHaveFocus());
  });

  it("tells the caller the server's result once saved, so its best label can refresh", async () => {
    const result = {
      status: "applied",
      correct: 2,
      total: 2,
      xpGain: 20,
      streak: 1,
      bestCorrect: 2,
      bestXp: 20,
      missedQuestionIds: [],
    };
    completePodcastQuiz.mockResolvedValue(result);
    const onSaved = vi.fn();
    const { user } = renderQuiz({ onSaved });
    await answerAll(user, ["Beta", "Delta"]);
    await screen.findByText("2 of 2 correct");
    expect(onSaved).toHaveBeenCalledWith(result);
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
