// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CONSOLE_THEME_BOOT_SCRIPT,
  THEME_KEY,
  applyConsoleTheme,
  readStored,
  resolveConsoleTheme,
  writeStored,
} from "./console-theme";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  delete document.documentElement.dataset.dsMode;
  delete document.documentElement.dataset.consoleTheme;
});

describe("resolveConsoleTheme", () => {
  it("a stored choice wins over the OS, both ways", () => {
    expect(resolveConsoleTheme("night", false)).toBe("night");
    expect(resolveConsoleTheme("day", true)).toBe("day");
  });
  it("with nothing (or junk) stored it follows the OS", () => {
    expect(resolveConsoleTheme(null, true)).toBe("night");
    expect(resolveConsoleTheme(null, false)).toBe("day");
    expect(resolveConsoleTheme("purple", true)).toBe("night");
  });
});

describe("storage that throws", () => {
  it("reads as nothing and writes silently", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(readStored(THEME_KEY)).toBeNull();
    expect(() => writeStored(THEME_KEY, "night")).not.toThrow();
  });
});

describe("applyConsoleTheme", () => {
  it("night sets the app's Royal Night attribute; day removes it", () => {
    applyConsoleTheme(document.documentElement, "night");
    expect(document.documentElement.dataset.dsMode).toBe("night");
    applyConsoleTheme(document.documentElement, "day");
    expect(document.documentElement.dataset.dsMode).toBeUndefined();
  });
});

describe("the inline boot script agrees with resolveConsoleTheme", () => {
  const run = (stored: string | null, osDark: boolean, storageThrows = false) => {
    delete document.documentElement.dataset.dsMode;
    delete document.documentElement.dataset.consoleTheme;
    if (stored !== null) localStorage.setItem(THEME_KEY, stored);
    window.matchMedia = vi.fn(() => ({ matches: osDark })) as unknown as typeof window.matchMedia;
    if (storageThrows) {
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("denied");
      });
    }
    new Function(CONSOLE_THEME_BOOT_SCRIPT)();
    const out = document.documentElement.dataset.consoleTheme;
    vi.restoreAllMocks();
    // @ts-expect-error jsdom has no matchMedia; remove the stand-in
    delete window.matchMedia;
    localStorage.clear();
    return out;
  };
  it.each([
    ["night", false],
    ["day", true],
    [null, true],
    [null, false],
    ["junk", true],
  ] as const)("stored %s, OS dark %s", (stored, osDark) => {
    expect(run(stored, osDark)).toBe(resolveConsoleTheme(stored, osDark));
  });
  it("sets the night attribute when it picks night", () => {
    run("night", false);
    expect(document.documentElement.dataset.dsMode).toBe("night");
  });
  it("when localStorage throws it follows the OS", () => {
    expect(run(null, true, true)).toBe("night");
    expect(run(null, false, true)).toBe("day");
  });
});
