// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const navigateMock = vi.fn();
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
      <a href={to} {...rest}>
        {children}
      </a>
    ),
    useNavigate: () => navigateMock,
    useRouterState: ({ select }: { select: (s: { location: { pathname: string } }) => unknown }) =>
      select({ location: { pathname: "/teams/t1" } }),
  };
});

const getMyTeam = vi.fn();
const leaveTeam = vi.fn();
const getTeamMission = vi.fn().mockResolvedValue(null);
const getTeamMembers = vi.fn().mockResolvedValue([]);
const kickTeamMember = vi.fn();
const getTeamLeaderboard = vi.fn().mockResolvedValue([]);
vi.mock("../../lib/teams.functions", () => ({
  getMyTeam,
  leaveTeam,
  getTeamMission,
  getTeamMembers,
  kickTeamMember,
  getTeamLeaderboard,
}));

const { Route } = await import("./teams_.$teamId");

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Page = Route.options.component!;
  return render(
    <QueryClientProvider client={client}>
      <Page />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  navigateMock.mockReset();
  getMyTeam.mockReset();
  leaveTeam.mockReset();
  getTeamMission.mockReset();
  getTeamMission.mockResolvedValue(null);
  getTeamMembers.mockReset();
  getTeamMembers.mockResolvedValue([]);
  kickTeamMember.mockReset();
  getTeamLeaderboard.mockReset();
  getTeamLeaderboard.mockResolvedValue([]);
});

