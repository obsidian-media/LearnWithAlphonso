// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
      <a href={to} {...rest}>
        {children}
      </a>
    ),
  };
});

vi.mock("../../lib/auth-headers", () => ({ authHeaders: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/leaderboard.functions", () => ({ getMyProfile: async () => null }));

const { FinishScreen } = await import("./lesson.$id");

function renderFinish(extra: Partial<React.ComponentProps<typeof FinishScreen>> = {}) {
  return render(
    <FinishScreen
      xp={10}
      unlocked={[]}
      heartsBonus={null}
      lessonTitle="Test lesson"
      correct={5}
      total={5}
      missedQs={[]}
      lessonId="l1"
      course="en"
      {...extra}
    />,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("FinishScreen: league promotion takeover", () => {
  it("opens the takeover 2.4 seconds into the celebration when this lesson moved you up", () => {
    renderFinish({ promotion: { from: "bronze", to: "silver" } });
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => void vi.advanceTimersByTime(2300));
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => void vi.advanceTimersByTime(200));
    expect(screen.getByRole("dialog", { name: "Welcome to Sapling" })).toBeInTheDocument();
  });

  it("never opens when the lesson did not change your league", () => {
    renderFinish();
    act(() => void vi.advanceTimersByTime(10_000));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Continue closes it and leaves the finished lesson underneath", () => {
    renderFinish({ promotion: { from: "bronze", to: "silver" } });
    act(() => void vi.advanceTimersByTime(2500));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("Lesson complete")).toBeInTheDocument();
    // It does not come back.
    act(() => void vi.advanceTimersByTime(10_000));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("a new badge waits for the promotion to be closed, then gets its own sheet", () => {
    renderFinish({ promotion: { from: "bronze", to: "silver" }, unlocked: ["streak_3"] });
    act(() => void vi.advanceTimersByTime(5000));
    // Only the takeover is up, though 2.8 s has long passed.
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByRole("dialog", { name: "Welcome to Sapling" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    act(() => void vi.advanceTimersByTime(3000));
    const dialogs = screen.getAllByRole("dialog");
    expect(dialogs).toHaveLength(1);
    expect(dialogs[0]).not.toHaveAccessibleName("Welcome to Sapling");
  });
});
