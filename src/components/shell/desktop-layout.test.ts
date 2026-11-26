import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { desktopColumnsAt, FRAME_MAX } from "./desktop-layout";

const shell = readFileSync(path.resolve(import.meta.dirname, "../AppShell.tsx"), "utf8");

/** The classes the wide tier gives its main column, read from AppShell.tsx. */
const wideMainClass = /tier === "wide" \? "([^"]+)"/.exec(shell)?.[1] ?? "";
/** Whether that main column can give up width when the window is narrow. */
const mainShrinks = /\bmin-w-0\b/.test(wideMainClass) && !/\bshrink-0\b/.test(wideMainClass);

describe("desktop shell layout (QA round 5: the right rail was clipped at exactly 1280)", () => {
  it("the numbers in desktop-layout.ts are the classes AppShell.tsx really uses", () => {
    expect(shell).toContain("w-[248px]"); // labelled rail
    expect(shell).toContain("w-[84px]"); // icon rail
    expect(shell).toContain("px-4 xl:px-8"); // 16 each side, 32 from 1280
    expect(shell).toContain("max-w-[1400px]");
    expect(shell).toContain("w-[280px] shrink-0"); // compact panel, never shrunk
    expect(shell).toContain("xl:w-[336px]");
    expect(shell).toContain("gap-6");
    expect(FRAME_MAX).toBe(1400);
    expect(wideMainClass).toContain("max-w-[720px]"); // 720 is a cap
  });

  it("the wide main column can shrink (a fixed 720 beside the rail and a 336 panel needs 1392px)", () => {
    expect(wideMainClass).toMatch(/\bmin-w-0\b/);
    expect(wideMainClass).toMatch(/\bflex-1\b/);
    expect(wideMainClass).not.toMatch(/\bshrink-0\b/);
    expect(wideMainClass).not.toMatch(/(^|\s)w-\[720px\]/);
  });

  it("never needs more room than the window has, at any width from 768 to 1600, with or without a panel", () => {
    const failures: string[] = [];
    for (let width = 768; width <= 1600; width += 1) {
      for (const withPanel of [true, false]) {
        const cols = desktopColumnsAt(width, { withPanel, mainShrinks });
        if (cols.overflow > 0)
          failures.push(`${width}px${withPanel ? "" : " (no panel)"}: +${cols.overflow}px`);
      }
    }
    expect(failures.slice(0, 5)).toEqual([]);
    expect(failures).toHaveLength(0);
  });

  it("1280 exactly, the reported width: nothing overflows and the main column stays readable", () => {
    const cols = desktopColumnsAt(1280, { mainShrinks });
    expect(cols.overflow).toBe(0);
    expect(cols.panel).toBe(336);
    expect(cols.main).toBeGreaterThanOrEqual(560);
  });

  it("keeps the main column readable at every width that has a panel", () => {
    for (let width = 1024; width <= 1600; width += 1) {
      expect(desktopColumnsAt(width, { mainShrinks }).main).toBeGreaterThanOrEqual(480);
    }
  });

  it("reaches the full 720 beside the panel once the window is wide enough, and never more", () => {
    expect(desktopColumnsAt(1440, { mainShrinks }).main).toBe(720);
    expect(desktopColumnsAt(1600, { mainShrinks }).main).toBe(720);
  });
});
