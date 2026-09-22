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
vi.mock("../../lib/teams.functions", () => ({ getMyTeam, leaveTeam }));

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
});

describe("Team detail page", () => {
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

  it("shows a fallback message when the user has no team", async () => {
    getMyTeam.mockResolvedValue(null);
    renderPage();
    expect(await screen.findByText("You're not on a team yet.")).toBeInTheDocument();
  });
});
