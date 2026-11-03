import tokens from "../design-tokens/tile-tones.json";

export type TileTone = "coral" | "sky" | "sun" | "lilac" | "mint";

export const TILE_TONES = tokens.tones as TileTone[];

/** The tile colour for the item at this position in a list: the five tones in turn. */
export function tileTone(index: number): TileTone {
  const i = Number.isFinite(index) && index > 0 ? Math.floor(index) : 0;
  return TILE_TONES[i % TILE_TONES.length];
}
