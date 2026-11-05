// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AskingAlphonso } from "./AskingAlphonso";
import { mascotArt } from "../lib/mascot-poses";

const setHeight = (h: number) =>
  Object.defineProperty(window, "innerHeight", { value: h, configurable: true });
const tiles = (c: ParentNode) => c.querySelectorAll("[data-mascot-tile]");
const tileWidth = (c: ParentNode) =>
  (c.querySelector("[data-mascot-tile]") as HTMLElement | null)?.style.width;
const LONG = "Choose the sentence that correctly completes the dialogue ".repeat(2);

afterEach(() => {
  cleanup();
  setHeight(768);
});

describe("AskingAlphonso", () => {
  it("keeps the prompt as the question heading, inside the speech bubble", () => {
    setHeight(844);
    render(<AskingAlphonso prompt="Which one means hello?" />);
    const heading = screen.getByRole("heading", { level: 2, name: "Which one means hello?" });
    expect(heading.closest("[data-ask-bubble]")).not.toBeNull();
  });

  it("shows Alphonso's asking pose, decorative because the bubble already says it", () => {
    setHeight(844);
    const { container } = render(<AskingAlphonso prompt="Fill the gap" />);
    const img = container.querySelector("[data-ask-mascot] img");
    expect(img?.getAttribute("src")).toBe(mascotArt("questionAsk").src);
    expect(img?.getAttribute("alt")).toBe("");
  });

  it("a long prompt wraps inside the bubble instead of overflowing", () => {
    render(<AskingAlphonso prompt={LONG.repeat(3)} />);
    const bubble = document.querySelector("[data-ask-bubble]")!;
    for (const c of ["min-w-0", "flex-1", "break-words"]) expect(bubble.className).toContain(c);
  });

  it("renders exactly one portrait, at the size the screen height and the card call for", () => {
    const cases: [number, string, boolean, string | undefined][] = [
      [844, "Q", false, "136px"],
      [800, "Q", false, "136px"],
      [799, "Q", false, "56px"],
      [600, "Q", false, "56px"],
      [599, "Q", false, undefined],
      [550, "Q", false, undefined],
      [844, LONG, false, "56px"], // a long prompt: small
      [844, "Q", true, "56px"], // image / audio / speak control: small
      [844, LONG, true, undefined], // both: none
    ];
    for (const [h, prompt, hasMedia, width] of cases) {
      setHeight(h);
      const { container, unmount } = render(<AskingAlphonso prompt={prompt} hasMedia={hasMedia} />);
      expect(tiles(container).length, `${h}`).toBe(width ? 1 : 0);
      expect(tileWidth(container), `${h}`).toBe(width);
      unmount();
    }
  });

  it("the bubble keeps its prompt when the portrait is gone, and its tail goes with him", () => {
    setHeight(550);
    const { container } = render(<AskingAlphonso prompt="Q" />);
    expect(container.querySelector("[data-ask-mascot]")).toBeNull();
    expect(container.querySelector("[data-ask-bubble] span[aria-hidden]")).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Q" })).toBeTruthy();
  });

  it("does not spring in, so Reduce Motion has nothing to turn off beyond the breathing loop", () => {
    const src = readFileSync("src/components/AskingAlphonso.tsx", "utf8");
    expect(src).not.toMatch(/\benter\b/);
  });
});
