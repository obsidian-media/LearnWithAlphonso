import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import tokens from "../../design/tokens.json";

/**
 * The design system's two faces, Bricolage Grotesque (display and numerals) and Figtree (body), both OFL, are
 * bundled on all three platforms with their licence text, and each platform registers them.
 */
const root = path.resolve(import.meta.dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(root, rel));
const exists = (rel: string) => fs.existsSync(path.join(root, rel));
const sha = (rel: string) => crypto.createHash("sha256").update(read(rel)).digest("hex");

/** The table tags in a TrueType/OpenType file's table directory. */
function tables(buf: Buffer): string[] {
  const count = buf.readUInt16BE(4);
  return Array.from({ length: count }, (_, i) => buf.toString("latin1", 12 + i * 16, 16 + i * 16));
}

const FACES = [
  {
    role: "display",
    spec: tokens.fonts.display,
    licence: "BricolageGrotesque-OFL.txt",
    copyright: "The Bricolage Grotesque Project Authors",
  },
  {
    role: "body",
    spec: tokens.fonts.body,
    licence: "Figtree-OFL.txt",
    copyright: "The Figtree Project Authors",
  },
] as const;

describe.each(FACES)("$spec.name ($role)", ({ spec, licence, copyright }) => {
  const iosFont = `ios/LearnWithAlphonso/Sources/Fonts/${spec.ios}`;
  const androidFont = `android/LearnWithAlphonso/app/src/main/res/font/${spec.android}.ttf`;
  const webFont = `public/fonts/${spec.web}`;

  it("is bundled as one variable font file on iOS and Android, the same file on both", () => {
    expect(exists(iosFont), iosFont).toBe(true);
    expect(exists(androidFont), androidFont).toBe(true);
    expect(tables(read(iosFont))).toEqual(expect.arrayContaining(["fvar", "GSUB"]));
    expect(sha(androidFont)).toBe(sha(iosFont));
  });

  it("is self-hosted on the web as WOFF, declared by the generated @font-face", () => {
    expect(exists(webFont), webFont).toBe(true);
    expect(read(webFont).toString("latin1", 0, 4)).toBe("wOFF");
    const css = read("src/styles/ds-tokens.generated.css").toString("utf8");
    expect(css).toContain(`font-family: "${spec.name}";`);
    expect(css).toContain(`url("/fonts/${spec.web}")`);
    // The @font-face only registers the face if the app's stylesheet actually loads the generated file.
    const app = read("src/styles.css").toString("utf8");
    expect(app).toMatch(/^@import "\.\/styles\/ds-tokens\.generated\.css";$/m);
  });

  it("ships its OFL licence text next to the font on every platform", () => {
    for (const rel of [
      `ios/LearnWithAlphonso/Sources/Fonts/${licence}`,
      `android/LearnWithAlphonso/fonts-licenses/${licence}`,
      `public/fonts/${licence}`,
    ]) {
      expect(exists(rel), rel).toBe(true);
      const text = read(rel).toString("utf8");
      expect(text, rel).toContain(copyright);
      expect(text, rel).toContain("SIL OPEN FONT LICENSE Version 1.1");
    }
  });

  it("is registered: iOS UIAppFonts, the Kit's acknowledgements, Android's font role", () => {
    const plist = read("ios/LearnWithAlphonso/Info.plist").toString("utf8");
    const appFonts = /<key>UIAppFonts<\/key>\s*<array>([\s\S]*?)<\/array>/.exec(plist)![1];
    expect(appFonts).toContain(`<string>${spec.ios}</string>`);
    const ack = read(
      "ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/Acknowledgements.swift",
    ).toString("utf8");
    expect(ack).toContain(`licenseResource: "${licence.replace(/\.txt$/, "")}"`);
    const kotlin = read(
      "android/LearnWithAlphonso/app/src/main/java/com/obsidianmedia/learnwithalphonso/ui/theme/AlphonsoTokens.kt",
    ).toString("utf8");
    expect(kotlin).toContain(`R.font.${spec.android}`);
  });
});

describe("credits", () => {
  it("THIRD_PARTY_NOTICES.md names both faces and their licence", () => {
    const notices = read("THIRD_PARTY_NOTICES.md").toString("utf8");
    expect(notices).toContain("Bricolage Grotesque");
    expect(notices).toContain("Figtree");
  });
});
