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
vi.mock("../../lib/friends.functions", () => ({
  getFriends,
  removeFriend,
  getMyFriendCode,
  sendNudge,
  getUnreadNudges,
  markNudgesRead,
  getFriendActivity,
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
});

describe("Nudge a friend", () => {
  it("sends the nudge to that friend, says so, and greys the button for 24 hours", async () => {
    renderPage();
    const nudgeMina = await screen.findByRole("button", { name: "Nudge Mina" });
    await waitFor(() => expect(nudgeMina).toBeEnabled());
    fireEvent.click(nudgeMina);
    await waitFor(() => expect(sendNudge).toHaveBeenCalledWith({ data: { recipientId: MINA } }));
    expect(await screen.findByText("Nudge sent to Mina.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Nudge Mina" })).toBeDisabled());
    // Only Mina's button: Jon can still be nudged.
    expect(screen.getByRole("button", { name: "Nudge Jon" })).toBeEnabled();
    const saved = JSON.parse(window.localStorage.getItem(`lwa.nudgeCooldowns.${ME}`) ?? "{}");
    expect(Object.keys(saved)).toEqual([MINA]);
  });

  it("a friend nudged an hour ago is greyed from the start, one nudged 25 hours ago is not", async () => {
    window.localStorage.setItem(
      `lwa.nudgeCooldowns.${ME}`,
      JSON.stringify({ [MINA]: Date.now() - HOUR, [JON]: Date.now() - 25 * HOUR }),
    );
    renderPage();
    await waitFor(() => expect(screen.getByRole("button", { name: "Nudge Mina" })).toBeDisabled());
    expect(screen.getByRole("button", { name: "Nudge Jon" })).toBeEnabled();
  });

  it("another account's cooldown on the same device does not grey this one", async () => {
    window.localStorage.setItem(
      "lwa.nudgeCooldowns.someone-else",
      JSON.stringify({ [MINA]: Date.now() }),
    );
    renderPage();
    const nudgeMina = await screen.findByRole("button", { name: "Nudge Mina" });
    await waitFor(() => expect(nudgeMina).toBeEnabled());
  });

  it("a refused nudge says so, leaves the button ready and starts no cooldown", async () => {
    sendNudge.mockResolvedValue({ ok: false });
    renderPage();
    const nudgeMina = await screen.findByRole("button", { name: "Nudge Mina" });
    await waitFor(() => expect(nudgeMina).toBeEnabled());
    fireEvent.click(nudgeMina);
    expect(await screen.findByText("Couldn't nudge Mina. Try again.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nudge Mina" })).toBeEnabled();
    expect(window.localStorage.getItem(`lwa.nudgeCooldowns.${ME}`)).toBeNull();
  });

  it("a network failure reads the same and starts no cooldown", async () => {
    sendNudge.mockRejectedValue(new TypeError("Failed to fetch"));
    renderPage();
    const nudgeJon = await screen.findByRole("button", { name: "Nudge Jon" });
    await waitFor(() => expect(nudgeJon).toBeEnabled());
    fireEvent.click(nudgeJon);
    expect(await screen.findByText("Couldn't nudge Jon. Try again.")).toBeInTheDocument();
    expect(window.localStorage.getItem(`lwa.nudgeCooldowns.${ME}`)).toBeNull();
  });
});

describe("Nudges you received", () => {
  it("names the friend who nudged you, then marks it read so it shows once", async () => {
    getUnreadNudges.mockResolvedValue([
      { id: "44444444-4444-4444-8444-444444444444", senderId: MINA, createdAt: "t" },
    ]);
    renderPage();
    expect(await screen.findByText("Mina nudged you!")).toBeInTheDocument();
    await waitFor(() =>
      expect(markNudgesRead).toHaveBeenCalledWith({
        data: { ids: ["44444444-4444-4444-8444-444444444444"] },
      }),
    );
    expect(markNudgesRead).toHaveBeenCalledTimes(1);
  });

  it("counts several, and calls a sender who is no longer a friend 'A friend'", async () => {
    getUnreadNudges.mockResolvedValue([
      { id: "44444444-4444-4444-8444-444444444444", senderId: MINA, createdAt: "t" },
      { id: "55555555-5555-4555-8555-555555555555", senderId: JON, createdAt: "t" },
    ]);
    const first = renderPage();
    expect(await screen.findByText("2 friends nudged you!")).toBeInTheDocument();
    first.unmount();

    getUnreadNudges.mockResolvedValue([
      {
        id: "66666666-6666-4666-8666-666666666666",
        senderId: "99999999-9999-4999-8999-999999999999",
        createdAt: "t",
      },
    ]);
    renderPage();
    expect(await screen.findByText("A friend nudged you!")).toBeInTheDocument();
  });

  it("shows no toast and marks nothing when there is nothing unread", async () => {
    renderPage();
    await screen.findByText("Mina");
    expect(screen.queryByText(/nudged you/)).toBeNull();
    expect(markNudgesRead).not.toHaveBeenCalled();
  });
});

describe("Activity feed", () => {
  const events = [
    {
      id: "e1",
      userId: MINA,
      eventType: "lesson_completed",
      createdAt: "t",
      xpGain: 20,
      streak: null,
      newTier: null,
    },
    {
      id: "e2",
      userId: JON,
      eventType: "streak_milestone",
      createdAt: "t",
      xpGain: null,
      streak: 7,
      newTier: null,
    },
    {
      id: "e3",
      userId: ME,
      eventType: "league_promotion",
      createdAt: "t",
      xpGain: null,
      streak: null,
      newTier: "sapphire",
    },
  ];

  it("lists the three kinds of event in the apps' words, and says You for your own", async () => {
    getFriendActivity.mockResolvedValue(events);
    renderPage();
    expect(await screen.findByText("Mina completed a lesson (+20 XP)")).toBeInTheDocument();
    expect(screen.getByText("Jon hit a 7-day streak")).toBeInTheDocument();
    expect(screen.getByText("You moved up to Grove")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Activity" })).toBeInTheDocument();
  });

  it("draws nothing at all when there is no activity (no empty card)", async () => {
    renderPage();
    await screen.findByText("Mina");
    expect(screen.queryByRole("heading", { name: "Activity" })).toBeNull();
  });

  it("draws nothing when the feed cannot load", async () => {
    getFriendActivity.mockRejectedValue(new Error("offline"));
    renderPage();
    await screen.findByText("Mina");
    expect(screen.queryByRole("heading", { name: "Activity" })).toBeNull();
  });

  it("removing a friend takes their events out of the feed at once", async () => {
    removeFriend.mockResolvedValue({ ok: true, message: "" });
    getFriendActivity.mockResolvedValue(events);
    renderPage();
    await screen.findByText("Mina completed a lesson (+20 XP)");
    fireEvent.click(screen.getByRole("button", { name: "More options for Mina" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove friend" }));
    const confirm = screen.getByRole("button", { name: "Confirm" });
    fireEvent.click(confirm);
    await waitFor(() => expect(screen.queryByText("Mina completed a lesson (+20 XP)")).toBeNull());
    // The event is gone, not merely renamed to "A friend": Jon's and your own are the only two left.
    await waitFor(() => expect(screen.queryByText(/^A friend completed a lesson/)).toBeNull());
    const feed = screen.getByRole("heading", { name: "Activity" })
      .nextElementSibling as HTMLElement;
    expect(within(feed).getAllByRole("listitem")).toHaveLength(2);
    expect(within(feed).getByText("Jon hit a 7-day streak")).toBeInTheDocument();
  });
});
