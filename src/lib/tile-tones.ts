import tokens from "../design-tokens/tile-tones.json";

export type TileTone = "coral" | "sky" | "sun" | "lilac" | "mint";

export const TILE_TONES = tokens.tones as TileTone[];

/** Background plus matching ink for each tone. Full class names, so Tailwind finds them. */
export const TILE_TONE_CLASSES: Record<TileTone, string> = {
  coral: "bg-tile-coral-bg text-tile-coral-ink",
  sky: "bg-tile-sky-bg text-tile-sky-ink",
  sun: "bg-tile-sun-bg text-tile-sun-ink",
  lilac: "bg-tile-lilac-bg text-tile-lilac-ink",
  mint: "bg-tile-mint-bg text-tile-mint-ink",
};

/** The tile colour for the item at this position in a list: the five tones in turn. */
export function tileTone(index: number): TileTone {
  const i = Number.isFinite(index) && index > 0 ? Math.floor(index) : 0;
  return TILE_TONES[i % TILE_TONES.length];
}
