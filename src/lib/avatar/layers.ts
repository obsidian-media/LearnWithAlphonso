import manifest from "../../../public/avatar/manifest.json";
import type { EarSide } from "./idle";
import type { Brows } from "./lipsync";
import type { Viseme } from "./visemes";

/** A layer's place on the square canvas, as fractions of its side. */
export type LayerRect = { x: number; y: number; w: number; h: number };

/**
 * The art, served from this app's own origin (public/avatar), so the Content-Security-Policy's `img-src 'self'`
 * needs no change. The rects are read from the same manifest.json the iOS and Android apps bundle (a guard test
 * compares the three copies).
 */
export const AVATAR_BASE_PATH = "/avatar";

const rect = (name: keyof typeof manifest.layers): LayerRect => manifest.layers[name];

export const MOUTH_RECT = rect("mouth-ah");
export const BROWS_RECT = rect("brows-neutral");
export const EAR_RECTS: Record<EarSide, LayerRect> = {
  left: rect("ear-left-neutral"),
  right: rect("ear-right-neutral"),
};
export const GLINT_RECT = rect("glint-mask");

export const BASE_FILE = "base.webp";
export const GLINT_MASK_FILE = "glint-mask.webp";

/** null for a closed mouth: the base art already shows it. */
export function mouthFile(viseme: Viseme): string | null {
  return viseme === "closed" ? null : `mouth-${viseme}.webp`;
}

export function browsFile(brows: Brows): string {
  return `brows-${brows}.webp`;
}

/** The base has the ear areas removed, so exactly one ear layer per side is always drawn. */
export function earFile(side: EarSide, twitching: boolean): string {
  return `ear-${side}-${twitching ? "twitch" : "neutral"}.webp`;
}

export const MOUTH_SHAPES: readonly Exclude<Viseme, "closed">[] = [
  "half",
  "talk",
  "ah",
  "oh",
  "ee",
  "fv",
];
export const BROWS_STATES: readonly Brows[] = ["neutral", "raised", "lowered"];

export const ALL_FILE_NAMES: readonly string[] = [
  BASE_FILE,
  GLINT_MASK_FILE,
  ...MOUTH_SHAPES.map((s) => mouthFile(s)!),
  ...BROWS_STATES.map(browsFile),
  ...(["left", "right"] as const).flatMap((side) => [earFile(side, false), earFile(side, true)]),
];

/** "Show Alphonso while practising": same key and default as the iOS setting. */
export const AVATAR_PREFERENCE_KEY = "showAlphonsoWhilePractising";
export const AVATAR_PREFERENCE_DEFAULT = true;
