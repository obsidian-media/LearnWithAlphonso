import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import tokens from "../../design/tokens.json";
import tileTokens from "../design-tokens/tile-tones.json";
import {
  renderCss as renderTileCss,
  renderSwift as renderTileSwift,
} from "../../scripts/export-design-tokens";
import {
  assertNoMeadowNight,
  loadDesignSource,
  renderAll,
  renderCss,
  renderKotlin,
  renderSwift,
  type DesignSource,
} from "./design-system-export";
import { DS_TOKENS } from "../design/tokens.generated";
import { resolveDsLook } from "./theme";

/**
 * Owner decision 2026-11-14: "Royal (light and night) plus Meadow only" and "Meadow stays light, even in dark
 * mode". The app has exactly three looks: Royal light, Royal night and Meadow (light). A Meadow night (dark green)
 * must not exist in the sources, the generated files or the generators, and every platform resolves Meadow to its
 * light look whatever the device says.
 */
const root = path.resolve(import.meta.dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8").replace(/\r\n/g, "\n");
const palettes = tokens.palettes as unknown as Record<
  string,
  Record<string, Record<string, string>>
>;

const GENERATED = [
  "src/styles/ds-tokens.generated.css",
  "src/design/tokens.generated.ts",
  "src/styles/tile-tones.generated.css",
  "ios/LearnWithAlphonso/Sources/DesignSystem/AlphonsoDS.generated.swift",
  "ios/LearnWithAlphonso/Sources/DesignSystem/AlphonsoTileTones.generated.swift",
  "android/LearnWithAlphonso/app/src/main/java/com/obsidianmedia/learnwithalphonso/ui/theme/AlphonsoTokens.kt",
];

describe("no Meadow night in the sources", () => {
  it("design/tokens.json has Meadow light and nothing else", () => {
    expect(Object.keys(palettes.meadow)).toEqual(["light"]);
    expect(JSON.stringify(palettes.meadow)).not.toMatch(/night|dark/i);
  });

  it("tile-tones.json has no Meadow dark set", () => {
    expect(Object.keys(tileTokens.palettes).sort()).toEqual(["meadow", "royal", "royal-dark"]);
  });
});

describe("no Meadow night in any generated file", () => {
  it.each(GENERATED)("%s", (rel) => {
    const text = read(rel);
    expect(text).not.toMatch(/meadowNight/);
    expect(text).not.toMatch(/meadow-dark/);
    expect(text).not.toMatch(/data-palette="meadow"\]\[data-ds-mode/);
    expect(text).not.toMatch(/\.meadow, true\)|\(\.meadow, true/);
    expect(text).not.toMatch(/MEADOW -> if \(night\)/);
  });

  it("the web token table (DS_TOKENS) has Meadow light only", () => {
    expect(Object.keys(DS_TOKENS.palettes.meadow)).toEqual(["light"]);
    expect(Object.keys(DS_TOKENS.palettes.royal)).toEqual(["light", "night"]);
  });

  it("the generated resolvers send Meadow to meadowLight for any night flag", () => {
    expect(read(GENERATED[3])).toContain("case (.meadow, _): return meadowLight");
    expect(read(GENERATED[5])).toContain("AlphonsoPaletteId.MEADOW -> meadowLight");
    expect(read(GENERATED[3])).toContain("case (.royal, true): return royalNight");
    expect(read(GENERATED[5])).toContain(
      "AlphonsoPaletteId.ROYAL -> if (night) royalNight else royalLight",
    );
  });
});

describe("the generators cannot emit a Meadow night", () => {
  const source = loadDesignSource(root);
  const withNight = (): DesignSource => ({
    ...source,
    tokens: {
      ...source.tokens,
      palettes: {
        ...source.tokens.palettes,
        meadow: {
          light: source.tokens.palettes.meadow.light,
          night: source.tokens.palettes.royal.night,
        },
      } as DesignSource["tokens"]["palettes"],
    },
  });

  it("each renderer throws instead of writing one", () => {
    for (const render of [renderCss, renderSwift, renderKotlin, renderAll]) {
      expect(() => render(withNight())).toThrow(/Meadow has no night/);
    }
    expect(() => assertNoMeadowNight(withNight().tokens)).toThrow();
    expect(() => assertNoMeadowNight(source.tokens)).not.toThrow();
  });

  it("the tile-tone renderers throw on a meadow-dark set, and accept the real file", () => {
    const bad = {
      ...tileTokens,
      palettes: { ...tileTokens.palettes, "meadow-dark": tileTokens.palettes["royal-dark"] },
    };
    expect(() => renderTileCss(bad)).toThrow(/Meadow has no night/);
    expect(() => renderTileSwift(bad)).toThrow(/Meadow has no night/);
    expect(() => renderTileCss(tileTokens)).not.toThrow();
  });
});

describe("web: Meadow ignores night mode", () => {
  // What the generator writes now, and what is committed: both must skip Meadow in night mode.
  const sheets = {
    "the generator's output": renderCss(loadDesignSource(root)),
    "the committed file": read("src/styles/ds-tokens.generated.css"),
  };

  it.each(Object.entries(sheets))(
    "every selector in %s that mentions night mode skips Meadow",
    (_, css) => {
      const selectors = [...css.matchAll(/^([^{}\n]+) \{$/gm)].map((m) => m[1]);
      const night = selectors.filter((s) => s.includes('data-ds-mode="night"'));
      expect(night.length).toBeGreaterThanOrEqual(2);
      for (const s of night) expect(s, s).toContain(':not([data-palette="meadow"])');
    },
  );

  it("resolveDsLook: Meadow on a dark device is Meadow light; Royal keeps light and night", () => {
    expect(resolveDsLook("meadow", true)).toEqual({ palette: "meadow", mode: "light" });
    expect(resolveDsLook("meadow", false)).toEqual({ palette: "meadow", mode: "light" });
    expect(resolveDsLook("royal", true)).toEqual({ palette: "royal", mode: "night" });
    expect(resolveDsLook("royal", false)).toEqual({ palette: "royal", mode: "light" });
  });

  it("the colours the resolved looks read are the right ones", () => {
    const colours = (nightRequested: boolean, theme: "royal" | "meadow") => {
      const { palette, mode } = resolveDsLook(theme, nightRequested);
      return palettes[palette][mode];
    };
    expect(colours(true, "meadow")).toBe(palettes.meadow.light);
    expect(colours(true, "royal")).toBe(palettes.royal.night);
    expect(colours(false, "royal")).toBe(palettes.royal.light);
    // Meadow light is a light surface; a dark device must not give the dark green it once did.
    expect(colours(true, "meadow").surface).toBe("#F5F0E8");
  });
});

describe("iOS: Meadow forces the light appearance", () => {
  const kit = read("ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/DSPalette.swift");
  const theme = read("ios/LearnWithAlphonso/Sources/DesignSystem/AlphonsoTheme.swift");
  const rootView = read("ios/LearnWithAlphonso/Sources/RootView.swift");
  const env = read("ios/LearnWithAlphonso/Sources/DesignSystem/AlphonsoDSEnvironment.swift");
  const kitTest = read(
    "ios/LearnWithAlphonsoKit/Tests/LearnWithAlphonsoKitTests/DSPaletteTests.swift",
  );

  it("the Kit rule is Royal-only, and its tests pin Meadow on a dark device", () => {
    expect(kit).toContain("self == .royal && deviceDark");
    expect(kitTest).toContain("DSPaletteID.meadow.usesNight(deviceDark: true))");
    expect(kitTest).toContain("DSPaletteID.meadow.appearance(deviceDark: true), .light)");
    expect(kitTest).toContain("DSPaletteID.royal.appearance(deviceDark: true), .dark)");
  });

  it("the root applies the forced scheme, derived from the Kit rule", () => {
    expect(rootView).toContain(
      ".preferredColorScheme(AlphonsoThemeManager.shared.preferredColorScheme)",
    );
    expect(theme).toContain(
      "paletteID.appearance(deviceDark: systemColorScheme == .dark) == .dark ? .dark : .light",
    );
  });

  it("the palette, the design system colours and the tile tones all read the one night rule", () => {
    expect(theme).toContain("paletteID.usesNight(deviceDark: systemColorScheme == .dark)");
    expect(theme).toMatch(/public var palette: AlphonsoPalette \{\s*if isNight \{/);
    expect(env).toContain("night: manager.isNight)");
    expect(read(GENERATED[4])).toContain('(manager.isNight ? "-dark" : "")');
  });

  it("the legacy night palettes have no Meadow entry, and scenes do not dim for it", () => {
    const dark = theme.slice(theme.indexOf("static let dark: [AlphonsoThemeID: AlphonsoPalette]"));
    expect(dark).not.toContain(".meadow:");
    expect(dark).toContain(".royal: AlphonsoPalette(");
    expect(read("ios/LearnWithAlphonso/Sources/DesignSystem/ScreenScene.swift")).toContain(
      "AlphonsoThemeManager.shared.paletteID.usesNight(deviceDark: colorScheme == .dark)",
    );
    expect(read("ios/LearnWithAlphonso/Sources/PracticeCallView.swift")).toContain(
      "AlphonsoThemeManager.shared.paletteID.usesNight(deviceDark: colorScheme == .dark)",
    );
  });
});

describe("Android: Meadow is a light Material scheme with light system bars", () => {
  const dir = "android/LearnWithAlphonso/app/src/main/java/com/obsidianmedia/learnwithalphonso";
  const palette = read(`${dir}/ui/theme/AlphonsoPalette.kt`);
  const main = read(`${dir}/MainActivity.kt`);
  const theme = read(`${dir}/ui/theme/AlphonsoTheme.kt`);

  it("the night palettes have no Meadow entry; the night rule is Royal-only", () => {
    const dark = palette.slice(palette.indexOf("val dark:"), palette.indexOf("fun usesNight"));
    expect(dark).not.toContain("MEADOW");
    expect(dark).toContain("AlphonsoThemeId.ROYAL to");
    expect(palette).toContain("themeId == AlphonsoThemeId.ROYAL && systemDark");
    expect(palette).toContain("if (usesNight(themeId, systemDark))");
  });

  it("the theme reads the resolved palette, so a light palette gets the light Material scheme", () => {
    expect(theme).toContain("val palette = AlphonsoPalettes.resolve(themeId, systemDark)");
    expect(theme).toContain("if (p.isDark) darkColorScheme() else lightColorScheme()");
  });

  it("the activity holds Meadow's system bars light", () => {
    expect(main).toContain("AlphonsoPalettes.systemBars(themeId) == SystemBars.LIGHT");
    expect(main).toContain("SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT)");
  });
});
