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
    // the same way AppShell.test.tsx does for its own BottomTabs tests.
    useRouterState: ({ select }: { select: (s: { location: { pathname: string } }) => unknown }) =>
      select({ location: { pathname: "/profile/friends" } }),
  };
});

const getFriends = vi.fn();
const removeFriend = vi.fn();
const getMyFriendCode = vi.fn();
vi.mock("../../lib/friends.functions", () => ({ getFriends, removeFriend, getMyFriendCode }));
const getMyProfile = vi.fn();
vi.mock("../../lib/leaderboard.functions", () => ({ getMyProfile }));
const getMyBuddy = vi.fn();
const getBuddyRequests = vi.fn();
const requestBuddy = vi.fn();
vi.mock("../../lib/buddy.functions", () => ({
  getMyBuddy,
  getBuddyRequests,
  requestBuddy,
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

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const FriendsPage = Route.options.component!;
  return render(
    <QueryClientProvider client={client}>
      <FriendsPage />
    </QueryClientProvider>,
  );
}

/** Remove lives in the row's menu (so the row stays one line on a phone): open it, then pick Remove friend. */
async function clickRemoveFriend(name: string) {
  fireEvent.click(await screen.findByRole("button", { name: `More options for ${name}` }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Remove friend" }));
}

beforeEach(() => {
  getFriends.mockReset();
  removeFriend.mockReset();
  getMyFriendCode.mockReset();
  getMyProfile.mockReset().mockResolvedValue({ id: "me" });
  getMyBuddy.mockReset().mockResolvedValue(null);
  getBuddyRequests.mockReset().mockResolvedValue([]);
  requestBuddy.mockReset();
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  });
});

describe("Friends page", () => {
  it("shows the study buddy card and lets you ask a friend from their row", async () => {
    getFriends.mockResolvedValue([
      {
        userId: "3f2b6c1e-8a4d-4c7e-9b1a-2d5e6f708192",
        displayName: "Ada",
        avatarSeed: "A",
        streak: 5,
        weekXp: 120,
      },
    ]);
    getMyFriendCode.mockResolvedValue("me-code");
    requestBuddy.mockResolvedValue({ status: "requested" });
    renderPage();
    expect(await screen.findByText(/Pick a friend to study with/)).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Ask to be study buddy" }));
    await waitFor(() =>
      expect(requestBuddy).toHaveBeenCalledWith({
        data: { friendId: "3f2b6c1e-8a4d-4c7e-9b1a-2d5e6f708192" },
      }),
    );
  });

  it("shows a loading state before the friends list resolves", () => {
    getFriends.mockReturnValue(new Promise(() => {}));
    getMyFriendCode.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("shows an empty state when there are no friends yet", async () => {
    getFriends.mockResolvedValue([]);
    getMyFriendCode.mockResolvedValue("me-code");
    renderPage();
    expect(await screen.findByText(/No friends yet/)).toBeInTheDocument();
    expect(screen.getByText("Your friends")).toBeInTheDocument();
  });

  it("lists friends with singular/plural heading and per-friend stats", async () => {
    getFriends.mockResolvedValue([
      { userId: "f1", displayName: "Ada", avatarSeed: "A", streak: 5, weekXp: 120 },
    ]);
    getMyFriendCode.mockResolvedValue("me-code");
    renderPage();

    expect(await screen.findByText("1 friend")).toBeInTheDocument();
    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.getByText("🔥 5-day streak")).toBeInTheDocument();
    expect(screen.getByText("120")).toBeInTheDocument();
  });

  it("pluralizes the heading for more than one friend", async () => {
    getFriends.mockResolvedValue([
      { userId: "f1", displayName: "Ada", avatarSeed: "A", streak: 5, weekXp: 120 },
      { userId: "f2", displayName: "Bo", avatarSeed: "B", streak: 1, weekXp: 10 },
    ]);
    getMyFriendCode.mockResolvedValue("me-code");
    renderPage();
    expect(await screen.findByText("2 friends")).toBeInTheDocument();
  });

  it("disables the invite button until the profile has loaded", async () => {
    getFriends.mockResolvedValue([]);
    getMyFriendCode.mockReturnValue(new Promise(() => {}));
    renderPage();
    const button = await screen.findByRole("button", { name: "Copy invite link" });
    expect(button).toBeDisabled();
  });

  it("copies the invite link and shows confirmation text that reverts after 2s", async () => {
    const writeText = navigator.clipboard.writeText as ReturnType<typeof vi.fn>;
    getFriends.mockResolvedValue([]);
    getMyFriendCode.mockResolvedValue("me-123");
    renderPage();

    const button = await screen.findByRole("button", { name: "Copy invite link" });
    // The button starts disabled until getMyFriendCode() resolves and
    // inviteLink is derived from it -- wait for that before clicking.
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/invite/me-123`),
    );
    expect(await screen.findByText("Link copied!")).toBeInTheDocument();

    await waitFor(() => expect(screen.getByRole("button")).toHaveTextContent("Copy invite link"), {
      timeout: 3000,
    });
  });

  it("shows a cancel/confirm toggle for removing a friend, and cancel reverts it", async () => {
    getFriends.mockResolvedValue([
      { userId: "f1", displayName: "Ada", avatarSeed: "A", streak: 5, weekXp: 120 },
    ]);
    getMyFriendCode.mockResolvedValue("me-code");
    renderPage();

    await clickRemoveFriend("Ada");

    expect(await screen.findByRole("button", { name: "Confirm" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(await screen.findByRole("button", { name: "More options for Ada" })).toBeInTheDocument();
    expect(removeFriend).not.toHaveBeenCalled();
  });

  it("removes a friend from the list after confirming", async () => {
    getFriends.mockResolvedValue([
      { userId: "f1", displayName: "Ada", avatarSeed: "A", streak: 5, weekXp: 120 },
      { userId: "f2", displayName: "Bo", avatarSeed: "B", streak: 1, weekXp: 10 },
    ]);
    getMyFriendCode.mockResolvedValue("me-code");
    removeFriend.mockResolvedValue({ ok: true, message: "removed" });
    renderPage();

    await clickRemoveFriend("Ada");
    fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(removeFriend).toHaveBeenCalledWith({ data: { friendId: "f1" } }));
    await waitFor(() => expect(screen.queryByText("Ada")).not.toBeInTheDocument());
    expect(screen.getByText("Bo")).toBeInTheDocument();
    expect(await screen.findByText("1 friend")).toBeInTheDocument();
  });

  // --- failure states (launch fix: a failed call must not read as empty, nor pass for a success) ---

  it("shows an error with Try again, not 'No friends yet', when the list cannot load", async () => {
    getFriends
      .mockRejectedValueOnce(new Error("getFriends: request-failed"))
      .mockResolvedValue([
        { userId: "f1", displayName: "Ada", avatarSeed: "A", streak: 5, weekXp: 120 },
      ]);
    getMyFriendCode.mockResolvedValue("me-code");
    renderPage();

    expect(await screen.findByText("Couldn't load your friends.")).toBeInTheDocument();
    expect(screen.queryByText(/No friends yet/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Ada")).toBeInTheDocument();
  });

  it("keeps the friend in the list and says so when the removal is refused", async () => {
    getFriends.mockResolvedValue([
      { userId: "f1", displayName: "Ada", avatarSeed: "A", streak: 5, weekXp: 120 },
    ]);
    getMyFriendCode.mockResolvedValue("me-code");
    removeFriend.mockResolvedValue({ ok: false, message: "not authenticated" });
    renderPage();

    await clickRemoveFriend("Ada");
    fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));

    expect(await screen.findByText("Couldn't remove Ada. Try again.")).toBeInTheDocument();
    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.getByText("1 friend")).toBeInTheDocument();
  });

  it("keeps the friend in the list and says so when the removal call fails", async () => {
    getFriends.mockResolvedValue([
      { userId: "f1", displayName: "Ada", avatarSeed: "A", streak: 5, weekXp: 120 },
    ]);
    getMyFriendCode.mockResolvedValue("me-code");
    removeFriend.mockRejectedValue(new Error("removeFriend: request-failed"));
    renderPage();

    await clickRemoveFriend("Ada");
    fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));

    expect(await screen.findByText("Couldn't remove Ada. Try again.")).toBeInTheDocument();
    expect(screen.getByText("Ada")).toBeInTheDocument();
  });

  it("says the invite link could not load, with Try again, instead of a dead disabled button", async () => {
    getFriends.mockResolvedValue([]);
    getMyFriendCode
      .mockRejectedValueOnce(new Error("getMyFriendCode: request-failed"))
      .mockResolvedValue("me-code");
    renderPage();

    expect(await screen.findByText("Couldn't load your invite link.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    const copy = await screen.findByRole("button", { name: "Copy invite link" });
    await waitFor(() => expect(copy).toBeEnabled());
  });

  it("explains why Nudge is off when the profile cannot load, and Try again turns it back on", async () => {
    getFriends.mockResolvedValue([
      { userId: "f1", displayName: "Ada", avatarSeed: "A", streak: 5, weekXp: 120 },
    ]);
    getMyFriendCode.mockResolvedValue("me-code");
    getMyProfile
      .mockRejectedValueOnce(new Error("getMyProfile: request-failed"))
      .mockResolvedValue({ id: "me" });
    renderPage();

    expect(
      await screen.findByText("Couldn't load your profile, so nudges are paused."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nudge Ada" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Nudge Ada" })).toBeEnabled());
  });
});
