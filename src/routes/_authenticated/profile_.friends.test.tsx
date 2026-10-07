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
const { useTheme } = await import("../../lib/theme");

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
  getFriends.mockReset();
  removeFriend.mockReset();
  getMyFriendCode.mockReset();
  getMyBuddy.mockReset().mockResolvedValue(null);
  getBuddyRequests.mockReset().mockResolvedValue([]);
  requestBuddy.mockReset();
  useTheme.setState({ theme: "meadow" });
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

    const removeButton = await screen.findByRole("button", { name: "Remove Ada" });
    fireEvent.click(removeButton);

    expect(await screen.findByRole("button", { name: "Confirm" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(await screen.findByRole("button", { name: "Remove Ada" })).toBeInTheDocument();
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

    fireEvent.click(await screen.findByRole("button", { name: "Remove Ada" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(removeFriend).toHaveBeenCalledWith({ data: { friendId: "f1" } }));
    await waitFor(() => expect(screen.queryByText("Ada")).not.toBeInTheDocument());
    expect(screen.getByText("Bo")).toBeInTheDocument();
    expect(await screen.findByText("1 friend")).toBeInTheDocument();
  });

  it("uses the studio-ink copy and arrow affordance for that theme", async () => {
    useTheme.setState({ theme: "studio-ink" });
    getFriends.mockResolvedValue([]);
    getMyFriendCode.mockResolvedValue("me-code");
    renderPage();
    expect(await screen.findByText("Copy invite link →")).toBeInTheDocument();
  });
});
