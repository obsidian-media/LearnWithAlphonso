import glyphEmoji from "../data/icon3d-achievements.json";
import mapping from "../data/icon3d.json";

const SLUGS = mapping as Record<string, string>;
const GLYPHS = glyphEmoji as Record<string, string>;

/** The 3D icon for an emoji, or null if the set has none. "⭐️" and "⭐" are the same icon. */
export function icon3dSlug(emoji: string): string | null {
  return SLUGS[emoji.replace(/️/g, "")] ?? null;
}

/** The emoji that stands for an achievement's glyph key ("flame" is 🔥), or null for an unknown key. */
export function achievementIconEmoji(glyph: string): string | null {
  return GLYPHS[glyph] ?? null;
}
