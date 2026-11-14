// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AchievementBadge } from "./AchievementBadge";
import { AchievementDetail } from "./AchievementDetail";
import { ACHIEVEMENTS } from "../data/achievements";

const streak30 = ACHIEVEMENTS.find((a) => a.id === "streak_30")!;

describe("AchievementBadge", () => {
  it("shows the title, the description and the medallion art for every achievement", () => {
    for (const a of ACHIEVEMENTS) {
      const { container, unmount } = render(
        <AchievementBadge achievement={a} entry={{ state: "earned", value: null }} />,
      );
      expect(screen.getByText(a.title)).toBeInTheDocument();
      expect(screen.getByText(a.description)).toBeInTheDocument();
      expect(container.querySelector("img")).toHaveAttribute("src", `/badges/${a.id}.webp`);
      unmount();
    }
  });

  it("is earned in full colour when unlocked", () => {
    const { container } = render(
      <AchievementBadge achievement={streak30} entry={{ state: "earned", value: 30 }} />,
    );
    expect(container.querySelector("[data-badge-state]")).toHaveAttribute(
      "data-badge-state",
      "earned",
    );
    expect(container.querySelector("img")?.className).not.toContain("grayscale");
  });

  it("is a dimmed ring with 'n of N' while in progress", () => {
    const { container } = render(
      <AchievementBadge achievement={streak30} entry={{ state: "progress", value: 12 }} />,
    );
    expect(container.querySelector("[data-badge-state]")).toHaveAttribute(
      "data-badge-state",
      "progress",
    );
    expect(screen.getByText("12 of 30")).toBeInTheDocument();
    expect(container.querySelector("circle.stroke-ds-xp")).not.toBeNull();
  });

  it("is a grey silhouette with a lock when locked", () => {
    const { container } = render(
      <AchievementBadge achievement={streak30} entry={{ state: "locked", value: null }} />,
    );
    expect(container.querySelector("[data-badge-state]")).toHaveAttribute(
      "data-badge-state",
      "locked",
    );
    expect(container.querySelector("img")?.className).toContain("grayscale");
    expect(screen.getByText(streak30.description)).toBeInTheDocument();
  });

  it("opens the detail when it is tapped", () => {
    const onOpen = vi.fn();
    render(
      <AchievementBadge
        achievement={streak30}
        entry={{ state: "locked", value: null }}
        onOpen={onOpen}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Iron habit/ }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

describe("AchievementDetail", () => {
  const states = (
    over: Record<string, { state: "earned" | "progress" | "locked"; value: number | null }>,
  ) =>
    Object.fromEntries(
      ACHIEVEMENTS.map((a) => [a.id, over[a.id] ?? { state: "locked" as const, value: null }]),
    );

  it("shows progress and the family ladder for a badge in progress", () => {
    render(
      <AchievementDetail
        achievement={streak30}
        unlocked={new Map([["streak_3", "2026-11-01T00:00:00Z"]])}
        states={states({
          streak_3: { state: "earned", value: null },
          streak_30: { state: "progress", value: 12 },
        })}
        onClose={() => {}}
      />,
    );
    expect(screen.getByRole("heading", { name: "Iron habit" })).toBeInTheDocument();
    expect(screen.getByText("Gold")).toBeInTheDocument();
    expect(screen.getByText("12 of 30")).toBeInTheDocument();
    expect(screen.getByText("40%")).toBeInTheDocument();
    expect(screen.getByText("Streak ladder")).toBeInTheDocument();
    expect(screen.getByText("365")).toBeInTheDocument();
  });

  it("says Unlocked with the date for an earned badge, and no progress", () => {
    render(
      <AchievementDetail
        achievement={streak30}
        unlocked={new Map([["streak_30", "2026-11-09T10:00:00Z"]])}
        states={states({ streak_30: { state: "earned", value: null } })}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText("Unlocked")).toBeInTheDocument();
    expect(screen.getByText("Nov 9, 2026")).toBeInTheDocument();
    expect(screen.queryByText(/ of 30/)).toBeNull();
  });

  it("a locked badge shows only what it asks for: no Unlocked, no progress, no date", () => {
    render(
      <AchievementDetail
        achievement={streak30}
        unlocked={new Map()}
        states={states({})}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText(streak30.description)).toBeInTheDocument();
    expect(screen.queryByText("Unlocked")).toBeNull();
    expect(screen.queryByText(/ of 30/)).toBeNull();
    expect(screen.queryByText("40%")).toBeNull();
  });

  it("closes from Done", () => {
    const onClose = vi.fn();
    render(
      <AchievementDetail
        achievement={streak30}
        unlocked={new Map()}
        states={states({})}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
