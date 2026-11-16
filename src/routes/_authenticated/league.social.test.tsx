// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
const getMyProfile = vi.fn();
const getWeeklyRecap = vi.fn();
vi.mock("../../lib/leaderboard.functions", () => ({
  getLeaderboard,
  getMyProfile,
  getWeeklyRecap,
}));
vi.mock("../../lib/profile.functions", () => ({
  getProfileOverview: vi.fn().mockRejectedValue(new Error("offline")),
}));

const { Route } = await import("./league");
const { useProgress } = await import("../../lib/progress");

const ME = "me";
const row = (id: string, xp: number) => ({
  user_id: id,
  display_name: id.toUpperCase(),
  country: null,
  avatar_seed: "0",
  xp,
  isYou: id === ME,
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const LeaguePage = Route.options.component!;
  return render(
    <QueryClientProvider client={client}>
      <LeaguePage />
    </QueryClientProvider>,
  );
}

function saveSnapshot(ids: string[]) {
  window.localStorage.setItem(
    `lwa.leaderboardSnapshot.${ME}`,
    JSON.stringify(ids.map((userId, i) => ({ userId, xp: 100 - i }))),
  );
}

beforeEach(() => {
  window.localStorage.clear();
  getLeaderboard.mockReset().mockResolvedValue([]);
  getMyProfile.mockReset().mockResolvedValue({ id: ME });
  getWeeklyRecap.mockReset();
  useProgress.getState().reset();
});

describe("Overtake notice", () => {
  it("tells you when someone who was below you on your last visit is now above you", async () => {
    saveSnapshot(["a", ME, "b"]);
    getLeaderboard.mockResolvedValue([row("a", 90), row("b", 80), row(ME, 70)]);
    renderPage();
    expect(await screen.findByText("Someone passed you on the leaderboard!")).toBeInTheDocument();
  });

  it("keeps the new board for next time, so the same pass is not announced twice", async () => {
    saveSnapshot(["a", ME, "b"]);
    getLeaderboard.mockResolvedValue([row("a", 90), row("b", 80), row(ME, 70)]);
    renderPage();
    await screen.findByText("Someone passed you on the leaderboard!");
    const saved = JSON.parse(window.localStorage.getItem(`lwa.leaderboardSnapshot.${ME}`) ?? "[]");
    expect(saved.map((e: { userId: string }) => e.userId)).toEqual(["a", "b", ME]);
  });

  it("says nothing on a first visit (no earlier board), but saves the board", async () => {
    getLeaderboard.mockResolvedValue([row("a", 90), row("b", 80), row(ME, 70)]);
    renderPage();
    await waitFor(() =>
      expect(window.localStorage.getItem(`lwa.leaderboardSnapshot.${ME}`)).not.toBeNull(),
    );
    expect(screen.queryByText("Someone passed you on the leaderboard!")).toBeNull();
  });

  it("says nothing when you moved up or nobody passed you", async () => {
    saveSnapshot(["a", "b", ME]);
    getLeaderboard.mockResolvedValue([row(ME, 90), row("a", 80), row("b", 70)]);
    renderPage();
    await waitFor(() => expect(getLeaderboard).toHaveBeenCalled());
    await waitFor(() =>
      expect(
        JSON.parse(window.localStorage.getItem(`lwa.leaderboardSnapshot.${ME}`) ?? "[]")[0].userId,
      ).toBe(ME),
    );
    expect(screen.queryByText("Someone passed you on the leaderboard!")).toBeNull();
  });

  it("checks the global weekly board whichever board is showing", async () => {
    renderPage();
    await waitFor(() =>
      expect(getLeaderboard).toHaveBeenCalledWith({ data: { scope: "global", period: "weekly" } }),
    );
    fireEvent.click(screen.getByRole("radio", { name: "Friends" }));
    await waitFor(() =>
      expect(getLeaderboard).toHaveBeenCalledWith({ data: { scope: "friends", period: "weekly" } }),
    );
  });
});

describe("Weekly recap", () => {
  it("shows last week's XP, today's rank with its honest note, and the cheering pose", async () => {
    getWeeklyRecap.mockResolvedValue({ lastWeekXp: 320, currentRank: 12 });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Recap" }));
    expect(await screen.findByText("320 XP")).toBeInTheDocument();
    expect(screen.getByText("Last week you earned")).toBeInTheDocument();
    expect(screen.getByText("#12")).toBeInTheDocument();
    expect(screen.getByText("Your rank today (global, weekly)")).toBeInTheDocument();
    expect(screen.getByText(/Approximate: this app doesn't keep a snapshot/)).toBeInTheDocument();
    expect(
      document.querySelector('img[src="/mascots/alphonso-levelup-cheer.webp"]'),
    ).not.toBeNull();
    expect(screen.queryByText(/You moved up to/)).toBeNull();
  });

  it("a quiet week shows only the first block and a sleeping Alphonso", async () => {
    getWeeklyRecap.mockResolvedValue({ lastWeekXp: 0, currentRank: null });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Recap" }));
    expect(await screen.findByText("0 XP")).toBeInTheDocument();
    expect(screen.queryByText("Your rank today (global, weekly)")).toBeNull();
    expect(document.querySelector('img[src="/mascots/alphonso-sleepy-night.webp"]')).not.toBeNull();
  });

  it("celebrates a promotion since the last recap, once", async () => {
    window.localStorage.setItem(`lwa.lastRecapTier.${ME}`, "bronze");
    useProgress.setState({ leagueTier: "silver" });
    getWeeklyRecap.mockResolvedValue({ lastWeekXp: 320, currentRank: 12 });
    renderPage();
    // Clicked at once, before the profile has arrived: the id is fetched on the spot, the promotion is not missed.
    fireEvent.click(screen.getByRole("button", { name: "Recap" }));
    expect(await screen.findByText("You moved up to Sapling!")).toBeInTheDocument();
    expect(window.localStorage.getItem(`lwa.lastRecapTier.${ME}`)).toBe("silver");

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    fireEvent.click(screen.getByRole("button", { name: "Recap" }));
    expect(await screen.findByText("320 XP")).toBeInTheDocument();
    expect(screen.queryByText("You moved up to Sapling!")).toBeNull();
  });

  it("no earlier recap means no promotion line (the first recap never celebrates)", async () => {
    useProgress.setState({ leagueTier: "silver" });
    getWeeklyRecap.mockResolvedValue({ lastWeekXp: 10, currentRank: null });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Recap" }));
    expect(await screen.findByText("10 XP")).toBeInTheDocument();
    expect(screen.queryByText(/You moved up to/)).toBeNull();
  });

  it("shows a loading state while it loads, then a calm error with Done when it fails", async () => {
    let reject: (e: Error) => void = () => {};
    getWeeklyRecap.mockReturnValue(new Promise((_, r) => (reject = r)));
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Recap" }));
    expect(await screen.findByText("Loading…", { selector: "p[role=status]" })).toBeInTheDocument();
    reject(new Error("offline"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load your recap.");
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
