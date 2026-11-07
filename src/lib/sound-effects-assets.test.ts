import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SFX_EVENTS, SFX_FILES } from "./sfx";

const root = path.resolve(import.meta.dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(root, rel));
const names = SFX_EVENTS.map((e) => path.basename(SFX_FILES[e], ".mp3"));
const SOURCES = [
  "jingles_PIZZI08.ogg",
  "question_004.ogg",
  "jingles_STEEL02.ogg",
  "pluck_001.ogg",
  "impactSoft_medium_001.ogg",
  "drop_002.ogg",
  "jingles_PIZZI10.ogg",
  "jingles_PIZZI11.ogg",
  "confirmation_003.ogg",
];

describe("the sound effect files", () => {
  it("ship as the same bytes on the web, iOS and Android", () => {
    for (const name of names) {
      const web = read(`public/sfx/${name}.mp3`);
      expect(web.length, name).toBeGreaterThan(1000);
      expect(
        read(`ios/LearnWithAlphonso/Sources/Sounds/${name}.mp3`).equals(web),
        `${name} on iOS`,
      ).toBe(true);
      const raw = name.replaceAll("-", "_");
      expect(
        read(`android/LearnWithAlphonso/app/src/main/res/raw/${raw}.mp3`).equals(web),
        `${name} on Android`,
      ).toBe(true);
    }
  });

  it("are exactly the nine effects, on every platform", () => {
    const list = (rel: string) => fs.readdirSync(path.join(root, rel)).sort();
    const expected = names.map((n) => `${n}.mp3`).sort();
    expect(list("public/sfx")).toEqual(expected);
    expect(list("ios/LearnWithAlphonso/Sources/Sounds")).toEqual(expected);
    expect(list("android/LearnWithAlphonso/app/src/main/res/raw")).toEqual(
      expected.map((n) => n.replaceAll("-", "_")),
    );
  });

  it("stay small: under 100 KB together", () => {
    const total = names.reduce((sum, n) => sum + read(`public/sfx/${n}.mp3`).length, 0);
    expect(total).toBeLessThan(100_000);
  });

  it("each platform's code names the same nine files", () => {
    const kit = read(
      "ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/SoundEffects.swift",
    ).toString();
    const core = read(
      "android/LearnWithAlphonso/core/src/main/kotlin/com/obsidianmedia/learnwithalphonso/core/sound/SoundEffects.kt",
    ).toString();
    for (const name of names) {
      expect(kit, name).toContain(`"${name}"`);
      expect(core, name).toContain(`"${name.replaceAll("-", "_")}"`);
    }
  });
});

describe("the CC0 credit", () => {
  it("is in the notices with every source file", () => {
    const notices = read("THIRD_PARTY_NOTICES.md").toString();
    expect(notices).toContain("Sound effects by Kenney (kenney.nl), CC0");
    for (const source of SOURCES) expect(notices, source).toContain(source);
  });

  it("is in the iOS acknowledgements, with its licence text bundled", () => {
    const acks = read(
      "ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/Acknowledgements.swift",
    ).toString();
    expect(acks).toContain('"Sound effects by Kenney (kenney.nl)"');
    expect(acks).toContain('licenseResource: "Kenney-CC0"');
    const text = read("ios/LearnWithAlphonso/Sources/Licenses/Kenney-CC0.txt").toString();
    expect(text).toContain("CC0");
    for (const source of SOURCES) expect(text, source).toContain(source);
  });
});
