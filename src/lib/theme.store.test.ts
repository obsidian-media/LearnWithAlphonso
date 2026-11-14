// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const updateProfile = vi.fn().mockResolvedValue({ ok: true });
vi.mock("./leaderboard.functions", () => ({ updateProfile }));

const { useTheme } = await import("./theme");

beforeEach(() => {
  window.localStorage.clear();
  updateProfile.mockClear();
  useTheme.setState({ theme: "royal", hydrated: false });
  document.documentElement.dataset.palette = "";
});

afterEach(() => {
  useTheme.setState({ theme: "royal", hydrated: false });
});

describe("useTheme.setTheme", () => {
  it("updates the store, the DOM dataset, localStorage, and syncs the profile", () => {
    useTheme.getState().setTheme("meadow");
    expect(useTheme.getState().theme).toBe("meadow");
    expect(document.documentElement.dataset.palette).toBe("meadow");
    expect(window.localStorage.getItem("theme")).toBe("meadow");
    expect(updateProfile).toHaveBeenCalledWith({ data: { theme: "meadow" } });
  });
});

describe("useTheme.hydrateFromServer", () => {
  it("adopts the account theme when it differs from the current one", () => {
    useTheme.getState().hydrateFromServer("meadow");
    expect(useTheme.getState().theme).toBe("meadow");
    expect(useTheme.getState().hydrated).toBe(true);
    expect(document.documentElement.dataset.palette).toBe("meadow");
  });

  it.each(["studio-ink", "manuscript", "canopy"])(
    "moves a retired account value (%s) to Royal without an error",
    (name) => {
      window.localStorage.setItem("theme", "meadow");
      expect(() => useTheme.getState().hydrateFromServer(name)).not.toThrow();
      expect(useTheme.getState().theme).toBe("royal");
      expect(document.documentElement.dataset.palette).toBe("royal");
      expect(window.localStorage.getItem("theme")).toBe("royal");
    },
  );

  it("falls back to the device value when the account has none", () => {
    window.localStorage.setItem("theme", "meadow");
    useTheme.getState().hydrateFromServer(null);
    expect(useTheme.getState().theme).toBe("meadow");
  });

  it("always applies the resolved theme to the DOM, even when it matches the store guess", () => {
    useTheme.getState().hydrateFromServer("royal");
    expect(document.documentElement.dataset.palette).toBe("royal");
    expect(useTheme.getState().hydrated).toBe(true);
  });
});
