import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ANDROID_DRAWABLE_DIR,
  formatOutputs,
  IOS_ICON_FOLDER,
  loadDesignSource,
  parseIcon,
  renderAll,
  toAndroidPathData,
} from "./design-system-export";

/**
 * design/tokens.json and design/icons/*.svg are the one source. Every mirror (web CSS and TS, Swift, Kotlin, the
 * iOS asset catalog and the Android vector drawables) is written by scripts/export-design-system.ts. These tests
 * fail when a mirror drifts from the source: edit the JSON or the SVG, run the script, commit the result.
 */
const root = path.resolve(import.meta.dirname, "../..");
const source = loadDesignSource(root);
const outputs = await formatOutputs(renderAll(source), root);

describe("design system mirrors are up to date", () => {
  it.each(Object.keys(outputs))("%s matches the source", (rel) => {
    const file = path.join(root, rel);
    expect(fs.existsSync(file), `${rel} is missing: run bun scripts/export-design-system.ts`).toBe(
      true,
    );
    expect(
      fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n"),
      `${rel} is stale: run bun scripts/export-design-system.ts`,
    ).toBe(outputs[rel]);
  });

  it("every colour name reaches the web, Swift and Kotlin mirrors", () => {
    const css = outputs["src/styles/ds-tokens.generated.css"];
    const swift = outputs["ios/LearnWithAlphonso/Sources/DesignSystem/AlphonsoDS.generated.swift"];
    const kotlin =
      outputs[
        "android/LearnWithAlphonso/app/src/main/java/com/obsidianmedia/learnwithalphonso/ui/theme/AlphonsoTokens.kt"
      ];
    for (const name of Object.keys(source.tokens.palettes.royal.light)) {
      const kebab = name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
      expect(css, name).toContain(`--c-${kebab}:`);
      expect(swift, name).toContain(`public let ${name}: Color`);
      expect(kotlin, name).toContain(`val ${name}: Color`);
    }
  });

  it("the meadow night value of every colour reaches each mirror", () => {
    const css = outputs["src/styles/ds-tokens.generated.css"];
    const swift = outputs["ios/LearnWithAlphonso/Sources/DesignSystem/AlphonsoDS.generated.swift"];
    const kotlin =
      outputs[
        "android/LearnWithAlphonso/app/src/main/java/com/obsidianmedia/learnwithalphonso/ui/theme/AlphonsoTokens.kt"
      ];
    const hex = source.tokens.palettes.meadow.night.choice.slice(1);
    expect(css).toContain(`--c-choice: #${hex};`);
    expect(swift).toContain(`choice: Color(hex: 0x${hex})`);
    expect(kotlin).toContain(`choice = Color(0xFF${hex})`);
  });
});

describe("icons: one SVG source, all three platforms", () => {
  const names = source.icons.map((i) => i.name);
  const solid = source.tokens.icons.solid;

  it("there are the spec's 22 icons, with solid versions of heart, bolt, flame and star", () => {
    expect(names).toHaveLength(22);
    expect([...names].sort()).toEqual(
      [
        "heart",
        "bolt",
        "flame",
        "play",
        "speaker",
        "mic",
        "close",
        "check",
        "cross",
        "lock",
        "star",
        "trophy",
        "friends",
        "league",
        "book",
        "words",
        "clock",
        "settings",
        "chevron",
        "gift",
        "chest",
        "target",
      ].sort(),
    );
    expect(solid).toEqual(["heart", "bolt", "flame", "star"]);
  });

  it("every icon is drawn on the 24 pt grid with a 2 pt round stroke", () => {
    for (const icon of source.icons) {
      expect(icon.svg, icon.name).toContain('viewBox="0 0 24 24"');
      expect(icon.svg, icon.name).toContain('stroke-width="2"');
      expect(icon.svg, icon.name).toContain('stroke-linecap="round"');
      expect(icon.elements.length, icon.name).toBeGreaterThan(0);
    }
  });

  const variants = [...names.map((n) => `ds-${n}`), ...solid.map((n) => `ds-${n}-solid`)];

  it("web: every icon and solid variant is in the generated icon table", async () => {
    const web = await import("../design/icons.generated");
    expect([...web.DS_ICON_NAMES].sort()).toEqual([...names].sort());
    expect([...web.DS_SOLID_ICONS].sort()).toEqual([...solid].sort());
    for (const n of names) expect(web.DS_ICONS[n].length, n).toBeGreaterThan(0);
  });

  it("iOS: every variant is a template, vector-preserving imageset with its SVG, and nothing else is there", () => {
    const dir = path.join(root, IOS_ICON_FOLDER);
    const onDisk = fs.readdirSync(dir).filter((f) => f.endsWith(".imageset"));
    expect(onDisk.map((f) => f.replace(/\.imageset$/, "")).sort()).toEqual([...variants].sort());
    for (const v of variants) {
      const contents = JSON.parse(
        fs.readFileSync(path.join(dir, `${v}.imageset/Contents.json`), "utf8"),
      );
      expect(contents.properties, v).toEqual({
        "preserves-vector-representation": true,
        "template-rendering-intent": "template",
      });
      expect(contents.images[0].filename, v).toBe(`${v}.svg`);
      expect(fs.existsSync(path.join(dir, `${v}.imageset/${v}.svg`)), v).toBe(true);
    }
  });

  it("Android: every variant is a vector drawable, and nothing else claims the ds_ prefix", () => {
    const dir = path.join(root, ANDROID_DRAWABLE_DIR);
    const onDisk = fs.readdirSync(dir).filter((f) => f.startsWith("ds_"));
    expect(onDisk.sort()).toEqual(variants.map((v) => `${v.replace(/-/g, "_")}.xml`).sort());
    for (const f of onDisk)
      expect(fs.readFileSync(path.join(dir, f), "utf8"), f).toContain("<vector");
  });

  it("Swift and Kotlin list every variant by name, so a screen can only ask for an icon that exists", () => {
    const swift = outputs["ios/LearnWithAlphonso/Sources/DesignSystem/AlphonsoDS.generated.swift"];
    const kotlin =
      outputs[
        "android/LearnWithAlphonso/app/src/main/java/com/obsidianmedia/learnwithalphonso/ui/theme/AlphonsoTokens.kt"
      ];
    for (const v of variants) {
      expect(swift, v).toContain(`= "${v}"`);
      expect(kotlin, v).toContain(`R.drawable.${v.replace(/-/g, "_")}`);
    }
  });
});

describe("icon geometry conversion for Android (vector drawables accept paths only)", () => {
  it("turns a circle into two arcs and a rounded rect into lines and arcs", () => {
    const icon = parseIcon(
      "t",
      '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><rect x="5" y="10.5" width="14" height="10" rx="2.5"/></svg>',
    );
    expect(toAndroidPathData(icon.elements[0])).toBe("M3,12 A9,9 0 1 0 21,12 A9,9 0 1 0 3,12 Z");
    expect(toAndroidPathData(icon.elements[1])).toBe(
      "M7.5,10.5 H16.5 A2.5,2.5 0 0 1 19,13 V18 A2.5,2.5 0 0 1 16.5,20.5 H7.5 A2.5,2.5 0 0 1 5,18 V13 A2.5,2.5 0 0 1 7.5,10.5 Z",
    );
  });
  it("passes path data through unchanged", () => {
    const icon = parseIcon("t", '<svg><path d="M6 6l12 12M18 6 6 18"/></svg>');
    expect(toAndroidPathData(icon.elements[0])).toBe("M6 6l12 12M18 6 6 18");
  });
});
