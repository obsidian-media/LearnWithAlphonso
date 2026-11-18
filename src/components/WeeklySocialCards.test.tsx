// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const getTeamMission = vi.fn();
const getMyTeam = vi.fn();
vi.mock("../lib/teams.functions", () => ({ getTeamMission, getMyTeam }));
const getWeeklyChallenges = vi.fn();
vi.mock("../lib/challenges.functions", () => ({ getWeeklyChallenges }));

// Dynamic import, after the mocks are registered (same reason as WeeklyChallengesCard.test).
const { WeeklySocialCards } = await import("./WeeklySocialCards");

function renderCards() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <WeeklySocialCards />
    </QueryClientProvider>,
  );
}

const myTeam = {
  teamId: "t1",
  name: "Night Owls",
  joinCode: "K7MQ2X",
  joinedAt: "2026-01-01T00:00:00Z",
  switchLockedUntil: "2020-01-01T00:00:00Z",
  thisWeekXp: 340,
  isOwner: false,
};
const challenge = {
  templateId: "xp_500",
  title: "Earn 500 XP",
  description: "This week",
  progress: 120,
  threshold: 500,
  completed: false,
};

beforeEach(() => {
  getTeamMission.mockReset();
  getMyTeam.mockReset();
  getWeeklyChallenges.mockReset();
});

describe("WeeklySocialCards", () => {
  it("shows one notice, not two stacked alerts, when both reads fail; Try again retries both", async () => {
    getTeamMission.mockRejectedValueOnce(new Error("getTeamMission: request-failed"));
    getMyTeam.mockResolvedValue(myTeam);
    getWeeklyChallenges.mockRejectedValueOnce(new Error("getWeeklyChallenges: request-failed"));
    renderCards();

    expect(
      await screen.findByText("Couldn't load your team mission or this week's challenges."),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("alert")).toHaveLength(1);

    getTeamMission.mockResolvedValue(null);
    getWeeklyChallenges.mockResolvedValue([challenge]);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Earn 500 XP")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    // Both were asked again (the cards that then mount may read once more on their own).
    expect(getTeamMission.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(getWeeklyChallenges.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("lets a single failing card speak for itself", async () => {
    getTeamMission.mockResolvedValue(null);
    getWeeklyChallenges.mockRejectedValue(new Error("getWeeklyChallenges: request-failed"));
    renderCards();

    expect(await screen.findByText("Couldn't load this week's challenges.")).toBeInTheDocument();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("shows only the challenges error to a learner with no team when both reads fail", async () => {
    getTeamMission.mockRejectedValue(new Error("getTeamMission: request-failed"));
    getMyTeam.mockResolvedValue(null);
    getWeeklyChallenges.mockRejectedValue(new Error("getWeeklyChallenges: request-failed"));
    renderCards();

    expect(await screen.findByText("Couldn't load this week's challenges.")).toBeInTheDocument();
    await waitFor(() => expect(getMyTeam).toHaveBeenCalled());
    expect(screen.queryByText(/team mission/)).toBeNull();
  });
});
