// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  PALETTE_BOOT_SCRIPT,
  PALETTE_NAMES,
  paletteForTheme,
  resolveInitialPalette,
  usePalette,
} from "./palette";

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.palette;
});
afterEach(() => localStorage.clear());

describe("palette preference", () => {
  it("has two palettes, Royal first", () => {
    expect(PALETTE_NAMES).toEqual(["royal", "meadow"]);
  });

  it("maps each retired theme to a palette: Meadow stays Meadow, the rest become Royal", () => {
    expect(paletteForTheme("meadow")).toBe("meadow");
    expect(paletteForTheme("canopy")).toBe("royal");
    expect(paletteForTheme("studio-ink")).toBe("royal");
    expect(paletteForTheme("manuscript")).toBe("royal");
    expect(paletteForTheme(null)).toBe("royal");
  });

  it("a stored palette wins; otherwise the stored theme decides; otherwise Royal", () => {
    expect(resolveInitialPalette("meadow", "canopy")).toBe("meadow");
    expect(resolveInitialPalette("royal", "meadow")).toBe("royal");
    expect(resolveInitialPalette(null, "meadow")).toBe("meadow");
    expect(resolveInitialPalette("bogus", "meadow")).toBe("meadow");
    expect(resolveInitialPalette(undefined, undefined)).toBe("royal");
  });

  it("setPalette stores it next to the theme and sets data-palette on <html>", () => {
    usePalette.getState().setPalette("meadow");
    expect(localStorage.getItem("palette")).toBe("meadow");
    expect(document.documentElement.dataset.palette).toBe("meadow");
    expect(usePalette.getState().palette).toBe("meadow");
    usePalette.getState().setPalette("royal");
    expect(localStorage.getItem("palette")).toBe("royal");
    expect(document.documentElement.dataset.palette).toBe("royal");
  });
});

describe("first paint", () => {
  const run = () => new Function(PALETTE_BOOT_SCRIPT)();

  it("uses the stored palette", () => {
    localStorage.setItem("palette", "meadow");
    localStorage.setItem("theme", "canopy");
    run();
    expect(document.documentElement.dataset.palette).toBe("meadow");
  });

  it("with no palette stored, follows the stored theme", () => {
    localStorage.setItem("theme", "meadow");
    run();
    expect(document.documentElement.dataset.palette).toBe("meadow");
  });

  it("defaults to Royal", () => {
    run();
    expect(document.documentElement.dataset.palette).toBe("royal");
  });

  it("runs from the root document's inline boot script", () => {
    const root = fs.readFileSync(path.resolve(import.meta.dirname, "../routes/__root.tsx"), "utf8");
    expect(root).toContain("PALETTE_BOOT_SCRIPT");
  });
});
