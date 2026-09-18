export const THEME_NAMES = ["meadow", "studio-ink"] as const;
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
  return "meadow";
}
