import { create } from "zustand";
import { updateProfile } from "./leaderboard.functions";

/**
 * The two themes: Royal navy and gold (the default) and Meadow green. A theme swaps the design system's --c-*
 * token values (src/styles/ds-tokens.generated.css reads data-palette on <html>). Royal has a light and a night
 * appearance; the night one is the data-ds-mode="night" token set. Mirrors the Kit's DSPaletteID and Android's
 * AlphonsoThemeId.
 *
 * Studio Ink, Manuscript and Canopy are gone. A stored value that is one of them (or anything unknown) means
 * Royal; nothing is shown to the learner and nothing errors.
 */
export const THEME_NAMES = ["royal", "meadow"] as const;
export type ThemeName = (typeof THEME_NAMES)[number];

export const DEFAULT_THEME: ThemeName = "royal";

export function isThemeName(value: unknown): value is ThemeName {
  return typeof value === "string" && (THEME_NAMES as readonly string[]).includes(value);
}

/** Any stored value to a theme: Meadow stays Meadow, everything else (retired, unknown, missing) is Royal. */
export function normalizeTheme(value: unknown): ThemeName {
  return value === "meadow" ? "meadow" : DEFAULT_THEME;
}

/**
 * A stored value on the account wins when there is one (a retired value on the account means Royal); otherwise
 * the value kept on this device; otherwise the default. Pure so it's testable without a DOM or a real
 * localStorage.
 */
export function resolveInitialTheme(localStorageValue: unknown, serverValue: unknown): ThemeName {
  if (typeof serverValue === "string") return normalizeTheme(serverValue);
  return normalizeTheme(localStorageValue);
}

/** Runs inline before first paint (src/routes/__root.tsx); the same rule as normalizeTheme. */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem("theme");document.documentElement.dataset.palette=t==="meadow"?"meadow":"royal";}catch(e){document.documentElement.dataset.palette="royal";}})();`;

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

export const useTheme = create<ThemeState>()((set) => ({
  theme: resolveInitialTheme(typeof window === "undefined" ? null : readLocalTheme(), null),
  hydrated: false,
  setTheme: (theme) => {
    if (typeof document !== "undefined") document.documentElement.dataset.palette = theme;
    writeLocalTheme(theme);
    set({ theme });
    void updateProfile({ data: { theme } });
  },
  hydrateFromServer: (serverValue) => {
    const resolved = resolveInitialTheme(readLocalTheme(), serverValue);
    // Always apply, even when it matches the store's own first guess: the guess and the page can disagree
    // (the store computes it the same way, but a retired value in localStorage must be rewritten to Royal).
    document.documentElement.dataset.palette = resolved;
    writeLocalTheme(resolved);
    set({ theme: resolved, hydrated: true });
  },
}));
