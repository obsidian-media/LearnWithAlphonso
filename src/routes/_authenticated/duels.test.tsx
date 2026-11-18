// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { doubleClick } from "../../lib/double-click.testutil";

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
const getMyDuelQueue = vi.fn();
vi.mock("../../lib/challenges.functions", () => ({
  joinOpenDuelQueue,
  leaveOpenDuelQueue,
  getMyDuelQueue,
}));

const { Route } = await import("./duels");

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const DuelsPage = Route.options.component!;
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <DuelsPage />
      </QueryClientProvider>,
    ),
  };
}

function deferred<T>() {
  let resolve: (v: T) => void = () => {};
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const activeDuel = {
  duelId: "d2",
  challengerId: "me",
  opponentId: "them",
  course: "fr",
  status: "active",
  challengerXpStart: 0,
  opponentXpStart: 0,
  challengerXpNow: 40,
  opponentXpNow: 10,
  winnerId: null,
  endsAt: null,
};

beforeEach(() => {
  getMyDuels.mockReset();
  createDuel.mockReset();
  respondToDuel.mockReset();
  getFriends.mockReset();
  getMyProfile.mockReset();
  joinOpenDuelQueue.mockReset();
  leaveOpenDuelQueue.mockReset();
  getMyDuelQueue.mockReset().mockResolvedValue({ queued: false });
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
    expect(screen.getByRole("button", { name: /^Accept the/ })).toBeInTheDocument();
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

    fireEvent.click(await screen.findByRole("button", { name: /^Accept the/ }));
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

    fireEvent.click(await screen.findByRole("radio", { name: "Ada" }));
    fireEvent.click(screen.getByRole("button", { name: "Send challenge" }));

    await waitFor(() =>
      expect(createDuel).toHaveBeenCalledWith({ data: { opponentId: "f1", course: "en" } }),
    );
  });

  it("says why a challenge was refused, in words", async () => {
    getMyDuels.mockResolvedValue([]);
    getFriends.mockResolvedValue([
      { userId: "f1", displayName: "Ada", avatarSeed: "a", streak: 1, weekXp: 10 },
    ]);
    createDuel.mockResolvedValue({ ok: false, reason: "duel-already-open", duelId: null });
    renderPage();

    fireEvent.click(await screen.findByRole("radio", { name: "Ada" }));
    fireEvent.click(screen.getByRole("button", { name: "Send challenge" }));

    expect(
      await screen.findByText("You already have a duel open with this friend."),
    ).toBeInTheDocument();
  });

  it("a server failure on a challenge is generic, not a connection problem", async () => {
    getMyDuels.mockResolvedValue([]);
    getFriends.mockResolvedValue([
      { userId: "f1", displayName: "Ada", avatarSeed: "a", streak: 1, weekXp: 10 },
    ]);
    createDuel.mockRejectedValue(new Error("Internal Server Error"));
    renderPage();

    fireEvent.click(await screen.findByRole("radio", { name: "Ada" }));
    fireEvent.click(screen.getByRole("button", { name: "Send challenge" }));

    expect(await screen.findByText("Something went wrong. Try again.")).toBeInTheDocument();
  });

  it("shows a waiting state when the open queue doesn't find an immediate match", async () => {
    getMyDuels.mockResolvedValue([]);
    joinOpenDuelQueue.mockResolvedValue({ matched: false, duelId: null, queued: true });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Find an open duel" }));
    expect(await screen.findByText("Waiting for an opponent…")).toBeInTheDocument();
  });

  it("leaves the queue on Leave queue", async () => {
    getMyDuels.mockResolvedValue([]);
    joinOpenDuelQueue.mockResolvedValue({ matched: false, duelId: null, queued: true });
    leaveOpenDuelQueue.mockResolvedValue({ ok: true });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Find an open duel" }));
    fireEvent.click(await screen.findByRole("button", { name: "Leave queue" }));

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
    joinOpenDuelQueue.mockResolvedValue({ matched: false, duelId: null, queued: true });
    renderPage();

    const openGroup = await screen.findByRole("radiogroup", { name: "Course for the open duel" });
    fireEvent.click(within(openGroup).getByRole("radio", { name: "Spanish" }));
    fireEvent.click(screen.getByRole("switch", { name: "Match me with someone at my level" }));
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

  // --- failure states (launch fix: errors must not read as empty, nor leave the page stuck) ---

  it("shows an error with Try again, not 'No active duels', when the duels cannot load", async () => {
    getMyDuels.mockRejectedValueOnce(new Error("getMyDuels: request-failed")).mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText("Couldn't load your duels.")).toBeInTheDocument();
    expect(screen.queryByText("No active duels right now.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No active duels right now.")).toBeInTheDocument();
  });

  it("shows an error, not 'No friends yet', when the friends list cannot load", async () => {
    getMyDuels.mockResolvedValue([]);
    getFriends.mockRejectedValue(new Error("getFriends: request-failed"));
    renderPage();

    expect(await screen.findByText("Couldn't load your friends.")).toBeInTheDocument();
    expect(screen.queryByText(/No friends yet/)).not.toBeInTheDocument();
  });

  it("does not stay on 'Finding a match…' when joining the queue fails", async () => {
    getMyDuels.mockResolvedValue([]);
    joinOpenDuelQueue.mockRejectedValue(new Error("joinOpenDuelQueue: request-failed"));
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Find an open duel" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Try again.");
    expect(await screen.findByRole("button", { name: "Find an open duel" })).toBeEnabled();
    expect(screen.queryByText("Finding a match…")).not.toBeInTheDocument();
    expect(screen.queryByText("Waiting for an opponent…")).not.toBeInTheDocument();
  });

  it("shows the server's queue on load, so a learner who left the page can still leave the queue", async () => {
    getMyDuels.mockResolvedValue([]);
    getMyDuelQueue.mockResolvedValue({
      queued: true,
      course: "fr",
      queuedAt: new Date().toISOString(),
    });
    leaveOpenDuelQueue.mockResolvedValue({ ok: true });
    renderPage();

    expect(await screen.findByText("Waiting for an opponent…")).toBeInTheDocument();
    const openGroup = screen.getByRole("radiogroup", { name: "Course for the open duel" });
    expect(within(openGroup).getByRole("radio", { name: "French" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "Leave queue" }));
    await waitFor(() => expect(leaveOpenDuelQueue).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("button", { name: "Find an open duel" })).toBeInTheDocument();
  });

  it("holds Find an open duel back until the queue read settles", async () => {
    getMyDuels.mockResolvedValue([]);
    const read = deferred<{ queued: boolean }>();
    getMyDuelQueue.mockReturnValue(read.promise);
    renderPage();

    // Joining before the read answers would race it: the late answer could flip the card back.
    expect(await screen.findByRole("button", { name: "Checking the queue…" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Find an open duel" })).not.toBeInTheDocument();
    read.resolve({ queued: false });
    expect(await screen.findByRole("button", { name: "Find an open duel" })).toBeEnabled();
  });

  it("a queue read that answers after the learner left does not put them back in the queue", async () => {
    getMyDuels.mockResolvedValue([]);
    getMyDuelQueue.mockResolvedValueOnce({
      queued: true,
      course: "en",
      queuedAt: new Date().toISOString(),
    });
    const leave = deferred<{ ok: boolean }>();
    leaveOpenDuelQueue.mockReturnValue(leave.promise);
    const { client } = renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Leave queue" }));
    // A refetch (the tab regaining focus, say) starts before the leave lands, and answers with the old state.
    const stale = deferred<{ queued: boolean; course: string; queuedAt: string }>();
    getMyDuelQueue.mockReturnValueOnce(stale.promise);
    void client.refetchQueries({ queryKey: ["myDuelQueue"] });
    leave.resolve({ ok: true });
    expect(await screen.findByRole("button", { name: "Find an open duel" })).toBeInTheDocument();
    stale.resolve({ queued: true, course: "en", queuedAt: new Date().toISOString() });

    // And a refetch after the leave that still sees the old row must not flip the card back either.
    getMyDuelQueue.mockResolvedValue({
      queued: true,
      course: "en",
      queuedAt: new Date().toISOString(),
    });
    await client.refetchQueries({ queryKey: ["myDuelQueue"] });
    await waitFor(() => expect(getMyDuelQueue).toHaveBeenCalledTimes(3));
    expect(screen.queryByText("Waiting for an opponent…")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Find an open duel" })).toBeInTheDocument();
  });

  it("says open duels are not available, not 'Waiting for an opponent…', when the server lets nobody in", async () => {
    getMyDuels.mockResolvedValue([]);
    // join_open_duel_queue answers (false, null) and writes no queue row: duels are off, or the account is restricted.
    joinOpenDuelQueue.mockResolvedValue({ matched: false, duelId: null, queued: false });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Find an open duel" }));

    expect(await screen.findByText(/Open duels aren't available right now/)).toBeInTheDocument();
    expect(screen.queryByText("Waiting for an opponent…")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Leave queue" })).not.toBeInTheDocument();
  });

  it("keeps the duels on screen when a background refresh fails, with a small Try again", async () => {
    getMyDuels.mockResolvedValueOnce([activeDuel]);
    const { client } = renderPage();
    expect(await screen.findByText("+40")).toBeInTheDocument();

    getMyDuels.mockRejectedValueOnce(new Error("getMyDuels: request-failed"));
    await client.refetchQueries({ queryKey: ["myDuels"] });

    expect(await screen.findByText("Couldn't refresh your duels.")).toBeInTheDocument();
    expect(screen.getByText("+40")).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load your duels.")).not.toBeInTheDocument();
    getMyDuels.mockResolvedValue([activeDuel]);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() =>
      expect(screen.queryByText("Couldn't refresh your duels.")).not.toBeInTheDocument(),
    );
  });

  it("keeps the friends to challenge when a background refresh of them fails", async () => {
    getMyDuels.mockResolvedValue([]);
    getFriends.mockResolvedValueOnce([{ userId: "f1", displayName: "Ada", avatarSeed: "a" }]);
    const { client } = renderPage();
    expect(await screen.findByRole("radio", { name: "Ada" })).toBeInTheDocument();

    getFriends.mockRejectedValueOnce(new Error("getFriends: request-failed"));
    await client.refetchQueries({ queryKey: ["friends"] });

    expect(await screen.findByText("Couldn't refresh your friends.")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Ada" })).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load your friends.")).not.toBeInTheDocument();
  });

  it("keeps waiting (and says so) when leaving the queue fails", async () => {
    getMyDuels.mockResolvedValue([]);
    getMyDuelQueue.mockResolvedValue({
      queued: true,
      course: "en",
      queuedAt: new Date().toISOString(),
    });
    leaveOpenDuelQueue.mockRejectedValue(new Error("leaveOpenDuelQueue: request-failed"));
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Leave queue" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Try again.");
    expect(screen.getByText("Waiting for an opponent…")).toBeInTheDocument();
  });

  it("answers a pending challenge once, even when Accept is double-clicked", async () => {
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
    let resolve: (v: { ok: boolean; reason: string | null }) => void = () => {};
    respondToDuel.mockReturnValue(new Promise((r) => (resolve = r)));
    renderPage();

    const accept = await screen.findByRole("button", { name: "Accept the en challenge" });
    doubleClick(accept);
    fireEvent.click(screen.getByRole("button", { name: "Decline the en challenge" }));
    resolve({ ok: true, reason: null });

    await waitFor(() => expect(getMyDuels).toHaveBeenCalledTimes(2));
    expect(respondToDuel).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
