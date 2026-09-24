import { create } from "zustand";
import { updateProfile } from "./leaderboard.functions";

export const THEME_NAMES = ["meadow", "studio-ink", "manuscript", "canopy"] as const;
export type ThemeName = (typeof THEME_NAMES)[number];

export function isThemeName(value: unknown): value is ThemeName {
  return typeof value === "string" && (THEME_NAMES as readonly string[]).includes(value);
}

/**
 * Server value wins when present and valid; otherwise fall back to
 * localStorage; otherwise the default. Pure so it's testable without a
 * DOM or a real localStorage.
 */
export function resolveInitialTheme(localStorageValue: unknown, serverValue: unknown): ThemeName {
  if (isThemeName(serverValue)) return serverValue;
  if (isThemeName(localStorageValue)) return localStorageValue;
  return "canopy";
}

type ThemeState = {
  theme: ThemeName;
  hydrated: boolean;
  setTheme: (theme: ThemeName) => void;
  hydrateFromServer: (serverValue: unknown) => void;
};

function readLocalTheme(): string | null {
  try {
    return localStorage.getItem("theme");
  } catch {
    return null;
  }
}

function writeLocalTheme(theme: ThemeName) {
  try {
    localStorage.setItem("theme", theme);
  } catch {
    /* ignore (e.g. private browsing storage denial) */
  }
}

export const useTheme = create<ThemeState>()((set, get) => ({
  theme: resolveInitialTheme(typeof window === "undefined" ? null : readLocalTheme(), null),
  hydrated: false,
  setTheme: (theme) => {
    if (typeof document !== "undefined") document.documentElement.dataset.theme = theme;
    writeLocalTheme(theme);
    set({ theme });
    void updateProfile({ data: { theme } });
  },
  hydrateFromServer: (serverValue) => {
    const resolved = resolveInitialTheme(readLocalTheme(), serverValue);
    // Always apply, not just when it differs from the store's own
    // current guess -- the store's initial `theme` (line above) is
    // computed the same way, so for a brand-new visitor (no
    // localStorage) both already agree on "canopy" before this ever
    // runs, and a guard here would skip writing it to the DOM/
    // localStorage entirely, leaving the page rendered against
    // :root (Meadow) while the store silently disagrees.
    document.documentElement.dataset.theme = resolved;
    writeLocalTheme(resolved);
    set({ theme: resolved, hydrated: true });
  },
}));
