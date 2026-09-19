// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
      <a href={to} {...rest}>
        {children}
      </a>
    ),
    useRouterState: ({ select }: { select: (s: { location: { pathname: string } }) => unknown }) =>
      select({ location: { pathname: "/league" } }),
  };
});

const getLeaderboard = vi.fn();
vi.mock("../../lib/leaderboard.functions", () => ({ getLeaderboard }));

const { Route } = await import("./league");
const { useProgress } = await import("../../lib/progress");

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const LeaguePage = Route.options.component!;
  return render(
    <QueryClientProvider client={client}>
      <LeaguePage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  getLeaderboard.mockReset();
  getLeaderboard.mockResolvedValue([]);
  useProgress.getState().reset();
});

describe("League page", () => {
  it("shows the current tier and the next tier to reach", async () => {
    useProgress.setState({ leagueTier: "silver" });
    renderPage();
    expect(await screen.findByText("Silver")).toBeInTheDocument();
    expect(screen.getByText("Next")).toBeInTheDocument();
    expect(screen.getByText("Sapphire")).toBeInTheDocument();
  });

  it("hides the 'next tier' callout at the top tier", async () => {
    useProgress.setState({ leagueTier: "diamond" });
    renderPage();
    expect(await screen.findByText("Diamond")).toBeInTheDocument();
    expect(screen.queryByText("Next")).not.toBeInTheDocument();
  });

  it("queries the global weekly leaderboard by default", async () => {
    renderPage();
    await waitFor(() =>
      expect(getLeaderboard).toHaveBeenCalledWith({
        data: { scope: "global", period: "weekly" },
      }),
    );
  });

  it("shows a scope-specific empty state for the friends tab", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("tab", { name: "Friends" }));
    expect(await screen.findByText("Add friends to compete side by side.")).toBeInTheDocument();
    await waitFor(() =>
      expect(getLeaderboard).toHaveBeenCalledWith({
        data: { scope: "friends", period: "weekly" },
      }),
    );
  });

  it("shows a scope-specific empty state for the country tab", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("tab", { name: "Country" }));
    expect(
      await screen.findByText("Set your country on your profile to see this board."),
    ).toBeInTheDocument();
  });

  it("re-queries with the all-time period when that tab is selected", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("tab", { name: "All-time" }));
    await waitFor(() =>
      expect(getLeaderboard).toHaveBeenCalledWith({
        data: { scope: "global", period: "all-time" },
      }),
    );
  });

  it("renders ranked rows, highlighting the caller's own entry", async () => {
    getLeaderboard.mockResolvedValue([
      {
        user_id: "u1",
        display_name: "Ada",
        country: "US",
        avatar_seed: "A",
        xp: 500,
        isYou: false,
      },
      { user_id: "me", display_name: "Me", country: null, avatar_seed: "M", xp: 300, isYou: true },
    ]);
    renderPage();

    expect(await screen.findByText("Ada")).toBeInTheDocument();
    expect(screen.getByText("500 XP")).toBeInTheDocument();
    expect(screen.getByText("US")).toBeInTheDocument();
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.getByText("300 XP")).toBeInTheDocument();
  });
});
