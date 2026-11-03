import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ACHIEVEMENTS as achievements } from "../data/achievements";
import glyphEmoji from "../data/icon3d-achievements.json";
import mapping from "../data/icon3d.json";
import { achievementIconEmoji, icon3dSlug } from "./icon3d";

const KIT = "ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/Resources";

/** Every emoji in the exported scenario and campaign content, in all three courses. */
function contentEmoji(): string[] {
  const found = new Set<string>();
  const walk = (x: unknown): void => {
    if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === "object") {
      const o = x as Record<string, unknown>;
      if (typeof o.emoji === "string") found.add(o.emoji);
      Object.values(o).forEach(walk);
    }
  };
  for (const f of readdirSync(KIT).filter((n) => /^(scenarios|campaigns)/.test(n))) {
    walk(JSON.parse(readFileSync(`${KIT}/${f}`, "utf8")));
  }
  return [...found];
}

/** Emoji the redesigned screens use directly (Profile, Listen, Hector, stats, chips, Learn path). */
const UI_EMOJI = [
  "🏆",
  "👥",
  "⭐️",
  "⚙️",
  "📁",
  "🎧",
  "✨",
  "🎙️",
  "🔥",
  "❤️",
  "⚡",
  "🎯",
  "📚",
  "🔒",
];

describe("3D icons", () => {
  it("every scenario and campaign emoji has a 3D icon", () => {
    const emoji = contentEmoji();
    expect(emoji.length).toBeGreaterThan(10);
    for (const e of emoji) expect(icon3dSlug(e), e).not.toBeNull();
  });

  it("every emoji the redesigned screens use has a 3D icon", () => {
    for (const e of UI_EMOJI) expect(icon3dSlug(e), e).not.toBeNull();
  });

  it("FE0F and bare forms resolve the same", () => {
    expect(icon3dSlug("⭐️")).toBe(icon3dSlug("⭐"));
    expect(icon3dSlug("⚙️")).toBe(icon3dSlug("⚙"));
    expect(icon3dSlug("✈️")).toBe(icon3dSlug("✈"));
    expect(icon3dSlug("⭐")).not.toBeNull();
  });

  it("unknown emoji gives null", () => {
    expect(icon3dSlug("🦄🦄")).toBeNull();
    expect(icon3dSlug("")).toBeNull();
  });

  it("mapping keys carry no FE0F", () => {
    for (const k of Object.keys(mapping)) expect(k.includes("️"), k).toBe(false);
  });

  it("every slug has a web PNG and an iOS imageset", () => {
    for (const slug of new Set(Object.values(mapping))) {
      expect(existsSync(`public/icons3d/${slug}.png`), slug).toBe(true);
      const set = `ios/LearnWithAlphonso/Sources/Assets.xcassets/Icon3D/${slug}.imageset`;
      expect(existsSync(`${set}/Contents.json`), slug).toBe(true);
      expect(existsSync(`${set}/${slug}@2x.png`), slug).toBe(true);
      expect(existsSync(`${set}/${slug}@3x.png`), slug).toBe(true);
    }
  });

  it("every achievement glyph key maps to a known icon", () => {
    const keys = new Set(achievements.map((a) => a.icon));
    for (const k of keys) {
      const e = achievementIconEmoji(k);
      expect(e, k).not.toBeNull();
      expect(icon3dSlug(e!), k).not.toBeNull();
    }
    expect(achievementIconEmoji("no-such-glyph")).toBeNull();
  });

  it("Kit copies of the mapping files equal the sources", () => {
    expect(JSON.parse(readFileSync(`${KIT}/icon3d.json`, "utf8"))).toEqual(mapping);
    expect(JSON.parse(readFileSync(`${KIT}/icon3d-achievements.json`, "utf8"))).toEqual(glyphEmoji);
  });
});
