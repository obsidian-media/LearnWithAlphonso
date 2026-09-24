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
    // MobileFrame renders BottomTabs, which calls useRouterState -- the
    // real implementation needs a <RouterProvider>, so it's stubbed here
    // the same way profile_.friends.test.tsx does for its own BottomTabs.
    useRouterState: ({ select }: { select: (s: { location: { pathname: string } }) => unknown }) =>
      select({ location: { pathname: "/duels" } }),
  };
});

const getMyDuels = vi.fn();
const createDuel = vi.fn();
const respondToDuel = vi.fn();
const getFriends = vi.fn();
vi.mock("../../lib/friends.functions", () => ({
  getMyDuels,
  createDuel,
  respondToDuel,
  getFriends,
}));

const getMyProfile = vi.fn();
vi.mock("../../lib/leaderboard.functions", () => ({ getMyProfile }));

const joinOpenDuelQueue = vi.fn();
const leaveOpenDuelQueue = vi.fn();
vi.mock("../../lib/challenges.functions", () => ({ joinOpenDuelQueue, leaveOpenDuelQueue }));

const { Route } = await import("./duels");

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const DuelsPage = Route.options.component!;
  return render(
    <QueryClientProvider client={client}>
      <DuelsPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  getMyDuels.mockReset();
  createDuel.mockReset();
  respondToDuel.mockReset();
  getFriends.mockReset();
  getMyProfile.mockReset();
  joinOpenDuelQueue.mockReset();
  leaveOpenDuelQueue.mockReset();
  getMyProfile.mockResolvedValue({ id: "me" });
  getFriends.mockResolvedValue([]);
});

describe("Duels page", () => {
  it("shows a pending challenge with accept/decline for the caller as opponent", async () => {
    getMyDuels.mockResolvedValue([
      {
        duelId: "d1",
        challengerId: "friend1",
        opponentId: "me",
        course: "en",
        status: "pending",
        challengerXpStart: 0,
        opponentXpStart: 0,
        challengerXpNow: 0,
        opponentXpNow: 0,
        winnerId: null,
        endsAt: null,
      },
    ]);
    renderPage();
    expect(await screen.findByText("Pending challenges")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument();
  });

  it("accepts a pending duel and refetches", async () => {
    getMyDuels.mockResolvedValue([
      {
        duelId: "d1",
        challengerId: "friend1",
        opponentId: "me",
        course: "en",
        status: "pending",
        challengerXpStart: 0,
        opponentXpStart: 0,
        challengerXpNow: 0,
        opponentXpNow: 0,
        winnerId: null,
        endsAt: null,
      },
    ]);
    respondToDuel.mockResolvedValue({ ok: true, reason: null });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Accept" }));
    await waitFor(() =>
      expect(respondToDuel).toHaveBeenCalledWith({ data: { duelId: "d1", accept: true } }),
    );
  });

  it("shows the XP delta for an active duel", async () => {
    getMyDuels.mockResolvedValue([
      {
        duelId: "d1",
        challengerId: "me",
        opponentId: "friend1",
        course: "en",
        status: "active",
        challengerXpStart: 100,
        opponentXpStart: 50,
        challengerXpNow: 170,
        opponentXpNow: 80,
        winnerId: null,
        endsAt: "2026-09-30T00:00:00Z",
      },
    ]);
    renderPage();
    expect(await screen.findByText("You: +70")).toBeInTheDocument();
    expect(screen.getByText("Them: +30")).toBeInTheDocument();
  });

  it("sends a friend challenge", async () => {
    getMyDuels.mockResolvedValue([]);
    getFriends.mockResolvedValue([
      { userId: "f1", displayName: "Ada", avatarSeed: "a", streak: 1, weekXp: 10 },
    ]);
    createDuel.mockResolvedValue({ ok: true, reason: null, duelId: "d2" });
    renderPage();

    const select = await screen.findByDisplayValue("Choose a friend…");
    await screen.findByRole("option", { name: "Ada" }); // wait for friends to load before changing
    fireEvent.change(select, { target: { value: "f1" } });
    fireEvent.click(screen.getByRole("button", { name: "Send challenge" }));

    await waitFor(() =>
      expect(createDuel).toHaveBeenCalledWith({ data: { opponentId: "f1", course: "en" } }),
    );
  });

  it("shows a waiting state when the open queue doesn't find an immediate match", async () => {
    getMyDuels.mockResolvedValue([]);
    joinOpenDuelQueue.mockResolvedValue({ matched: false, duelId: null });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Find an open duel" }));
    expect(await screen.findByText("Waiting for an opponent…")).toBeInTheDocument();
  });

  it("leaves the queue on cancel", async () => {
    getMyDuels.mockResolvedValue([]);
    joinOpenDuelQueue.mockResolvedValue({ matched: false, duelId: null });
    leaveOpenDuelQueue.mockResolvedValue({ ok: true });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Find an open duel" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(leaveOpenDuelQueue).toHaveBeenCalled());
    expect(screen.queryByText("Waiting for an opponent…")).not.toBeInTheDocument();
  });

  // --- open-queue match path + past duels (coverage gap, 2026-09-24) ---

  it("refetches instead of waiting when the queue matches immediately", async () => {
    getMyDuels.mockResolvedValue([]);
    joinOpenDuelQueue.mockResolvedValue({ matched: true, duelId: "d9" });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Find an open duel" }));

    await waitFor(() => expect(getMyDuels).toHaveBeenCalledTimes(2));
    // An immediate match must NOT leave the user staring at a waiting
    // state for an opponent they already have.
    expect(screen.queryByText("Waiting for an opponent…")).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Find an open duel" })).toBeInTheDocument();
  });

  it("passes the chosen course and level preference to the queue", async () => {
    getMyDuels.mockResolvedValue([]);
    joinOpenDuelQueue.mockResolvedValue({ matched: false, duelId: null });
    renderPage();

    // Three comboboxes on this page, in DOM order: friend picker,
    // challenge course, then the OPEN-duel course. The last is the one
    // the open queue reads.
    const selects = await screen.findAllByRole("combobox");
    const openCourseSelect = selects[selects.length - 1]!;
    fireEvent.change(openCourseSelect, { target: { value: "es" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Find an open duel" }));

    await waitFor(() =>
      expect(joinOpenDuelQueue).toHaveBeenCalledWith({
        data: { course: "es", matchByLevel: false },
      }),
    );
  });

  it("lists finished duels under Past duels", async () => {
    getMyDuels.mockResolvedValue([
      {
        duelId: "d1",
        status: "completed",
        course: "en",
        challengerId: "me",
        opponentId: "them",
        challengerName: "Me",
        opponentName: "Them",
        challengerXp: 120,
        opponentXp: 90,
        winnerId: "me",
        endsAt: "2026-09-20T00:00:00Z",
      },
    ]);
    renderPage();

    expect(await screen.findByText("Past duels")).toBeInTheDocument();
  });

  it("hides the Past duels section entirely when there are none", async () => {
    getMyDuels.mockResolvedValue([]);
    renderPage();

    await screen.findByRole("button", { name: "Find an open duel" });
    expect(screen.queryByText("Past duels")).not.toBeInTheDocument();
  });
});
