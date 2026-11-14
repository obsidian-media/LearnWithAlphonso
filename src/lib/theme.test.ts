// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_THEME,
  isThemeName,
  normalizeTheme,
  resolveInitialTheme,
  THEME_BOOT_SCRIPT,
  THEME_NAMES,
  useTheme,
} from "./theme";

const RETIRED = ["studio-ink", "manuscript", "canopy"];

describe("the two themes", () => {
  it("are Royal and Meadow, and Royal is the default", () => {
    expect([...THEME_NAMES]).toEqual(["royal", "meadow"]);
    expect(DEFAULT_THEME).toBe("royal");
  });

  it("isThemeName accepts exactly those two", () => {
    for (const name of THEME_NAMES) expect(isThemeName(name)).toBe(true);
    for (const name of [...RETIRED, "solarized", "", null, undefined, 42]) {
      expect(isThemeName(name)).toBe(false);
    }
  });
});

describe("normalizeTheme", () => {
  it("keeps Meadow and Royal", () => {
    expect(normalizeTheme("meadow")).toBe("meadow");
    expect(normalizeTheme("royal")).toBe("royal");
  });

  it.each(RETIRED)("moves the retired theme %s to Royal", (name) => {
    expect(normalizeTheme(name)).toBe("royal");
  });

  it("sends unknown, missing and non-string values to Royal", () => {
    for (const v of ["solarized", "", null, undefined, 42, {}]) {
      expect(normalizeTheme(v)).toBe("royal");
    }
  });
});

describe("resolveInitialTheme", () => {
  it("prefers the account value over the device value", () => {
    expect(resolveInitialTheme("royal", "meadow")).toBe("meadow");
    expect(resolveInitialTheme("meadow", "royal")).toBe("royal");
  });

  it("reads a retired value on the account as Royal, not as the device value", () => {
    for (const name of RETIRED) expect(resolveInitialTheme("meadow", name)).toBe("royal");
  });

  it("falls back to the device when the account has none", () => {
    expect(resolveInitialTheme("meadow", null)).toBe("meadow");
    expect(resolveInitialTheme("meadow", undefined)).toBe("meadow");
  });

  it("reads a retired value on the device as Royal", () => {
    for (const name of RETIRED) expect(resolveInitialTheme(name, null)).toBe("royal");
  });

  it("is Royal when both are missing", () => {
    expect(resolveInitialTheme(null, null)).toBe("royal");
    expect(resolveInitialTheme("garbage", undefined)).toBe("royal");
  });
});

describe("the boot script agrees with normalizeTheme", () => {
  afterEach(() => {
    delete document.documentElement.dataset.palette;
    localStorage.clear();
  });

  it.each(["meadow", "royal", ...RETIRED, "garbage", null])("for the stored value %s", (stored) => {
    if (stored === null) localStorage.removeItem("theme");
    else localStorage.setItem("theme", stored);
    new Function(THEME_BOOT_SCRIPT)();
    expect(document.documentElement.dataset.palette).toBe(normalizeTheme(stored));
  });
});

describe("hydrateFromServer applying the resolved theme to the DOM", () => {
  afterEach(() => {
    delete document.documentElement.dataset.palette;
    localStorage.clear();
  });

  it("sets data-palette for a brand-new user (no localStorage, no server value)", () => {
    useTheme.setState({ theme: "royal", hydrated: false });
    useTheme.getState().hydrateFromServer(null);
    expect(document.documentElement.dataset.palette).toBe("royal");
  });

  it("rewrites a retired value kept on the device to Royal", () => {
    localStorage.setItem("theme", "studio-ink");
    useTheme.getState().hydrateFromServer(null);
    expect(localStorage.getItem("theme")).toBe("royal");
    expect(document.documentElement.dataset.palette).toBe("royal");
  });
});
