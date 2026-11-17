// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
      select({ location: { pathname: "/profile/friends" } }),
  };
});

const getFriends = vi.fn();
const removeFriend = vi.fn();
const getMyFriendCode = vi.fn();
const sendNudge = vi.fn();
const getUnreadNudges = vi.fn();
const markNudgesRead = vi.fn();
const getFriendActivity = vi.fn();
const giftStreakFreeze = vi.fn();
const getFreezeGiftState = vi.fn();
const getUnreadFreezeGifts = vi.fn();
const markFreezeGiftsRead = vi.fn();
vi.mock("../../lib/friends.functions", () => ({
  getFriends,
  removeFriend,
  getMyFriendCode,
  sendNudge,
  getUnreadNudges,
  markNudgesRead,
  getFriendActivity,
  giftStreakFreeze,
  getFreezeGiftState,
  getUnreadFreezeGifts,
  markFreezeGiftsRead,
}));
const getMyProfile = vi.fn();
vi.mock("../../lib/leaderboard.functions", () => ({ getMyProfile }));
vi.mock("../../lib/buddy.functions", () => ({
  getMyBuddy: vi.fn().mockResolvedValue(null),
  getBuddyRequests: vi.fn().mockResolvedValue([]),
  requestBuddy: vi.fn(),
  respondBuddyRequest: vi.fn(),
  cancelBuddyRequest: vi.fn(),
  endBuddy: vi.fn(),
  sendBuddyMessage: vi.fn(),
  getBuddyMessages: vi.fn().mockResolvedValue([]),
  joinBuddyPool: vi.fn(),
  leaveBuddyPool: vi.fn(),
  getBuddyPool: vi
    .fn()
    .mockResolvedValue({ matchingEnabled: false, waiting: false, course: null, courses: [] }),
}));

const { Route } = await import("./profile_.friends");

const ME = "11111111-1111-4111-8111-111111111111";
const MINA = "22222222-2222-4222-8222-222222222222";
const JON = "33333333-3333-4333-8333-333333333333";
const HOUR = 60 * 60 * 1000;

const friends = [
  { userId: MINA, displayName: "Mina", avatarSeed: "0", streak: 12, weekXp: 520 },
  { userId: JON, displayName: "Jon", avatarSeed: "1", streak: 3, weekXp: 210 },
];

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const FriendsPage = Route.options.component!;
  return render(
    <QueryClientProvider client={client}>
      <FriendsPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  getFriends.mockReset().mockResolvedValue(friends);
  removeFriend.mockReset();
  getMyFriendCode.mockReset().mockResolvedValue("code123");
  sendNudge.mockReset().mockResolvedValue({ ok: true });
  getUnreadNudges.mockReset().mockResolvedValue([]);
  markNudgesRead.mockReset().mockResolvedValue({ ok: true });
  getFriendActivity.mockReset().mockResolvedValue([]);
  getMyProfile.mockReset().mockResolvedValue({ id: ME });
  giftStreakFreeze.mockReset().mockResolvedValue({ ok: true, freezes: 1 });
  getFreezeGiftState.mockReset().mockResolvedValue({ freezes: 2, giftedTodayTo: [] });
  getUnreadFreezeGifts.mockReset().mockResolvedValue([]);
  markFreezeGiftsRead.mockReset().mockResolvedValue({ ok: true });
});

describe("Gift a streak freeze", () => {
  it("sends the gift to that friend and says so", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Gift a streak freeze to Mina" }));
    await waitFor(() =>
      expect(giftStreakFreeze).toHaveBeenCalledWith({ data: { recipientId: MINA } }),
    );
    expect(await screen.findByText("Freeze sent to Mina.")).toBeTruthy();
    expect(getFreezeGiftState.mock.calls.length).toBeGreaterThan(1);
  });

  it("says why when the friend is at the cap, with the database's reason", async () => {
    giftStreakFreeze.mockResolvedValue({ ok: false, reason: "recipient-full", freezes: 2 });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Gift a streak freeze to Jon" }));
    expect(await screen.findByText(/Jon already has all the freezes they can hold/)).toBeTruthy();
  });

  it("disables the button for a friend already gifted today", async () => {
    getFreezeGiftState.mockResolvedValue({ freezes: 2, giftedTodayTo: [MINA] });
    renderPage();
    const done = await screen.findByRole("button", {
      name: "Streak freeze already sent to Mina today",
    });
    expect((done as HTMLButtonElement).disabled).toBe(true);
    const other = await screen.findByRole("button", { name: "Gift a streak freeze to Jon" });
    expect((other as HTMLButtonElement).disabled).toBe(false);
  });

  it("disables every gift button when the learner has no freeze to give", async () => {
    getFreezeGiftState.mockResolvedValue({ freezes: 0, giftedTodayTo: [] });
    renderPage();
    const b = await screen.findByRole("button", {
      name: /Gift a streak freeze to Mina \(you have none/,
    });
    expect((b as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(b);
    expect(giftStreakFreeze).not.toHaveBeenCalled();
  });

  it("shows who gifted a freeze, once, then marks it read", async () => {
    getUnreadFreezeGifts.mockResolvedValue([
      { id: "g1", senderId: MINA, createdAt: "2026-11-17T00:00:00Z" },
    ]);
    renderPage();
    expect(await screen.findByText("Mina gifted you a streak freeze!")).toBeTruthy();
    await waitFor(() =>
      expect(markFreezeGiftsRead).toHaveBeenCalledWith({ data: { ids: ["g1"] } }),
    );
    expect(markFreezeGiftsRead).toHaveBeenCalledTimes(1);
  });
});
