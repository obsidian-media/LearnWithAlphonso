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
vi.mock("../lib/buddy.functions", () => ({
  getMyBuddy,
  getBuddyRequests,
  requestBuddy,
  respondBuddyRequest,
  cancelBuddyRequest,
  endBuddy,
}));

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
  ]) {
    f.mockReset();
  }
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
