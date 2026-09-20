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

  it("leaves the DOM untouched when the resolved theme matches the current one", () => {
    useTheme.getState().hydrateFromServer("meadow");
    expect(document.documentElement.dataset.theme).toBe("");
    expect(useTheme.getState().hydrated).toBe(true);
  });
});