describe("Team detail page", () => {
  it("shows the team's weekly mission under the XP line", async () => {
    getMyTeam.mockResolvedValue({
      teamId: "t1",
      name: "Swift Falcons",
      joinCode: "ABC123",
      joinedAt: "2026-01-01T00:00:00Z",
      switchLockedUntil: "2020-01-01T00:00:00Z",
      thisWeekXp: 420,
    });
    getTeamMission.mockResolvedValue({
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
    });
    renderPage();
    expect(await screen.findByText("3 of 8 lessons done")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "37");
  });

  it("shows the team name, join code, and this week's XP", async () => {
    getMyTeam.mockResolvedValue({
      teamId: "t1",
      name: "Swift Falcons",
      joinCode: "ABC123",
      joinedAt: "2026-01-01T00:00:00Z",
      switchLockedUntil: "2020-01-01T00:00:00Z",
      thisWeekXp: 420,
    });
    renderPage();
    expect(await screen.findByText("Swift Falcons")).toBeInTheDocument();
    expect(screen.getByText("ABC123")).toBeInTheDocument();
    expect(screen.getByText("420 XP this week")).toBeInTheDocument();
  });

  it("disables leave while switch-locked, and shows the lock reason", async () => {
    getMyTeam.mockResolvedValue({
      teamId: "t1",
      name: "Swift Falcons",
      joinCode: "ABC123",
      joinedAt: "2026-01-01T00:00:00Z",
      switchLockedUntil: "2099-01-01T00:00:00Z",
      thisWeekXp: 0,
    });
    renderPage();
    expect(await screen.findByRole("button", { name: /7-day lock/ })).toBeDisabled();
  });

  it("leaves the team and navigates back to /teams when unlocked", async () => {
    getMyTeam.mockResolvedValue({
      teamId: "t1",
      name: "Swift Falcons",
      joinCode: "ABC123",
      joinedAt: "2020-01-01T00:00:00Z",
      switchLockedUntil: "2020-01-08T00:00:00Z",
      thisWeekXp: 0,
    });
    leaveTeam.mockResolvedValue({ ok: true, reason: null });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Leave team" }));
    await waitFor(() => expect(leaveTeam).toHaveBeenCalled());
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith({ to: "/teams" }));
  });

  it("says the team was handed on when the owner leaves, with a way back", async () => {
    getMyTeam.mockResolvedValue({
      teamId: "t1",
      name: "Swift Falcons",
      joinCode: "ABC123",
      joinedAt: "2020-01-01T00:00:00Z",
      switchLockedUntil: "2020-01-08T00:00:00Z",
      thisWeekXp: 0,
    });
    leaveTeam.mockResolvedValue({ ok: true, reason: "ownership-transferred" });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Leave team" }));
    expect(
      await screen.findByText("You left the team. The member who joined earliest now runs it."),
    ).toBeInTheDocument();
    expect(screen.getByText("Back to teams")).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("keeps the notice when the refetch after leaving finds no team", async () => {
    getMyTeam
      .mockResolvedValueOnce({
        teamId: "t1",
        name: "Swift Falcons",
        joinCode: "ABC123",
        joinedAt: "2020-01-01T00:00:00Z",
        switchLockedUntil: "2020-01-08T00:00:00Z",
        thisWeekXp: 0,
      })
      .mockResolvedValue(null);
    leaveTeam.mockResolvedValue({ ok: true, reason: "team-disbanded" });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Leave team" }));
    expect(
      await screen.findByText("You left the team. It was closed because no one else was in it."),
    ).toBeInTheDocument();
    expect(screen.queryByText("You're not on a team yet.")).not.toBeInTheDocument();
  });

  it("says why leaving was refused", async () => {
    getMyTeam.mockResolvedValue({
      teamId: "t1",
      name: "Swift Falcons",
      joinCode: "ABC123",
      joinedAt: "2020-01-01T00:00:00Z",
      switchLockedUntil: "2020-01-08T00:00:00Z",
      thisWeekXp: 0,
    });
    leaveTeam.mockResolvedValue({ ok: false, reason: "switch-locked" });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Leave team" }));
    expect(
      await screen.findByText("You can't join or leave a team for a few days. Try again later."),
    ).toBeInTheDocument();
    // Still a member: /teams would send them straight back here.
    expect(screen.queryByText("Back to teams")).toBeNull();
  });

  it("says it could not load the team, not 'not on a team', when the request fails", async () => {
    getMyTeam.mockRejectedValue(new Error("boom"));
    renderPage();
    expect(await screen.findByText("Couldn't load your team.")).toBeInTheDocument();
    expect(screen.queryByText("You're not on a team yet.")).not.toBeInTheDocument();
  });

  it("shows a fallback message when the user has no team", async () => {
    getMyTeam.mockResolvedValue(null);
    renderPage();
    expect(await screen.findByText("You're not on a team yet.")).toBeInTheDocument();
  });

  describe("members, owner removal and top teams", () => {
    const team = (isOwner: boolean) => ({
      teamId: "t1",
      name: "Night Owls",
      joinCode: "K7MQ2X",
      joinedAt: "2026-01-01T00:00:00Z",
      switchLockedUntil: "2020-01-01T00:00:00Z",
      thisWeekXp: 340,
      isOwner,
    });
    const members = [
      { userId: "me", displayName: "Sam", avatarSeed: "lion", isOwner: true, isBlocked: false },
      { userId: "u2", displayName: "Mina", avatarSeed: "owl", isOwner: false, isBlocked: false },
      { userId: "u3", displayName: "Priya", avatarSeed: "panda", isOwner: false, isBlocked: true },
    ];

    it("lists the members with Owner and Blocked tags", async () => {
      getMyTeam.mockResolvedValue(team(false));
      getTeamMembers.mockResolvedValue(members);
      renderPage();
      expect(await screen.findByText("Mina")).toBeInTheDocument();
      expect(screen.getByText("Owner")).toBeInTheDocument();
      expect(screen.getByText("Blocked")).toBeInTheDocument();
      // Not the owner: nobody can be removed.
      expect(screen.queryByRole("button", { name: /Remove .* from the team/ })).toBeNull();
    });

    it("lets only the owner remove a member, after a confirmation", async () => {
      getMyTeam.mockResolvedValue(team(true));
      getTeamMembers.mockResolvedValue(members);
      kickTeamMember.mockResolvedValue({ ok: true, reason: null });
      renderPage();
      fireEvent.click(await screen.findByRole("button", { name: "Remove Mina from the team" }));
      // The owner's own row has no remove control.
      expect(screen.queryByRole("button", { name: "Remove Sam from the team" })).toBeNull();
      expect(kickTeamMember).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "Remove" }));
      await waitFor(() => expect(kickTeamMember).toHaveBeenCalledWith({ data: { userId: "u2" } }));
    });

    it("says why a removal was refused", async () => {
      getMyTeam.mockResolvedValue(team(true));
      getTeamMembers.mockResolvedValue(members);
      kickTeamMember.mockResolvedValue({ ok: false, reason: "cannot-kick-yourself" });
      renderPage();
      fireEvent.click(await screen.findByRole("button", { name: "Remove Mina from the team" }));
      fireEvent.click(screen.getByRole("button", { name: "Remove" }));
      expect(await screen.findByText("To leave the team, use Leave team.")).toBeInTheDocument();
    });

    it("ranks the top teams and tints the learner's own", async () => {
      getMyTeam.mockResolvedValue(team(false));
      getTeamLeaderboard.mockResolvedValue([
        { teamId: "t1", name: "Night Owls", weeklyXp: 340 },
        { teamId: "t2", name: "Coffee Club", weeklyXp: 312 },
      ]);
      renderPage();
      expect(await screen.findByText("Coffee Club")).toBeInTheDocument();
      expect(screen.getByText("312 XP this week")).toBeInTheDocument();
      expect(screen.getByLabelText("Rank 1")).toBeInTheDocument();
      expect(screen.getByLabelText("Rank 2")).toBeInTheDocument();
    });
  });
});
