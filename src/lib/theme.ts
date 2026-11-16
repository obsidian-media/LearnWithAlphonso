import { create } from "zustand";
import { updateProfile } from "./leaderboard.functions";

/**
 * The two themes: Royal navy and gold (the default) and Meadow green. A theme swaps the design system's --c-*
 * token values (src/styles/ds-tokens.generated.css reads data-palette on <html>). Royal has a light and a night
 * appearance; the night one is the data-ds-mode="night" token set. Meadow has only a light one: it stays light,
 * even in night mode (owner decision 2026-11-14). Mirrors the Kit's DSPaletteID and Android's
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

/** One of the three looks the app has: Royal light, Royal night, Meadow (light). */
export type DsLook = { palette: ThemeName; mode: "light" | "night" };

/**
 * The look a theme shows when night mode is asked for (or the device is dark). Royal follows it; Meadow is always
 * its light look, so there is no Meadow night anywhere. The same rule as the Kit's DSPaletteID.usesNight and
 * Android's AlphonsoPalettes.usesNight.
 */
export function resolveDsLook(theme: ThemeName, nightRequested: boolean): DsLook {
  return { palette: theme, mode: theme === "royal" && nightRequested ? "night" : "light" };
}

/** The browser's dark-mode query: the web has no night switch, Royal follows the device. */
export const DARK_QUERY = "(prefers-color-scheme: dark)";

type MediaSource = { matchMedia?: (query: string) => { matches: boolean } };

/** Whether the device is in dark mode. False where the browser cannot say (server, old browser): the safe light side. */
export function deviceIsDark(
  win: MediaSource | undefined = typeof window === "undefined" ? undefined : window,
): boolean {
  try {
    return win?.matchMedia?.(DARK_QUERY).matches === true;
  } catch {
    return false;
  }
}

/**
 * Sets the look on <html>: the palette, and night (data-ds-mode) only when the theme is Royal and the device is dark.
 * Meadow always loses it, so Meadow stays light even in dark mode. Returns the look it applied.
 */
export function applyLook(root: HTMLElement, theme: ThemeName, deviceDark: boolean): DsLook {
  const look = resolveDsLook(theme, deviceDark);
  root.dataset.palette = look.palette;
  if (look.mode === "night") root.dataset.dsMode = "night";
  else delete root.dataset.dsMode;
  return look;
}

/**
 * Re-applies the look when the device switches between light and dark while the page is open. `theme` is read at the
 * time of each change. Returns the function that stops listening.
 */
export function watchDeviceMode(
  root: HTMLElement,
  theme: () => ThemeName,
  win: { matchMedia?: (query: string) => MediaQueryList } | undefined = typeof window ===
  "undefined"
    ? undefined
    : window,
): () => void {
  const list = win?.matchMedia?.(DARK_QUERY);
  if (!list) return () => {};
  const onChange = () => applyLook(root, theme(), list.matches);
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

/** Sets the palette on <html>; Meadow also drops any night mode the page was given, so it stays light. */
export function applyPalette(root: HTMLElement, theme: ThemeName): void {
  root.dataset.palette = theme;
  if (theme === "meadow") delete root.dataset.dsMode;
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
export const THEME_BOOT_SCRIPT = `(function(){var d=document.documentElement;try{var t=localStorage.getItem("theme");d.dataset.palette=t==="meadow"?"meadow":"royal";}catch(e){d.dataset.palette="royal";}try{if(d.dataset.palette==="royal"&&window.matchMedia("${"(prefers-color-scheme: dark)"}").matches)d.dataset.dsMode="night";}catch(e){}})();`;

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
    if (typeof document !== "undefined") applyLook(document.documentElement, theme, deviceIsDark());
    writeLocalTheme(theme);
    set({ theme });
    void updateProfile({ data: { theme } });
  },
  hydrateFromServer: (serverValue) => {
    const resolved = resolveInitialTheme(readLocalTheme(), serverValue);
    // Always apply, even when it matches the store's own first guess: the guess and the page can disagree
    // (the store computes it the same way, but a retired value in localStorage must be rewritten to Royal).
    applyLook(document.documentElement, resolved, deviceIsDark());
    writeLocalTheme(resolved);
    set({ theme: resolved, hydrated: true });
  },
}));

// The web has no night switch: Royal follows the device, live. Started once, in the browser only; Meadow ignores it.
if (typeof window !== "undefined") {
  watchDeviceMode(document.documentElement, () => useTheme.getState().theme);
}
