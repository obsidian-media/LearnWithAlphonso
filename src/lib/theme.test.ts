import { describe, expect, it } from "vitest";
import { isThemeName, resolveInitialTheme, THEME_NAMES } from "./theme";

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
