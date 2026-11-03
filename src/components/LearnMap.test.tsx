// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LearnMap } from "./LearnMap";

describe("LearnMap", () => {
  it("a level with every lesson done still renders Alphonso and the greeting, with no nodes", () => {
    const { container } = render(<LearnMap nodes={[]} greeting="Ready for today's lesson?" />);
    expect(screen.getByText("Ready for today's lesson?")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Alphonso" })).toBeInTheDocument();
    expect(container.querySelectorAll("[data-node]")).toHaveLength(0);
  });

  it("the next node's bounce moves it only up and down, never sideways", () => {
    // Tailwind v4 centres the node with the `translate` property; a keyframe transform with an x offset stacks on it.
    const css = readFileSync("src/styles.css", "utf8");
    const keyframes = css.slice(
      css.indexOf("@keyframes map-node-bounce"),
      css.indexOf(".map-node-bounce {"),
    );
    expect(keyframes).toContain("translateY(");
    expect(keyframes).not.toMatch(/translate\(\s*-50%/);
  });
});
