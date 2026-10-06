// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const getTeamMission = vi.fn();
vi.mock("../lib/teams.functions", () => ({ getTeamMission }));

// Dynamic import, after the mock is registered (same reason as WeeklyChallengesCard.test).
const { TeamMissionCard } = await import("./TeamMissionCard");

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <TeamMissionCard />
      </QueryClientProvider>,
    ),
  };
}

const base = {
  teamId: "t1",
  weekStart: "2026-10-05",
  weekEnd: "2026-10-12",
  target: 8,
  total: 3,
  myCount: 2,
  memberCount: 2,
  status: "in_progress",
  rewardXp: 50,
  rewarded: false,
  daysLeft: 5,
  percent: 37,
  headline: "3 of 8 lessons done",
  footer: "You added 2 · 5 days left",
};

// Braces matter: vitest runs a function RETURNED from beforeEach as a teardown hook, and mockReset() returns the mock.
beforeEach(() => {
  getTeamMission.mockReset();
});

describe("TeamMissionCard", () => {
  it("shows the headline, footer and a progress bar at the right width", async () => {
    getTeamMission.mockResolvedValue(base);
    renderCard();
    expect(await screen.findByText("3 of 8 lessons done")).toBeInTheDocument();
    expect(screen.getByText("You added 2 · 5 days left")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "37");
    expect((screen.getByTestId("team-mission-fill") as HTMLElement).style.width).toBe("37%");
  });

  it("celebrates a completed mission", async () => {
    getTeamMission.mockResolvedValue({
      ...base,
      status: "complete",
      percent: 100,
      headline: "Mission complete!",
      footer: "+50 XP for everyone who joined in",
    });
    renderCard();
    expect(await screen.findByText("Mission complete!")).toBeInTheDocument();
    expect(screen.getByText("+50 XP for everyone who joined in")).toBeInTheDocument();
  });

  it("invites a second member and shows no bar when the team is too small", async () => {
    getTeamMission.mockResolvedValue({
      ...base,
      status: "needs_members",
      percent: 0,
      headline: "Invite a friend to start your team's weekly mission",
      footer: "",
    });
    renderCard();
    expect(
      await screen.findByText("Invite a friend to start your team's weekly mission"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("renders nothing without a team", async () => {
    getTeamMission.mockResolvedValue(null);
    const { container } = renderCard();
    await vi.waitFor(() => expect(getTeamMission).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the call fails (never a fabricated empty mission)", async () => {
    getTeamMission.mockImplementation(async () => {
      throw new Error("down");
    });
    const { client, container } = renderCard();
    await vi.waitFor(() => expect(client.getQueryState(["teamMission"])?.status).toBe("error"));
    expect(container).toBeEmptyDOMElement();
  });
});
