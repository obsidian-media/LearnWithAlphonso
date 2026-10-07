// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const getMyBuddy = vi.fn();
const getBuddyRequests = vi.fn();
const requestBuddy = vi.fn();
const respondBuddyRequest = vi.fn();
const cancelBuddyRequest = vi.fn();
const endBuddy = vi.fn();
const sendBuddyMessage = vi.fn();
const getBuddyMessages = vi.fn();
const joinBuddyPool = vi.fn();
const leaveBuddyPool = vi.fn();
const getBuddyPool = vi.fn();
vi.mock("../lib/buddy.functions", () => ({
  getMyBuddy,
  getBuddyRequests,
  requestBuddy,
  respondBuddyRequest,
  cancelBuddyRequest,
  endBuddy,
  sendBuddyMessage,
  getBuddyMessages,
  joinBuddyPool,
  leaveBuddyPool,
  getBuddyPool,
}));
vi.mock("../lib/social-safety.functions", () => ({ blockUser: vi.fn(), reportUser: vi.fn() }));

const { BuddyCard, AskBuddyButton } = await import("./BuddyCard");

const FRIEND = "3f2b6c1e-8a4d-4c7e-9b1a-2d5e6f708192";

function renderWithClient(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const buddy = {
  pairId: "p1",
  buddyId: "u2",
  buddyName: "Bo",
  buddyAvatarSeed: "cd",
  pairedAt: "2026-10-01T00:00:00Z",
  weekStart: "2026-10-05",
  myCount: 2,
  buddyCount: 3,
  goal: 3,
  streakWeeks: 4,
  graceAvailable: true,
  lastOutcome: "hit",
};

beforeEach(() => {
  for (const f of [
    getMyBuddy,
    getBuddyRequests,
    requestBuddy,
    respondBuddyRequest,
    cancelBuddyRequest,
    endBuddy,
    sendBuddyMessage,
    getBuddyMessages,
    joinBuddyPool,
    leaveBuddyPool,
    getBuddyPool,
  ]) {
    f.mockReset();
  }
  getBuddyMessages.mockResolvedValue([]);
  getBuddyPool.mockResolvedValue({
    matchingEnabled: false,
    waiting: false,
    course: null,
    courses: [],
  });
});

describe("BuddyCard", () => {
  it("shows the buddy's week and streak", async () => {
    getMyBuddy.mockResolvedValue(buddy);
    getBuddyRequests.mockResolvedValue([]);
    renderWithClient(<BuddyCard />);
    expect(await screen.findByText("Bo")).toBeInTheDocument();
    expect(screen.getByText("You 2/3 · Buddy 3/3 this week")).toBeInTheDocument();
    expect(screen.getByText("Streak: 4 weeks")).toBeInTheDocument();
    expect(screen.getByText("1 grace week left")).toBeInTheDocument();
  });

  it("says 1 week, and no grace week left", async () => {
    getMyBuddy.mockResolvedValue({ ...buddy, streakWeeks: 1, graceAvailable: false });
    getBuddyRequests.mockResolvedValue([]);
    renderWithClient(<BuddyCard />);
    expect(await screen.findByText("Streak: 1 week")).toBeInTheDocument();
    expect(screen.getByText("No grace week left")).toBeInTheDocument();
  });

  it("says it could not load, never 'pick a friend', when the lookup fails, and Try again recovers", async () => {
    getMyBuddy.mockRejectedValueOnce(new Error("boom"));
    getBuddyRequests.mockResolvedValue([]);
    renderWithClient(<BuddyCard />);
    expect(await screen.findByText("Couldn't load your study buddy.")).toBeInTheDocument();
    expect(screen.queryByText(/Pick a friend/)).not.toBeInTheDocument();

    getMyBuddy.mockResolvedValue(null);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText(/Pick a friend to study with/)).toBeInTheDocument();
  });

  it("also says it could not load when only the requests lookup fails", async () => {
    getMyBuddy.mockResolvedValue(null);
    getBuddyRequests.mockRejectedValue(new Error("boom"));
    renderWithClient(<BuddyCard />);
    expect(await screen.findByText("Couldn't load your study buddy.")).toBeInTheDocument();
  });

  it("accepts an incoming request and shows the server's answer", async () => {
    getMyBuddy.mockResolvedValue(null);
    getBuddyRequests.mockResolvedValue([
      {
        requestId: "r1",
        direction: "incoming",
        otherId: "u2",
        otherName: "Bo",
        otherAvatarSeed: "cd",
        requestedAt: "2026-10-06T00:00:00Z",
      },
    ]);
    respondBuddyRequest.mockResolvedValue({ status: "friend_paired" });
    renderWithClient(<BuddyCard />);
    expect(await screen.findByText("Bo wants to be your study buddy.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() =>
      expect(respondBuddyRequest).toHaveBeenCalledWith({ data: { requestId: "r1", accept: true } }),
    );
    expect(await screen.findByText("Your friend already has a study buddy.")).toBeInTheDocument();
  });

  it("declines an incoming request", async () => {
    getMyBuddy.mockResolvedValue(null);
    getBuddyRequests.mockResolvedValue([
      {
        requestId: "r1",
        direction: "incoming",
        otherId: "u2",
        otherName: "Bo",
        otherAvatarSeed: "cd",
        requestedAt: "2026-10-06T00:00:00Z",
      },
    ]);
    respondBuddyRequest.mockResolvedValue({ status: "declined" });
    renderWithClient(<BuddyCard />);
    fireEvent.click(await screen.findByRole("button", { name: "Decline" }));
    await waitFor(() =>
      expect(respondBuddyRequest).toHaveBeenCalledWith({
        data: { requestId: "r1", accept: false },
      }),
    );
    expect(await screen.findByText("Request declined.")).toBeInTheDocument();
  });

  it("cancels an outgoing request", async () => {
    getMyBuddy.mockResolvedValue(null);
    getBuddyRequests.mockResolvedValue([
      {
        requestId: "r2",
        direction: "outgoing",
        otherId: "u3",
        otherName: "Cy",
        otherAvatarSeed: "ef",
        requestedAt: "2026-10-06T00:00:00Z",
      },
    ]);
    cancelBuddyRequest.mockResolvedValue({ status: "cancelled" });
    renderWithClient(<BuddyCard />);
    expect(await screen.findByText("Waiting for Cy.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel request" }));
    await waitFor(() =>
      expect(cancelBuddyRequest).toHaveBeenCalledWith({ data: { requestId: "r2" } }),
    );
    expect(await screen.findByText("Request cancelled.")).toBeInTheDocument();
  });

  it("ends the pair only after confirming", async () => {
    getMyBuddy.mockResolvedValue(buddy);
    getBuddyRequests.mockResolvedValue([]);
    endBuddy.mockResolvedValue({ status: "ended" });
    renderWithClient(<BuddyCard />);
    fireEvent.click(await screen.findByRole("button", { name: "End study buddy" }));
    expect(
      screen.getByText("End being study buddies with Bo? Your streak ends."),
    ).toBeInTheDocument();
    expect(endBuddy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Yes, end" }));
    await waitFor(() => expect(endBuddy).toHaveBeenCalled());
    expect(await screen.findByText("You're no longer study buddies.")).toBeInTheDocument();
  });

  it("keeps the pair when the confirmation is cancelled", async () => {
    getMyBuddy.mockResolvedValue(buddy);
    getBuddyRequests.mockResolvedValue([]);
    renderWithClient(<BuddyCard />);
    fireEvent.click(await screen.findByRole("button", { name: "End study buddy" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep" }));
    expect(screen.getByRole("button", { name: "End study buddy" })).toBeInTheDocument();
    expect(endBuddy).not.toHaveBeenCalled();
  });

  it("shows a generic message when an action itself fails", async () => {
    getMyBuddy.mockResolvedValue(buddy);
    getBuddyRequests.mockResolvedValue([]);
    endBuddy.mockRejectedValue(new Error("network"));
    renderWithClient(<BuddyCard />);
    fireEvent.click(await screen.findByRole("button", { name: "End study buddy" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, end" }));
    expect(await screen.findByText("Something went wrong. Try again.")).toBeInTheDocument();
  });
});

describe("AskBuddyButton", () => {
  it("hides while the user already has a buddy", async () => {
    getMyBuddy.mockResolvedValue({
      ...buddy,
      myCount: 0,
      buddyCount: 0,
      streakWeeks: 0,
      lastOutcome: null,
    });
    getBuddyRequests.mockResolvedValue([]);
    renderWithClient(
      <>
        <BuddyCard />
        <AskBuddyButton friendId={FRIEND} />
      </>,
    );
    expect(await screen.findByText("Bo")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ask to be study buddy" })).not.toBeInTheDocument();
  });

  it("hides when a request with this friend is already pending", async () => {
    getMyBuddy.mockResolvedValue(null);
    getBuddyRequests.mockResolvedValue([
      {
        requestId: "r2",
        direction: "outgoing",
        otherId: FRIEND,
        otherName: "Cy",
        otherAvatarSeed: "ef",
        requestedAt: "2026-10-06T00:00:00Z",
      },
    ]);
    renderWithClient(
      <>
        <BuddyCard />
        <AskBuddyButton friendId={FRIEND} />
      </>,
    );
    expect(await screen.findByText("Waiting for Cy.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ask to be study buddy" })).not.toBeInTheDocument();
  });

  it("hides while the lookup failed", async () => {
    getMyBuddy.mockRejectedValue(new Error("boom"));
    getBuddyRequests.mockResolvedValue([]);
    renderWithClient(
      <>
        <BuddyCard />
        <AskBuddyButton friendId={FRIEND} />
      </>,
    );
    expect(await screen.findByText("Couldn't load your study buddy.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ask to be study buddy" })).not.toBeInTheDocument();
  });

  it("asks a friend and shows the server's answer", async () => {
    getMyBuddy.mockResolvedValue(null);
    getBuddyRequests.mockResolvedValue([]);
    requestBuddy.mockResolvedValue({ status: "requested" });
    renderWithClient(<AskBuddyButton friendId={FRIEND} />);
    fireEvent.click(await screen.findByRole("button", { name: "Ask to be study buddy" }));
    await waitFor(() => expect(requestBuddy).toHaveBeenCalledWith({ data: { friendId: FRIEND } }));
    expect(
      await screen.findByText("Request sent. They'll see it on their Friends page."),
    ).toBeInTheDocument();
  });
});

describe("AskBuddyButton after an answer", () => {
  it("keeps the button after a failed request so the friend can be asked again", async () => {
    getMyBuddy.mockResolvedValue(null);
    getBuddyRequests.mockResolvedValue([]);
    requestBuddy.mockRejectedValueOnce(new Error("network"));
    renderWithClient(<AskBuddyButton friendId={FRIEND} />);
    fireEvent.click(await screen.findByRole("button", { name: "Ask to be study buddy" }));
    expect(await screen.findByText("Something went wrong. Try again.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ask to be study buddy" })).toBeInTheDocument();
  });

  it("comes back, without the old answer, once the request is cancelled from the card", async () => {
    const outgoing = {
      requestId: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
      direction: "outgoing",
      otherId: FRIEND,
      otherName: "Cy",
      otherAvatarSeed: "ef",
      requestedAt: "2026-10-06T00:00:00Z",
    };
    getMyBuddy.mockResolvedValue(null);
    getBuddyRequests.mockResolvedValue([]);
    requestBuddy.mockImplementation(async () => {
      getBuddyRequests.mockResolvedValue([outgoing]);
      return { status: "requested" };
    });
    cancelBuddyRequest.mockImplementation(async () => {
      getBuddyRequests.mockResolvedValue([]);
      return { status: "cancelled" };
    });
    renderWithClient(
      <>
        <BuddyCard />
        <AskBuddyButton friendId={FRIEND} />
      </>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Ask to be study buddy" }));
    expect(
      await screen.findByText("Request sent. They'll see it on their Friends page."),
    ).toBeInTheDocument();
    expect(await screen.findByText("Waiting for Cy.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ask to be study buddy" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel request" }));
    expect(
      await screen.findByRole("button", { name: "Ask to be study buddy" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Request sent. They'll see it on their Friends page."),
    ).not.toBeInTheDocument();
  });
});

describe("BuddyCard messages", () => {
  const presets = [
    "Let's study together!",
    "Nice work!",
    "Keep going, you've got this!",
    "Need a hand?",
    "On my way to a lesson!",
    "Good morning!",
    "Good night!",
    "Proud of you!",
  ];

  it("offers exactly the 8 presets, in order, and no way to type a message", async () => {
    getMyBuddy.mockResolvedValue(buddy);
    getBuddyRequests.mockResolvedValue([]);
    renderWithClient(<BuddyCard />);
    expect(await screen.findByText("Send Bo a message")).toBeInTheDocument();
    const group = screen.getByRole("group", { name: "Send Bo a message" });
    const labels = Array.from(group.querySelectorAll("button")).map((b) => b.textContent);
    expect(labels).toEqual(presets);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("sends the preset's id and shows the server's answer", async () => {
    getMyBuddy.mockResolvedValue(buddy);
    getBuddyRequests.mockResolvedValue([]);
    sendBuddyMessage.mockResolvedValue({ status: "rate_limited" });
    renderWithClient(<BuddyCard />);
    fireEvent.click(await screen.findByRole("button", { name: "Nice work!" }));
    await waitFor(() =>
      expect(sendBuddyMessage).toHaveBeenCalledWith({ data: { presetId: "nice_work" } }),
    );
    expect(
      await screen.findByText("You've sent a lot of messages. Try again in a while."),
    ).toBeInTheDocument();
  });

  it("shows the recent messages from both sides, skipping a preset this client does not know", async () => {
    getMyBuddy.mockResolvedValue(buddy);
    getBuddyRequests.mockResolvedValue([]);
    getBuddyMessages.mockResolvedValue([
      {
        messageId: "m1",
        senderId: "u1",
        isMine: true,
        presetId: "nice_work",
        sentAt: "2026-10-07T00:00:00Z",
      },
      {
        messageId: "m2",
        senderId: "u2",
        isMine: false,
        presetId: "good_night",
        sentAt: "2026-10-07T00:01:00Z",
      },
      {
        messageId: "m3",
        senderId: "u2",
        isMine: false,
        presetId: "from_the_future",
        sentAt: "2026-10-07T00:02:00Z",
      },
    ]);
    renderWithClient(<BuddyCard />);
    expect(await screen.findByText("You: Nice work!")).toBeInTheDocument();
    expect(screen.getByText("Bo: Good night!")).toBeInTheDocument();
    expect(screen.queryByText(/from_the_future/)).not.toBeInTheDocument();
    // The unknown preset leaves no empty row behind: exactly the two known messages are listed.
    expect(
      screen.getByRole("list", { name: "Recent messages" }).querySelectorAll("li"),
    ).toHaveLength(2);
  });

  it("says it could not load, never an empty history, when the messages read fails", async () => {
    getMyBuddy.mockResolvedValue(buddy);
    getBuddyRequests.mockResolvedValue([]);
    getBuddyMessages.mockRejectedValue(new Error("boom"));
    renderWithClient(<BuddyCard />);
    expect(await screen.findByText("Couldn't load your study buddy.")).toBeInTheDocument();
  });

  it("Try again also retries the messages read, which is what failed", async () => {
    getMyBuddy.mockResolvedValue(buddy);
    getBuddyRequests.mockResolvedValue([]);
    getBuddyMessages.mockRejectedValueOnce(new Error("boom"));
    renderWithClient(<BuddyCard />);
    expect(await screen.findByText("Couldn't load your study buddy.")).toBeInTheDocument();
    getBuddyMessages.mockResolvedValue([
      {
        messageId: "m1",
        senderId: "u2",
        isMine: false,
        presetId: "nice_work",
        sentAt: "2026-10-07T00:00:00Z",
      },
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Bo: Nice work!")).toBeInTheDocument();
  });

  it("keeps 'You're study buddies now.' after accepting, although the messages then load for the first time", async () => {
    getMyBuddy.mockResolvedValue(null);
    getBuddyRequests.mockResolvedValue([
      {
        requestId: "r1",
        direction: "incoming",
        otherId: "u2",
        otherName: "Bo",
        otherAvatarSeed: "cd",
        requestedAt: "2026-10-06T00:00:00Z",
      },
    ]);
    respondBuddyRequest.mockImplementation(async () => {
      getMyBuddy.mockResolvedValue(buddy);
      getBuddyRequests.mockResolvedValue([]);
      return { status: "paired" };
    });
    renderWithClient(<BuddyCard />);
    fireEvent.click(await screen.findByRole("button", { name: "Accept" }));
    expect(await screen.findByText("Send Bo a message")).toBeInTheDocument();
    await waitFor(() => expect(getBuddyMessages).toHaveBeenCalled());
    // Let the first messages load land, then the answer must still be there.
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByText("You're study buddies now.")).toBeInTheDocument();
  });

  it("never shows one pair's messages under a new buddy's name", async () => {
    getMyBuddy.mockResolvedValue(buddy);
    getBuddyRequests.mockResolvedValue([]);
    getBuddyMessages.mockResolvedValue([
      {
        messageId: "m1",
        senderId: "u2",
        isMine: false,
        presetId: "nice_work",
        sentAt: "2026-10-07T00:00:00Z",
      },
    ]);
    endBuddy.mockImplementation(async () => {
      // The pair ends and, by the next read, the user is paired with someone else whose messages are still loading.
      getMyBuddy.mockResolvedValue({ ...buddy, pairId: "p2", buddyId: "u3", buddyName: "Cy" });
      getBuddyMessages.mockReturnValue(new Promise(() => {}));
      return { status: "ended" };
    });
    renderWithClient(<BuddyCard />);
    expect(await screen.findByText("Bo: Nice work!")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "End study buddy" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, end" }));
    expect(await screen.findByText("Send Cy a message")).toBeInTheDocument();
    expect(screen.queryByText("Cy: Nice work!")).not.toBeInTheDocument();
  });
});

describe("BuddyCard matching (opt-in)", () => {
  const intro =
    "Or let us find one: we'll pair you with another learner of the same course at a similar level. You'll see each other's name and weekly progress, and can only send the preset messages. You can end it, block or report at any time.";

  it("explains matching and offers one button per course the learner studies", async () => {
    getMyBuddy.mockResolvedValue(null);
    getBuddyRequests.mockResolvedValue([]);
    getBuddyPool.mockResolvedValue({
      matchingEnabled: true,
      waiting: false,
      course: null,
      courses: ["en", "fr"],
    });
    joinBuddyPool.mockResolvedValue({ status: "waiting" });
    renderWithClient(<BuddyCard />);
    expect(await screen.findByText(intro)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Find me a study buddy (English)" }),
    ).toBeInTheDocument();
    // Matching needs the age confirmation first (owner decision: minimum age 13).
    expect(screen.getByRole("button", { name: "Find me a study buddy (French)" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "I'm 13 or older" }));
    fireEvent.click(screen.getByRole("button", { name: "Find me a study buddy (French)" }));
    await waitFor(() =>
      expect(joinBuddyPool).toHaveBeenCalledWith({ data: { course: "fr", ageConfirmed: true } }),
    );
    expect(
      await screen.findByText("You're on the list. We'll pair you with a learner at your level."),
    ).toBeInTheDocument();
  });

  it("while waiting, says so and lets the learner stop looking", async () => {
    getMyBuddy.mockResolvedValue(null);
    getBuddyRequests.mockResolvedValue([]);
    getBuddyPool.mockResolvedValue({
      matchingEnabled: true,
      waiting: true,
      course: "es",
      courses: ["es"],
    });
    leaveBuddyPool.mockResolvedValue({ status: "left" });
    renderWithClient(<BuddyCard />);
    expect(
      await screen.findByText("Looking for a study buddy learning Spanish at your level."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Find me a study buddy/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Stop looking" }));
    await waitFor(() => expect(leaveBuddyPool).toHaveBeenCalled());
  });

  it("offers nothing about matching while the switch is off", async () => {
    getMyBuddy.mockResolvedValue(null);
    getBuddyRequests.mockResolvedValue([]);
    getBuddyPool.mockResolvedValue({
      matchingEnabled: false,
      waiting: false,
      course: null,
      courses: ["en"],
    });
    renderWithClient(<BuddyCard />);
    expect(await screen.findByText(/Pick a friend to study with/)).toBeInTheDocument();
    expect(screen.queryByText(intro)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Find me a study buddy/ })).not.toBeInTheDocument();
  });

  it("a matched buddy is labelled and can be blocked or reported from the card", async () => {
    getMyBuddy.mockResolvedValue({ ...buddy, isMatch: true });
    getBuddyRequests.mockResolvedValue([]);
    renderWithClient(<BuddyCard />);
    expect(await screen.findByText("Matched learner")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "More options for Bo" })).toBeInTheDocument();
  });

  it("a friend buddy is not labelled as matched", async () => {
    getMyBuddy.mockResolvedValue({ ...buddy, isMatch: false });
    getBuddyRequests.mockResolvedValue([]);
    renderWithClient(<BuddyCard />);
    expect(await screen.findByText("Bo")).toBeInTheDocument();
    expect(screen.queryByText("Matched learner")).not.toBeInTheDocument();
  });

  it("a failed pool read is a load failure, never 'matching is off'", async () => {
    getMyBuddy.mockResolvedValue(null);
    getBuddyRequests.mockResolvedValue([]);
    getBuddyPool.mockRejectedValue(new Error("boom"));
    renderWithClient(<BuddyCard />);
    expect(await screen.findByText("Couldn't load your study buddy.")).toBeInTheDocument();
  });

  it("a waiting learner can still stop looking while matching is switched off", async () => {
    getMyBuddy.mockResolvedValue(null);
    getBuddyRequests.mockResolvedValue([]);
    getBuddyPool.mockResolvedValue({
      matchingEnabled: false,
      waiting: true,
      course: "en",
      courses: ["en"],
    });
    leaveBuddyPool.mockResolvedValue({ status: "left" });
    renderWithClient(<BuddyCard />);
    expect(
      await screen.findByText("Looking for a study buddy learning English at your level."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Stop looking" }));
    await waitFor(() => expect(leaveBuddyPool).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /Find me a study buddy/ })).not.toBeInTheDocument();
  });
});
