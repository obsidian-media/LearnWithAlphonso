// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { BoltIcon, CheckIcon, FlameIcon, HeartIcon, LockIcon, StarIcon } from "./icons";

const icons = [FlameIcon, BoltIcon, HeartIcon, CheckIcon, LockIcon, StarIcon];

describe("icons", () => {
  it("every icon renders a single accessible-hidden svg", () => {
    for (const Icon of icons) {
      const { container, unmount } = render(<Icon />);
      const svg = container.querySelector("svg");
      expect(svg).toBeTruthy();
      expect(svg).toHaveAttribute("aria-hidden", "true");
      unmount();
    }
  });

  it("forwards a custom className to the svg", () => {
    const { container } = render(<FlameIcon className="size-10 text-ember" />);
    expect(container.querySelector("svg")).toHaveClass("size-10", "text-ember");
  });

  it("defaults to an empty className", () => {
    const { container } = render(<HeartIcon />);
    expect(container.querySelector("svg")?.getAttribute("class")).toBe("");
  });
});
