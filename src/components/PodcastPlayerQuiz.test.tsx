// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePodcastPlayer } from "../lib/podcast-player";

const fetchPodcastQuiz = vi.fn();
vi.mock("../lib/podcast-quiz.functions", () => ({
  fetchPodcastQuiz,
  completePodcastQuiz: vi.fn(),
}));

const { PodcastPlayer } = await import("./PodcastPlayer");

const episode = {
  id: "11111111-1111-4111-8111-111111111111",
  folderId: "22222222-2222-4222-8222-222222222222",
  slug: "ordering-coffee",
  title: "Ordering Coffee",
  description: null,
  audioUrl: "https://example.test/a.mp3",
  durationSeconds: 300,
  positionSeconds: 0,
  aiNarrated: false,
  course: "en" as const,
};
const offer = {
  questions: [
    { id: "q1", prompt: "First?", choices: ["a", "b"], answerIndex: 0 },
    { id: "q2", prompt: "Second?", choices: ["a", "b"], answerIndex: 1 },
  ],
  best: null,
};

beforeEach(() => {
  fetchPodcastQuiz.mockReset();
  usePodcastPlayer.getState().close();
});

describe("PodcastPlayer quiz entry point", () => {
  it("offers nothing while the episode is playing", async () => {
    fetchPodcastQuiz.mockResolvedValue(offer);
    usePodcastPlayer.getState().play(episode);
    render(<PodcastPlayer />);
    expect(screen.queryByText("Test what you heard")).not.toBeInTheDocument();
    expect(fetchPodcastQuiz).not.toHaveBeenCalled();
  });

  it("offers the quiz once the episode has played to its end, then opens it", async () => {
    fetchPodcastQuiz.mockResolvedValue(offer);
    usePodcastPlayer.getState().play(episode);
    render(<PodcastPlayer />);
    act(() => usePodcastPlayer.getState().markFinished());

    expect(await screen.findByText("Test what you heard")).toBeInTheDocument();
    expect(screen.getByText(/2 questions · 10 XP for each correct answer/)).toBeInTheDocument();
    expect(fetchPodcastQuiz).toHaveBeenCalledWith({ data: { episodeId: episode.id } });

    await userEvent.click(screen.getByRole("button", { name: "Take the quiz" }));
    expect(await screen.findByText("First?")).toBeInTheDocument();
  });

  it("shows the learner's banked best on the offer", async () => {
    fetchPodcastQuiz.mockResolvedValue({ ...offer, best: { correct: 2, xp: 20 } });
    usePodcastPlayer.getState().play(episode);
    render(<PodcastPlayer />);
    act(() => usePodcastPlayer.getState().markFinished());
    expect(await screen.findByText(/your best: 2 of 2/)).toBeInTheDocument();
  });

  it("offers nothing for an episode that has no quiz", async () => {
    fetchPodcastQuiz.mockResolvedValue(null);
    usePodcastPlayer.getState().play(episode);
    render(<PodcastPlayer />);
    act(() => usePodcastPlayer.getState().markFinished());
    await waitFor(() => expect(fetchPodcastQuiz).toHaveBeenCalled());
    expect(screen.queryByText("Test what you heard")).not.toBeInTheDocument();
  });

  it("a failed read leaves the player as it was, with no offer and no error", async () => {
    fetchPodcastQuiz.mockRejectedValue(new Error("offline"));
    usePodcastPlayer.getState().play(episode);
    render(<PodcastPlayer />);
    act(() => usePodcastPlayer.getState().markFinished());
    await waitFor(() => expect(fetchPodcastQuiz).toHaveBeenCalled());
    expect(screen.queryByText("Test what you heard")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("Ordering Coffee")).toBeInTheDocument();
  });

  it("the offer goes away when the learner plays the episode again", async () => {
    fetchPodcastQuiz.mockResolvedValue(offer);
    usePodcastPlayer.getState().play(episode);
    render(<PodcastPlayer />);
    act(() => usePodcastPlayer.getState().markFinished());
    await screen.findByText("Test what you heard");
    act(() => usePodcastPlayer.getState().toggle());
    await waitFor(() => expect(screen.queryByText("Test what you heard")).not.toBeInTheDocument());
  });
});
