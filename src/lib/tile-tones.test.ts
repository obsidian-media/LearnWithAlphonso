import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import tokens from "../design-tokens/tile-tones.json";
import { renderCss, renderSwift } from "../../scripts/export-design-tokens";
import { TILE_TONES, tileTone } from "./tile-tones";

// WCAG 2.x relative luminance contrast ratio.
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

type Tones = Record<string, Record<string, { bg: string; ink: string }>>;
const pals = tokens.palettes as unknown as Tones;

const PALETTES = [
  "meadow",
  "meadow-dark",
  "canopy",
  "canopy-dark",
  "manuscript",
  "manuscript-dark",
  "studio-ink",
] as const;

describe("tile tones", () => {
  it("all seven palettes and five tones exist", () => {
    expect(tokens.tones).toEqual(["coral", "sky", "sun", "lilac", "mint"]);
    expect(Object.keys(tokens.palettes).sort()).toEqual([...PALETTES].sort());
    for (const p of PALETTES) {
      for (const t of tokens.tones) {
        const tone = pals[p][t];
        expect(tone.bg, `${p}.${t}.bg`).toMatch(/^#[0-9a-f]{6}$/);
        expect(tone.ink, `${p}.${t}.ink`).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it("every tone's ink reads on its bg at 4.5:1 or more in every palette", () => {
    for (const p of PALETTES) {
      const pal = pals[p];
      for (const t of tokens.tones) {
        expect(contrast(pal[t].ink, pal[t].bg), `${p}.${t}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("tile bg is distinguishable from the surface", () => {
    for (const p of PALETTES) {
      const pal = tokens.palettes[p] as unknown as Record<string, { bg: string }> & {
        surface: string;
      };
      for (const t of tokens.tones) {
        expect(contrast(pal[t].bg, pal.surface), `${p}.${t}`).toBeGreaterThanOrEqual(1.15);
      }
    }
  });

  it("button edges are darker than nothing: valid hex for moss and ember", () => {
    for (const p of PALETTES) {
      expect(tokens.palettes[p].edge.moss).toMatch(/^#[0-9a-f]{6}$/);
      expect(tokens.palettes[p].edge.ember).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("generated CSS and Swift are up to date", () => {
    const css = readFileSync(
      new URL("../styles/tile-tones.generated.css", import.meta.url),
      "utf8",
    );
    const swift = readFileSync(
      new URL(
        "../../ios/LearnWithAlphonso/Sources/DesignSystem/AlphonsoTileTones.generated.swift",
        import.meta.url,
      ),
      "utf8",
    );
    expect(css).toBe(renderCss(tokens));
    expect(swift).toBe(renderSwift(tokens));
  });

  it("styles.css imports the generated tile tones", () => {
    const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
    expect(styles).toContain('@import "./styles/tile-tones.generated.css";');
    expect(styles).toContain("--color-tile-coral-bg: var(--tile-coral-bg);");
  });

  it("tileTone cycles through the five tones by list position", () => {
    expect(TILE_TONES).toEqual(tokens.tones);
    expect(tileTone(0)).toBe("coral");
    expect(tileTone(4)).toBe("mint");
    expect(tileTone(5)).toBe("coral");
    expect(tileTone(7)).toBe("sun");
    expect(tileTone(-1)).toBe("coral");
  });
});
