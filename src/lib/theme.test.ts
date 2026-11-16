// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  applyLook,
  DARK_QUERY,
  deviceIsDark,
  watchDeviceMode,
  DEFAULT_THEME,
  isThemeName,
  normalizeTheme,
  resolveInitialTheme,
  THEME_BOOT_SCRIPT,
  THEME_NAMES,
  useTheme,
} from "./theme";

const RETIRED = ["studio-ink", "manuscript", "canopy"];

describe("the web follows the device's dark mode in Royal", () => {
  const root = () => document.createElement("html");

  it("applyLook gives Royal night on a dark device, light otherwise, and Meadow never night", () => {
    const a = root();
    expect(applyLook(a, "royal", true)).toEqual({ palette: "royal", mode: "night" });
    expect(a.dataset.palette).toBe("royal");
    expect(a.dataset.dsMode).toBe("night");
    applyLook(a, "royal", false);
    expect(a.dataset.dsMode).toBeUndefined();
    const m = root();
    m.dataset.dsMode = "night";
    expect(applyLook(m, "meadow", true)).toEqual({ palette: "meadow", mode: "light" });
    expect(m.dataset.palette).toBe("meadow");
    expect(m.dataset.dsMode).toBeUndefined();
  });

  it("deviceIsDark reads the dark query, and is false when the browser cannot say", () => {
    const asked: string[] = [];
    const win = {
      matchMedia: (q: string) => {
        asked.push(q);
        return { matches: true };
      },
    };
    expect(deviceIsDark(win)).toBe(true);
    expect(asked).toEqual([DARK_QUERY]);
    expect(deviceIsDark({ matchMedia: () => ({ matches: false }) })).toBe(false);
    expect(deviceIsDark({})).toBe(false);
    expect(deviceIsDark(undefined)).toBe(false);
    expect(
      deviceIsDark({
        matchMedia: () => {
          throw new Error("no");
        },
      }),
    ).toBe(false);
  });

  it("watchDeviceMode re-applies the look when the device changes, reading the theme at that moment, and stops on cleanup", () => {
    const r = root();
    let handler: (() => void) | undefined;
    const list = {
      matches: false,
      addEventListener: (_: string, h: () => void) => {
        handler = h;
      },
      removeEventListener: (_: string, h: () => void) => {
        if (handler === h) handler = undefined;
      },
    };
    let theme: "royal" | "meadow" = "royal";
    const stop = watchDeviceMode(r, () => theme, {
      matchMedia: () => list as unknown as MediaQueryList,
    });
    list.matches = true;
    handler!();
    expect(r.dataset.dsMode).toBe("night");
    theme = "meadow";
    handler!();
    expect(r.dataset.palette).toBe("meadow");
    expect(r.dataset.dsMode).toBeUndefined();
    stop();
    expect(handler).toBeUndefined();
  });

  it("does nothing, and does not throw, where matchMedia does not exist", () => {
    expect(() => watchDeviceMode(root(), () => "royal", {})()).not.toThrow();
  });
});

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
