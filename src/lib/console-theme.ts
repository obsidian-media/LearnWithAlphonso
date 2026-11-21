/**
 * The console's day / night choice. Night is the app's own Royal Night palette (data-ds-mode="night" on <html>, the
 * same token set the learner app uses). The choice is kept on this device (localStorage "consoleTheme": "night" or
 * "day"); with nothing stored the page follows the OS. Storage can throw (private window, blocked site data), so every
 * read and write is wrapped: the page then simply follows the OS and forgets the choice.
 */
export type ConsoleTheme = "day" | "night";

export const THEME_KEY = "consoleTheme";
export const RAIL_KEY = "consoleRail";
const DARK_QUERY = "(prefers-color-scheme: dark)";

/** A stored value wins when it is one of the two words; anything else (missing, unknown) follows the OS. */
export function resolveConsoleTheme(stored: unknown, osDark: boolean): ConsoleTheme {
  if (stored === "night" || stored === "day") return stored;
  return osDark ? "night" : "day";
}

export function osIsDark(): boolean {
  try {
    return typeof window !== "undefined" && window.matchMedia?.(DARK_QUERY).matches === true;
  } catch {
    return false;
  }
}

export function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage denied: the choice lasts until the page closes */
  }
}

/** The theme to show now (client only). */
export function currentConsoleTheme(): ConsoleTheme {
  return resolveConsoleTheme(readStored(THEME_KEY), osIsDark());
}

/** Puts the theme on <html>. Day removes the night attribute so the light Royal tokens apply. */
export function applyConsoleTheme(root: HTMLElement, theme: ConsoleTheme): void {
  if (theme === "night") root.dataset.dsMode = "night";
  else delete root.dataset.dsMode;
  root.dataset.consoleTheme = theme;
}

/**
 * Runs inline in <head> before first paint, so there is no flash of the wrong theme. The same rule as
 * resolveConsoleTheme, written as a string; console-theme.test.ts runs it against the function.
 */
export const CONSOLE_THEME_BOOT_SCRIPT = `(function(){var d=document.documentElement,s=null;try{s=localStorage.getItem("${THEME_KEY}")}catch(e){}var n=s==="night";if(s!=="night"&&s!=="day"){try{n=window.matchMedia("${DARK_QUERY}").matches}catch(e){}}if(n)d.dataset.dsMode="night";d.dataset.consoleTheme=n?"night":"day";})();`;
