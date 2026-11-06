// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

let reduce = false;
vi.mock("framer-motion", async (orig) => ({
  ...(await orig<typeof import("framer-motion")>()),
  useReducedMotion: () => reduce,
}));

const { MascotImage } = await import("./MascotImage");
const { mascotArt } = await import("../lib/mascot-poses");

afterEach(() => {
  reduce = false;
});

describe("MascotImage", () => {
  it("shows the moment's pose on a coloured tile, breathing", () => {
    render(<MascotImage moment="lessonComplete" size={168} tone="sun" alt="Alphonso" />);
    const img = screen.getByRole("img", { name: "Alphonso" });
    expect(img.getAttribute("src")).toBe(mascotArt("lessonComplete").src);
    expect(img.closest("[data-mascot-tile]")?.className).toContain("bg-tile-sun-bg");
    expect(img.closest(".mascot-breathe")).not.toBeNull();
  });

  it("a decorative mascot is hidden from screen readers", () => {
    const { container } = render(<MascotImage moment="emptyState" size={120} tone="mint" alt="" />);
    expect(container.querySelector("img")?.getAttribute("alt")).toBe("");
  });

  it("with Reduce Motion it neither springs in nor breathes", () => {
    reduce = true;
    render(<MascotImage moment="lessonComplete" size={168} tone="sun" alt="Alphonso" enter />);
    const img = screen.getByRole("img", { name: "Alphonso" });
    expect(img.closest(".mascot-breathe")).toBeNull();
    expect(img.getAttribute("style") ?? "").not.toMatch(/opacity:\s*0|scale\(0/);
  });

  it("the breathing loop is also switched off by the CSS reduced-motion rule", () => {
    const css = readFileSync("src/styles.css", "utf8");
    expect(css).toMatch(/@keyframes mascot-breathe/);
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*\.mascot-breathe\s*\{[^}]*animation:\s*none/,
    );
  });
});

describe("mascot call sites", () => {
  it("every web mascot goes through MascotImage, so they all move the same way", () => {
    for (const file of [
      "src/components/MascotBanner.tsx",
      "src/routes/_authenticated/listen.tsx",
    ]) {
      const src = readFileSync(file, "utf8");
      expect(src, file).toContain("<MascotImage");
      expect(src, file).not.toMatch(/src=\{mascotArt\(/);
    }
  });

  it("the lesson uses the realistic kit's expressions in the room, not the old mascot art (round 6)", () => {
    const src = readFileSync("src/routes/_authenticated/lesson.$id.tsx", "utf8");
    expect(src).toContain("<LessonRoom");
    expect(src).not.toMatch(/<MascotImage|\/mascots\/|mascotArt\(/);
  });
});
