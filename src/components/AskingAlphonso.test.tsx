// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AskingAlphonso } from "./AskingAlphonso";
import { mascotArt } from "../lib/mascot-poses";

describe("AskingAlphonso", () => {
  it("keeps the prompt as the question heading, inside the speech bubble", () => {
    render(<AskingAlphonso prompt="Which one means hello?" />);
    const heading = screen.getByRole("heading", { level: 2, name: "Which one means hello?" });
    expect(heading.closest("[data-ask-bubble]")).not.toBeNull();
  });

  it("shows Alphonso's asking pose, decorative because the bubble already says it", () => {
    const { container } = render(<AskingAlphonso prompt="Fill the gap" />);
    const img = container.querySelector("[data-ask-mascot] img");
    expect(img?.getAttribute("src")).toBe(mascotArt("questionAsk").src);
    expect(img?.getAttribute("alt")).toBe("");
  });

  it("a long prompt wraps inside the bubble instead of overflowing", () => {
    const long = "Choose the sentence that correctly completes the dialogue ".repeat(6);
    render(<AskingAlphonso prompt={long} />);
    const bubble = document.querySelector("[data-ask-bubble]")!;
    expect(bubble.className).toContain("min-w-0");
    expect(bubble.className).toContain("flex-1");
    expect(bubble.className).toContain("break-words");
  });

  it("the mascot is hidden on a short screen so the answers stay above the fold", () => {
    render(<AskingAlphonso prompt="Q" />);
    const cls = document.querySelector("[data-ask-mascot]")!.className;
    expect(cls).toMatch(/min-height:\s*[56]\d\dpx/);
    expect(cls).toContain("hidden");
  });

  it("on a tall screen he is a large figure, beside the bubble, in the same pose", () => {
    const { container } = render(<AskingAlphonso prompt="Q" />);
    const large = container.querySelector("[data-ask-mascot-large]")!;
    expect(large.className).toMatch(/min-height:\s*8\d\dpx/);
    expect(large.querySelector("[data-mascot-tile]")?.getAttribute("style")).toMatch(
      /width:\s*1[2-6]\dpx/,
    );
    expect(large.querySelector("img")?.getAttribute("src")).toBe(mascotArt("questionAsk").src);
    // The middle step stops where the large one starts, so only one shows at a time.
    expect(container.querySelector("[data-ask-mascot]")!.className).toMatch(/max-height:\s*799px/);
  });

  it("does not spring in, so Reduce Motion has nothing to turn off beyond the breathing loop", () => {
    const src = readFileSync("src/components/AskingAlphonso.tsx", "utf8");
    expect(src).not.toMatch(/\benter\b/);
  });
});
