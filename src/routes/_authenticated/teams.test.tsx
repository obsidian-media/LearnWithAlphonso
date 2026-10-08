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
    // MobileFrame renders BottomTabs, which calls useRouterState -- the
    // real implementation needs a <RouterProvider>, so it's stubbed here
    // the same way profile_.friends.test.tsx does for its own BottomTabs.
    useRouterState: ({ select }: { select: (s: { location: { pathname: string } }) => unknown }) =>
      select({ location: { pathname: "/teams" } }),
  };
});

const getMyTeam = vi.fn();
const getTeamLeaderboard = vi.fn();
const joinTeamByCode = vi.fn();
const autoJoinTeam = vi.fn();
const createTeam = vi.fn();
vi.mock("../../lib/teams.functions", () => ({
  getMyTeam,
  getTeamLeaderboard,
  joinTeamByCode,
  autoJoinTeam,
  createTeam,
}));

const { Route } = await import("./teams");

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const TeamsPage = Route.options.component!;
  return render(
    <QueryClientProvider client={client}>
      <TeamsPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  navigateMock.mockReset();
  getMyTeam.mockReset();
  getTeamLeaderboard.mockReset();
  joinTeamByCode.mockReset();
  autoJoinTeam.mockReset();
  createTeam.mockReset();
});

describe("Teams page", () => {
  it("does not offer create/join while the team lookup is still pending", async () => {
    getMyTeam.mockReturnValue(new Promise(() => {}));
    getTeamLeaderboard.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText("Loading…")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Join code")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create team" })).not.toBeInTheDocument();
  });

  it("says it could not load the team, with a retry, instead of offering to create or join one", async () => {
    getMyTeam.mockRejectedValueOnce(new Error("boom"));
    getTeamLeaderboard.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText("Couldn't load your team.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create team" })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Join code")).not.toBeInTheDocument();

    getMyTeam.mockResolvedValue(null);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByPlaceholderText("Join code")).toBeInTheDocument();
  });

  it("shows the join form and leaderboard when the user has no team", async () => {
    getMyTeam.mockResolvedValue(null);
    getTeamLeaderboard.mockResolvedValue([{ teamId: "t1", name: "Swift Falcons", weeklyXp: 420 }]);
    renderPage();
    // "1. Swift Falcons" renders as sibling text nodes within one span
    // (the rank number and name are separate JSX expression children),
    // so an exact-text match wouldn't find "Swift Falcons" alone.
    expect(await screen.findByText(/Swift Falcons/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Join code")).toBeInTheDocument();
  });

  it("joins by code and navigates to the team detail route", async () => {
    getMyTeam.mockResolvedValue(null);
    getTeamLeaderboard.mockResolvedValue([]);
    joinTeamByCode.mockResolvedValue({ ok: true, reason: null, teamId: "t1" });
    renderPage();

    fireEvent.change(await screen.findByPlaceholderText("Join code"), {
      target: { value: "ABC123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Join by code" }));

    await waitFor(() => expect(joinTeamByCode).toHaveBeenCalledWith({ data: { code: "ABC123" } }));
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith({ to: "/teams/$teamId", params: { teamId: "t1" } }),
    );
  });

  it("shows the reason when joining by code fails", async () => {
    getMyTeam.mockResolvedValue(null);
    getTeamLeaderboard.mockResolvedValue([]);
    joinTeamByCode.mockResolvedValue({ ok: false, reason: "invalid-code", teamId: null });
    renderPage();

    fireEvent.change(await screen.findByPlaceholderText("Join code"), {
      target: { value: "BADCODE" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Join by code" }));

    expect(
      await screen.findByText("That code doesn't match a team. Check it and try again."),
    ).toBeInTheDocument();
  });

  it("says the connection failed when joining throws", async () => {
    getMyTeam.mockResolvedValue(null);
    getTeamLeaderboard.mockResolvedValue([]);
    joinTeamByCode.mockRejectedValue(new TypeError("fetch failed"));
    renderPage();

    fireEvent.change(await screen.findByPlaceholderText("Join code"), {
      target: { value: "BADCODE" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Join by code" }));

    expect(
      await screen.findByText("Couldn't reach the server. Check your connection and try again."),
    ).toBeInTheDocument();
  });

  it("asks to sign in again, not to check the connection, when the session was rejected", async () => {
    getMyTeam.mockResolvedValue(null);
    getTeamLeaderboard.mockResolvedValue([]);
    joinTeamByCode.mockRejectedValue(new Error("Unauthorized: Invalid token"));
    renderPage();

    fireEvent.change(await screen.findByPlaceholderText("Join code"), {
      target: { value: "BADCODE" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Join by code" }));

    expect(await screen.findByText("Sign in again to continue.")).toBeInTheDocument();
  });

  it("auto-joins a team and navigates to its detail route", async () => {
    getMyTeam.mockResolvedValue(null);
    getTeamLeaderboard.mockResolvedValue([]);
    autoJoinTeam.mockResolvedValue({ ok: true, reason: null, teamId: "t2" });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Put me on a team" }));

    await waitFor(() => expect(autoJoinTeam).toHaveBeenCalled());
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith({ to: "/teams/$teamId", params: { teamId: "t2" } }),
    );
  });

  it("creates a team and navigates to its detail route", async () => {
    getMyTeam.mockResolvedValue(null);
    getTeamLeaderboard.mockResolvedValue([]);
    createTeam.mockResolvedValue({ ok: true, reason: null, teamId: "t9", joinCode: "XYZ999" });
    renderPage();

    fireEvent.change(await screen.findByPlaceholderText("Team name"), {
      target: { value: "Night Owls" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create team" }));

    await waitFor(() =>
      expect(createTeam).toHaveBeenCalledWith({
        data: { name: "Night Owls", visibility: "public" },
      }),
    );
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith({ to: "/teams/$teamId", params: { teamId: "t9" } }),
    );
  });

  it("shows the reason when team creation fails", async () => {
    getMyTeam.mockResolvedValue(null);
    getTeamLeaderboard.mockResolvedValue([]);
    createTeam.mockResolvedValue({
      ok: false,
      reason: "invalid-name",
      teamId: null,
      joinCode: null,
    });
    renderPage();

    fireEvent.change(await screen.findByPlaceholderText("Team name"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Create team" }));

    expect(await screen.findByText("That name is too short or too long.")).toBeInTheDocument();
  });
});
