import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { THEME_NAMES } from "./theme";

// Two themes, Royal and Meadow, on every platform. The web logic is tested in theme.test.ts, the Kit's in
// DSPaletteTests.swift and Android's in AlphonsoPaletteIdTest.kt; this file pins what those cannot see: that the
// platforms agree on the names, that no picker or token set for a removed theme is left, and what the migration
// does to the database column.
const root = path.resolve(__dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

function walk(dir: string, ext: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (["build", ".gradle", "node_modules", ".build"].includes(entry.name)) continue;
      walk(rel, ext, out);
    } else if (entry.name.endsWith(ext)) out.push(rel);
  }
  return out;
}

const stripSwiftComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const stripKotlinComments = stripSwiftComments;

describe("the platforms agree on two themes", () => {
  it("web: royal then meadow", () => {
    expect([...THEME_NAMES]).toEqual(["royal", "meadow"]);
  });

  it("iOS Kit: DSPaletteID has exactly royal and meadow", () => {
    const kit = stripSwiftComments(
      read("ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/DSPalette.swift"),
    );
    const cases = [...kit.matchAll(/^\s*case (\w+)\s*$/gm)].map((m) => m[1]);
    expect(cases).toEqual(["royal", "meadow"]);
  });

  it("iOS app: AlphonsoThemeID has exactly royal and meadow, and the picker lists every case", () => {
    const theme = stripSwiftComments(
      read("ios/LearnWithAlphonso/Sources/DesignSystem/AlphonsoTheme.swift"),
    );
    const enumBody = theme.slice(
      theme.indexOf("enum AlphonsoThemeID"),
      theme.indexOf("public var id"),
    );
    expect([...enumBody.matchAll(/^\s*case (\w+)\s*$/gm)].map((m) => m[1])).toEqual([
      "royal",
      "meadow",
    ]);
    const settings = stripSwiftComments(read("ios/LearnWithAlphonso/Sources/SettingsView.swift"));
    expect(settings).toContain("ForEach(AlphonsoThemeID.allCases)");
  });

  it("iOS app: a stored value goes through DSPaletteID.resolve, both at launch and from the account", () => {
    const theme = stripSwiftComments(
      read("ios/LearnWithAlphonso/Sources/DesignSystem/AlphonsoTheme.swift"),
    );
    expect(theme).toContain(
      "AlphonsoThemeID(rawValue: DSPaletteID.resolve(stored: raw).rawValue) ?? .royal",
    );
    expect(theme).toContain("let id = AlphonsoThemeID.resolve(saved)");
    expect(theme).toContain("setTheme(AlphonsoThemeID.resolve(serverValue))");
  });

  it("Android: AlphonsoThemeId has exactly royal and meadow, and the picker lists every entry", () => {
    const src = stripKotlinComments(
      read(
        "android/LearnWithAlphonso/app/src/main/java/com/obsidianmedia/learnwithalphonso/ui/theme/AlphonsoPalette.kt",
      ),
    );
    const enumBody = src.slice(
      src.indexOf("enum class AlphonsoThemeId"),
      src.indexOf("companion object"),
    );
    expect(
      [...enumBody.matchAll(/(\w+)\("(\w+)", "(\w+)"\)/g)].map((m) => [m[1], m[2], m[3]]),
    ).toEqual([
      ["ROYAL", "royal", "Royal"],
      ["MEADOW", "meadow", "Meadow"],
    ]);
    const settings = read(
      "android/LearnWithAlphonso/app/src/main/java/com/obsidianmedia/learnwithalphonso/ui/settings/SettingsScreen.kt",
    );
    expect(settings).toContain("AlphonsoThemeId.entries.forEach");
    const manager = read(
      "android/LearnWithAlphonso/app/src/main/java/com/obsidianmedia/learnwithalphonso/ui/theme/ThemeManager.kt",
    );
    expect(manager).toContain("AlphonsoThemeId.resolve(prefs.getString(KEY, null))");
    expect(manager).toContain("setTheme(AlphonsoThemeId.resolve(serverValue))");
  });
});

describe("nothing of Studio Ink, Manuscript or Canopy is left in the code", () => {
  const RETIRED = /studio[-_ ]?ink|manuscript|canopy/i;

  it("iOS Swift sources (comments aside)", () => {
    const files = [
      ...walk("ios/LearnWithAlphonso/Sources", ".swift"),
      ...walk("ios/LearnWithAlphonsoKit/Sources", ".swift"),
    ];
    expect(files.length).toBeGreaterThan(50);
    const hits = files.filter((f) => RETIRED.test(stripSwiftComments(read(f))));
    expect(hits).toEqual([]);
  });

  it("Android Kotlin sources and resources (comments aside)", () => {
    const base = "android/LearnWithAlphonso/app/src/main";
    const files = [...walk(`${base}/java`, ".kt"), ...walk(`${base}/res`, ".xml")];
    expect(files.length).toBeGreaterThan(50);
    const hits = files.filter((f) => RETIRED.test(stripKotlinComments(read(f))));
    expect(hits).toEqual([]);
  });

  it("web: no token set, CSS selector or font file for a removed theme", () => {
    const css = read("src/styles.css") + read("src/styles/tile-tones.generated.css");
    expect(css).not.toMatch(/data-theme/);
    expect(css).not.toMatch(RETIRED);
    expect(css).not.toMatch(/instrument|newsreader|source sans/i);
    for (const gone of ["canopy", "manuscript", "studio-ink"]) {
      expect(fs.existsSync(path.join(root, `src/design-tokens/${gone}.json`)), gone).toBe(false);
    }
    expect(fs.existsSync(path.join(root, "src/lib/palette.ts"))).toBe(false);
    const fonts = fs.readdirSync(path.join(root, "ios/LearnWithAlphonso/Sources/Fonts"));
    expect(fonts.filter((f) => /instrument|newsreader|sourcesans/i.test(f))).toEqual([]);
  });
});

describe("the migration that moves stored values to Royal", () => {
  const sql = read("supabase/migrations/20261116110000_themes_royal_and_meadow.sql");
  const names = THEME_NAMES.map((n) => `'${n}'`).join(", ");

  it("rewrites every non-null value that is not royal or meadow to royal, and leaves null alone", () => {
    expect(sql).toMatch(
      /update public\.profiles\s+set theme = 'royal'\s+where theme is not null\s+and theme not in \('royal', 'meadow'\);/,
    );
  });

  it("narrows the CHECK constraint to exactly the web's theme names", () => {
    expect(sql).toContain(`check (theme in (${names}))`);
  });

  it("coerces a later write of a retired value, so an older app build keeps working", () => {
    expect(sql).toContain("new.theme := 'royal'");
    expect(sql).toMatch(/before insert or update of theme on public\.profiles/);
  });

  // The old CHECK did not allow 'royal', so rewriting to 'royal' while it still stands fails
  // (the first production deploy of this migration failed exactly there).
  it("drops the old constraint before it rewrites values to royal", () => {
    expect(sql.indexOf("drop constraint if exists profiles_theme_check")).toBeGreaterThan(-1);
    expect(sql.indexOf("drop constraint if exists profiles_theme_check")).toBeLessThan(
      sql.indexOf("set theme = 'royal'"),
    );
  });

  it("runs the update before it narrows the constraint", () => {
    expect(sql.indexOf("set theme = 'royal'")).toBeGreaterThan(-1);
    expect(sql.indexOf("set theme = 'royal'")).toBeLessThan(
      sql.indexOf("add constraint profiles_theme_check"),
    );
  });
});
