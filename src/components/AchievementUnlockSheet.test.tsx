// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

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

const { AchievementUnlockSheet } = await import("./AchievementUnlockSheet");

describe("AchievementUnlockSheet", () => {
  it("shows the badge, its tier, a line for streaks, the flame pose and the medallion", () => {
    const { container } = render(<AchievementUnlockSheet ids={["streak_30"]} onDone={() => {}} />);
    expect(screen.getByText("Achievement unlocked")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Iron habit" })).toBeInTheDocument();
    expect(screen.getByText("Gold")).toBeInTheDocument();
    const imgs = [...container.ownerDocument.querySelectorAll("img")].map((i) =>
      i.getAttribute("src"),
    );
    expect(imgs).toContain("/figures/alphonso-streak-flame.webp");
    expect(imgs).toContain("/badges/streak_30.webp");
    cleanup();
  });

  it("walks through several new badges, then finishes", () => {
    const onDone = vi.fn();
    render(<AchievementUnlockSheet ids={["xp_500", "perfect_1"]} onDone={onDone} />);
    expect(screen.getByRole("heading", { name: "Getting fluent" })).toBeInTheDocument();
    expect(screen.getByText("You have earned 500 XP in total.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Flawless" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("draws nothing for ids the catalog does not know", () => {
    const { container } = render(<AchievementUnlockSheet ids={["nope"]} onDone={() => {}} />);
    expect(container.ownerDocument.querySelector("[role=dialog]")).toBeNull();
  });
});
