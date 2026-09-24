// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const updateProfile = vi.fn().mockResolvedValue({ ok: true });
vi.mock("./leaderboard.functions", () => ({ updateProfile }));

const { useTheme } = await import("./theme");

beforeEach(() => {
  window.localStorage.clear();
  updateProfile.mockClear();
  useTheme.setState({ theme: "meadow", hydrated: false });
  document.documentElement.dataset.theme = "";
});

afterEach(() => {
  useTheme.setState({ theme: "meadow", hydrated: false });
});

describe("useTheme.setTheme", () => {
  it("updates the store, the DOM dataset, localStorage, and syncs the profile", () => {
    useTheme.getState().setTheme("studio-ink");
    expect(useTheme.getState().theme).toBe("studio-ink");
    expect(document.documentElement.dataset.theme).toBe("studio-ink");
    expect(window.localStorage.getItem("theme")).toBe("studio-ink");
    expect(updateProfile).toHaveBeenCalledWith({ data: { theme: "studio-ink" } });
  });
});

describe("useTheme.hydrateFromServer", () => {
  it("adopts the server theme when it differs from the current one", () => {
    useTheme.getState().hydrateFromServer("manuscript");
    expect(useTheme.getState().theme).toBe("manuscript");
    expect(useTheme.getState().hydrated).toBe(true);
    expect(document.documentElement.dataset.theme).toBe("manuscript");
  });

  it("falls back to localStorage when the server value is invalid", () => {
    window.localStorage.setItem("theme", "studio-ink");
    useTheme.getState().hydrateFromServer(null);
    expect(useTheme.getState().theme).toBe("studio-ink");
  });

  it("still applies the resolved theme to the DOM even when it matches the store's current guess", () => {
    // Regression: the store's initial `theme` is itself a *guess*
    // (resolveInitialTheme run at module-init, before any DOM write
    // happens) -- for a brand-new visitor that guess is "canopy" with
    // nothing yet applied to the DOM. A guard that skipped writing
    // whenever `resolved === get().theme` treated "the guess agrees
    // with itself" as "the DOM already reflects it", which isn't true
    // the first time hydrateFromServer runs. Always applying is what
    // fixes that, at the (harmless) cost of a redundant write on the
    // one path where the DOM genuinely already matches.
    useTheme.getState().hydrateFromServer("meadow");
    expect(document.documentElement.dataset.theme).toBe("meadow");
    expect(useTheme.getState().hydrated).toBe(true);
  });
});
