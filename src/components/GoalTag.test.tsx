// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GOALS } from "../lib/learner-profile";
import { GoalTag } from "./GoalTag";

describe("GoalTag", () => {
  it("reads 'For your <goal> goal' for every goal the profile offers, with an icon and no link", () => {
    for (const goal of GOALS) {
      const { container, unmount } = render(<GoalTag goal={goal} />);
      expect(screen.getByTestId("goal-tag").textContent).toBe(`For your ${goal} goal`);
      expect(container.querySelector("svg path")?.getAttribute("d")).toBeTruthy();
      expect(container.querySelector("a, button")).toBeNull();
      unmount();
    }
  });
});
