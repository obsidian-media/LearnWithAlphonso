import { create } from "zustand";

/**
 * The design system's palette (visual round 6, design/tokens.json): Royal navy and gold, the default, or Meadow
 * green. A palette swaps the --c-* token values only (src/styles/ds-tokens.generated.css reads data-palette on
 * <html>). Stored locally next to the theme ("theme" in localStorage); until a user picks one, it follows the old
 * theme: Meadow stays Meadow, Canopy, Studio Ink and Manuscript become Royal. Mirrors the Kit's DSPaletteID and
 * Android's AlphonsoPaletteId.
 */
export const PALETTE_NAMES = ["royal", "meadow"] as const;
export type PaletteName = (typeof PALETTE_NAMES)[number];

export function isPaletteName(value: unknown): value is PaletteName {
  return typeof value === "string" && (PALETTE_NAMES as readonly string[]).includes(value);
}

export function paletteForTheme(theme: unknown): PaletteName {
  return theme === "meadow" ? "meadow" : "royal";
}

export function resolveInitialPalette(stored: unknown, theme: unknown): PaletteName {
  return isPaletteName(stored) ? stored : paletteForTheme(theme);
}

/** Runs inline before first paint (src/routes/__root.tsx), the same rule as resolveInitialPalette. */
export const PALETTE_BOOT_SCRIPT = `(function(){try{var p=localStorage.getItem("palette");if(p!=="royal"&&p!=="meadow")p=localStorage.getItem("theme")==="meadow"?"meadow":"royal";document.documentElement.dataset.palette=p;}catch(e){}})();`;

function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

type PaletteState = { palette: PaletteName; setPalette: (palette: PaletteName) => void };

export const usePalette = create<PaletteState>()((set) => ({
  palette:
    typeof window === "undefined"
      ? "royal"
      : resolveInitialPalette(readLocal("palette"), readLocal("theme")),
  setPalette: (palette) => {
    if (typeof document !== "undefined") document.documentElement.dataset.palette = palette;
    try {
      localStorage.setItem("palette", palette);
    } catch {
      /* ignore (e.g. private browsing storage denial) */
    }
    set({ palette });
  },
}));
