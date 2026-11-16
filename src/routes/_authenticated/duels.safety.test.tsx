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
      select({ location: { pathname: "/duels" } }),
  };
});

const getMyDuels = vi.fn();
vi.mock("../../lib/friends.functions", () => ({
  getMyDuels,
  createDuel: vi.fn(),
  respondToDuel: vi.fn(),
  getFriends: vi.fn().mockResolvedValue([]),
}));
vi.mock("../../lib/leaderboard.functions", () => ({
  getMyProfile: vi.fn().mockResolvedValue({ id: "me" }),
}));
vi.mock("../../lib/challenges.functions", () => ({
  joinOpenDuelQueue: vi.fn(),
  leaveOpenDuelQueue: vi.fn(),
}));
const blockUser = vi.fn();
const reportUser = vi.fn();
vi.mock("../../lib/social-safety.functions", () => ({ blockUser, reportUser }));

const { Route } = await import("./duels");

const OPPONENT = "11111111-1111-4111-8111-111111111111";
const CHALLENGER = "22222222-2222-4222-8222-222222222222";

const duel = (over: Record<string, unknown>) => ({
  duelId: "d1",
  challengerId: "me",
  opponentId: OPPONENT,
  course: "en",
  status: "active",
  challengerXpStart: 0,
  opponentXpStart: 0,
  challengerXpNow: 0,
  opponentXpNow: 0,
  winnerId: null,
  endsAt: null,
  ...over,
});

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
  blockUser.mockReset().mockResolvedValue({ ok: true, message: "blocked" });
  reportUser.mockReset().mockResolvedValue({ ok: true });
});

describe("Block and report on duels", () => {
  it("an active duel where you challenged: the menu acts on the opponent, not on you", async () => {
    getMyDuels.mockResolvedValue([duel({})]);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Block or report your opponent" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Block user" }));
    expect(screen.getByRole("heading", { name: "Block this opponent?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Block" }));
    await waitFor(() => expect(blockUser).toHaveBeenCalledWith({ data: { userId: OPPONENT } }));
  });

  it("an active duel where you were challenged: the menu acts on the challenger", async () => {
    getMyDuels.mockResolvedValue([duel({ challengerId: CHALLENGER, opponentId: "me" })]);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Block or report your opponent" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Report user" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));
    await waitFor(() =>
      expect(reportUser).toHaveBeenCalledWith({ data: { userId: CHALLENGER, reason: "spam" } }),
    );
    expect(await screen.findByText("Report submitted")).toBeInTheDocument();
  });

  it("a pending challenge sent to you has the menu too, on the challenger", async () => {
    getMyDuels.mockResolvedValue([
      duel({ challengerId: CHALLENGER, opponentId: "me", status: "pending" }),
    ]);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Block or report your opponent" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Block user" }));
    fireEvent.click(screen.getByRole("button", { name: "Block" }));
    await waitFor(() => expect(blockUser).toHaveBeenCalledWith({ data: { userId: CHALLENGER } }));
  });

  it("a block that goes through reloads the duels; one that is refused keeps the dialog and says so", async () => {
    getMyDuels.mockResolvedValue([duel({})]);
    renderPage();
    await screen.findByRole("button", { name: "Block or report your opponent" });
    const calls = getMyDuels.mock.calls.length;
    blockUser.mockResolvedValueOnce({ ok: false, message: "server-error" });
    fireEvent.click(screen.getByRole("button", { name: "Block or report your opponent" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Block user" }));
    fireEvent.click(screen.getByRole("button", { name: "Block" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't block this opponent. Try again.",
    );
    expect(getMyDuels.mock.calls.length).toBe(calls);
    fireEvent.click(screen.getByRole("button", { name: "Block" }));
    await waitFor(() => expect(getMyDuels.mock.calls.length).toBeGreaterThan(calls));
  });

  it("a finished duel has no menu (past results stay as they are)", async () => {
    getMyDuels.mockResolvedValue([duel({ status: "completed", winnerId: "me" })]);
    renderPage();
    await screen.findByText("Past duels");
    expect(screen.queryByRole("button", { name: "Block or report your opponent" })).toBeNull();
  });
});
