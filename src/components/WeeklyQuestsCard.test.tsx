// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const getWeeklyQuestProgress = vi.fn();
const claimWeeklyQuest = vi.fn();
vi.mock("../lib/quests.functions", () => ({ getWeeklyQuestProgress, claimWeeklyQuest }));

const { WeeklyQuestsCard } = await import("./WeeklyQuestsCard");
const { useProgress } = await import("../lib/progress");

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <WeeklyQuestsCard course="en" />
    </QueryClientProvider>,
  );
}

const open = [
  { questId: "weekly_xp_150", progress: 90, target: 150, claimed: false },
  { questId: "weekly_xp_500", progress: 90, target: 500, claimed: false },
  { questId: "weekly_lessons_5", progress: 5, target: 5, claimed: false },
];

beforeEach(() => {
  getWeeklyQuestProgress.mockReset();
  claimWeeklyQuest.mockReset();
});

describe("WeeklyQuestsCard", () => {
  it("shows each quest with its progress and Claim only on a finished, unclaimed one", async () => {
    getWeeklyQuestProgress.mockResolvedValue(open);
    renderCard();
    expect(await screen.findByText("Weekly Grinder")).toBeInTheDocument();
    expect(screen.getByText("90/150")).toBeInTheDocument();
    expect(screen.getByText("5/5")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Claim / })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Claim Lesson Streak, +40 XP" })).toBeInTheDocument();
  });

  it("claims with the weekly_quests id, shows the XP awarded, and offers no second claim", async () => {
    getWeeklyQuestProgress
      .mockResolvedValueOnce(open)
      .mockResolvedValue(
        open.map((q) => (q.questId === "weekly_lessons_5" ? { ...q, claimed: true } : q)),
      );
    claimWeeklyQuest.mockResolvedValue({ ok: true, xp: 40, totalXp: 240 });
    const user = userEvent.setup();
    renderCard();
    await user.click(await screen.findByRole("button", { name: "Claim Lesson Streak, +40 XP" }));
    expect(claimWeeklyQuest).toHaveBeenCalledWith({
      data: { questId: "weekly_lessons_5", course: "en" },
    });
    expect(await screen.findByText("+40 XP claimed!")).toBeInTheDocument();
    expect(useProgress.getState().xp).toBe(240);
    await vi.waitFor(() => expect(screen.queryByRole("button", { name: /^Claim / })).toBeNull());
    expect(claimWeeklyQuest).toHaveBeenCalledTimes(1);
  });

  it("says why when the server refuses, instead of a connection error", async () => {
    getWeeklyQuestProgress.mockResolvedValue(open);
    claimWeeklyQuest.mockResolvedValue({ ok: false, reason: "already-claimed" });
    const user = userEvent.setup();
    renderCard();
    await user.click(await screen.findByRole("button", { name: /^Claim Lesson Streak/ }));
    expect(await screen.findByText("You already claimed this one.")).toBeInTheDocument();
  });

  it("a failed read says so with a retry, and renders nothing when there are no quests", async () => {
    getWeeklyQuestProgress.mockRejectedValueOnce(new Error("x"));
    const { unmount } = renderCard();
    expect(await screen.findByRole("button", { name: "Try again" })).toBeInTheDocument();
    unmount();
    getWeeklyQuestProgress.mockResolvedValue([]);
    const { container } = renderCard();
    await vi.waitFor(() => expect(getWeeklyQuestProgress).toHaveBeenCalledTimes(2));
    expect(container).toBeEmptyDOMElement();
  });
});
