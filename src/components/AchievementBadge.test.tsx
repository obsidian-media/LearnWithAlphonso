// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AchievementBadge } from "./AchievementBadge";
import { ACHIEVEMENTS } from "../data/achievements";
import { useTheme } from "../lib/theme";

afterEach(() => {
  useTheme.setState({ theme: "meadow" });
});

describe("AchievementBadge", () => {
  it("shows the title and description for every achievement icon variant", () => {
    const seenIcons = new Set(ACHIEVEMENTS.map((a) => a.icon));
    for (const icon of seenIcons) {
      const achievement = ACHIEVEMENTS.find((a) => a.icon === icon)!;
      const { unmount } = render(<AchievementBadge achievement={achievement} unlocked />);
      expect(screen.getByText(achievement.title)).toBeInTheDocument();
      expect(screen.getByText(achievement.description)).toBeInTheDocument();
      unmount();
    }
  });

  it("renders an unknown icon with the default glyph without crashing", () => {
    const achievement = { ...ACHIEVEMENTS[0], icon: "mystery" };
    render(<AchievementBadge achievement={achievement} unlocked />);
    expect(screen.getByText(achievement.title)).toBeInTheDocument();
  });

  it("dims the badge when locked", () => {
    render(<AchievementBadge achievement={ACHIEVEMENTS[0]} unlocked={false} />);
    expect(screen.getByText(ACHIEVEMENTS[0].title).parentElement).toHaveClass("opacity-55");
  });

  it("renders the Studio Ink layout without the card border", () => {
    useTheme.setState({ theme: "studio-ink" });
    render(<AchievementBadge achievement={ACHIEVEMENTS[0]} unlocked />);
    expect(screen.getByText(ACHIEVEMENTS[0].title).parentElement).not.toHaveClass(
      "border-hairline",
    );
  });
});
