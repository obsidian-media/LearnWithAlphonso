// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { isThemeName, resolveInitialTheme, THEME_NAMES, useTheme } from "./theme";

describe("isThemeName", () => {
  it("accepts every value in THEME_NAMES", () => {
    for (const name of THEME_NAMES) {
      expect(isThemeName(name)).toBe(true);
    }
  });

  it("rejects unknown strings", () => {
    expect(isThemeName("solarized")).toBe(false);
  });

  it("rejects non-strings", () => {
    expect(isThemeName(null)).toBe(false);
    expect(isThemeName(undefined)).toBe(false);
    expect(isThemeName(42)).toBe(false);
  });
});

describe("resolveInitialTheme", () => {
  it("prefers a valid server value over localStorage", () => {
    expect(resolveInitialTheme("meadow", "studio-ink")).toBe("studio-ink");
  });

  it("falls back to localStorage when the server value is invalid", () => {
    expect(resolveInitialTheme("studio-ink", null)).toBe("studio-ink");
    expect(resolveInitialTheme("studio-ink", "not-a-theme")).toBe("studio-ink");
  });

  it("falls back to the canopy default when both are invalid or missing", () => {
    expect(resolveInitialTheme(null, null)).toBe("canopy");
    expect(resolveInitialTheme("garbage", undefined)).toBe("canopy");
  });
});

describe("canopy", () => {
  it("is a valid web theme name", () => {
    expect(isThemeName("canopy")).toBe(true);
  });

  it("is preferred over localStorage when the server reports it", () => {
    expect(resolveInitialTheme("meadow", "canopy")).toBe("canopy");
  });

  it("is used as localStorage's fallback when the server value is invalid", () => {
    expect(resolveInitialTheme("canopy", null)).toBe("canopy");
  });
});

describe("hydrateFromServer applying the resolved theme to the DOM", () => {
  afterEach(() => {
    delete document.documentElement.dataset.theme;
    localStorage.clear();
  });

  it("sets data-theme on the document for a brand-new user (no localStorage, no server value)", () => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
    // Simulates what module-init already computed for a fresh visitor:
    // resolveInitialTheme(null, null) === "canopy", but nothing has yet
    // written that to the DOM (the real bug: the inline flash-prevention
    // script only ever writes studio-ink/manuscript/canopy when
    // localStorage already HAS one of those strings).
    useTheme.setState({ theme: "canopy", hydrated: false });

    useTheme.getState().hydrateFromServer(null);

    expect(document.documentElement.dataset.theme).toBe("canopy");
  });
});
