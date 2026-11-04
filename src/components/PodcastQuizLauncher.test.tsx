// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchPodcastQuiz = vi.fn();
const completePodcastQuiz = vi.fn();
vi.mock("../lib/podcast-quiz.functions", () => ({ fetchPodcastQuiz, completePodcastQuiz }));

const { PodcastQuizLauncher } = await import("./PodcastQuizLauncher");

const episode = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Ordering Coffee",
  course: "en",
};
const offer = {
  questions: [{ id: "q1", prompt: "First?", choices: ["a", "b"], answerIndex: 0 }],
  best: { correct: 1, xp: 10 },
};

beforeEach(() => {
  fetchPodcastQuiz.mockReset();
  completePodcastQuiz.mockReset();
});

describe("PodcastQuizLauncher (the row's Take the quiz)", () => {
  it("is named for its episode and fetches the quiz only when pressed", async () => {
    fetchPodcastQuiz.mockResolvedValue(offer);
    render(<PodcastQuizLauncher episode={episode} />);
    expect(fetchPodcastQuiz).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Take the quiz: Ordering Coffee" }));
    expect(fetchPodcastQuiz).toHaveBeenCalledWith({ data: { episodeId: episode.id } });
    expect(await screen.findByText("First?")).toBeInTheDocument();
    expect(screen.getByText(/your best: 1 of 1/)).toBeInTheDocument();
  });

  it("says so when the quiz cannot be opened, instead of doing nothing", async () => {
    fetchPodcastQuiz.mockResolvedValue(null);
    render(<PodcastQuizLauncher episode={episode} />);
    await userEvent.click(screen.getByRole("button", { name: /Take the quiz/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("isn't available right now");
    fetchPodcastQuiz.mockRejectedValue(new Error("offline"));
    await userEvent.click(screen.getByRole("button", { name: /Take the quiz/ }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  });

  it("reopens with the better best after a run, without reading the quiz again", async () => {
    fetchPodcastQuiz.mockResolvedValue({ ...offer, best: null });
    completePodcastQuiz.mockResolvedValue({
      status: "applied",
      correct: 1,
      total: 1,
      xpGain: 10,
      streak: 1,
      bestCorrect: 1,
      bestXp: 10,
      missedQuestionIds: [],
    });
    render(<PodcastQuizLauncher episode={episode} />);
    await userEvent.click(screen.getByRole("button", { name: /Take the quiz/ }));
    await userEvent.click(await screen.findByRole("radio", { name: "a" }));
    await userEvent.click(screen.getByRole("button", { name: "Check" }));
    await userEvent.click(screen.getByRole("button", { name: "Finish" }));
    await screen.findByText("1 of 1 correct");
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    await userEvent.click(screen.getByRole("button", { name: /Take the quiz/ }));
    expect(await screen.findByText(/your best: 1 of 1/)).toBeInTheDocument();
    expect(fetchPodcastQuiz).toHaveBeenCalledTimes(1);
  });
});
