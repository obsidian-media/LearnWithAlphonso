import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { COUNTRIES } from "./learner-profile";
import { DRAWN_FLAGS, drawnFlagCode } from "./drawn-flags";

const root = path.resolve(import.meta.dirname, "../..");
const exists = (rel: string) => fs.existsSync(path.join(root, rel));

describe("drawn flags", () => {
  it("every drawn flag is a country the app offers, listed once", () => {
    expect(new Set(DRAWN_FLAGS).size).toBe(DRAWN_FLAGS.length);
    for (const code of DRAWN_FLAGS) expect(COUNTRIES as readonly string[]).toContain(code);
  });

  it.each(DRAWN_FLAGS)("%s has a vector on web, iOS and Android", (code) => {
    const cc = code.toLowerCase();
    expect(exists(`public/flags/${cc}.svg`)).toBe(true);
    expect(
      exists(
        `ios/LearnWithAlphonso/Sources/Assets.xcassets/Flags/flag-${cc}.imageset/flag-${cc}.svg`,
      ),
    ).toBe(true);
    expect(exists(`android/LearnWithAlphonso/app/src/main/res/drawable/flag_${cc}.xml`)).toBe(true);
  });

  it("the generator draws exactly this list", () => {
    const src = fs.readFileSync(path.join(root, "scripts/generate-profile-flags.mjs"), "utf8");
    const drawn = [...src.matchAll(/^ {2}([A-Z]{2}): \{/gm)].map((m) => m[1]).sort();
    expect(drawn).toEqual([...DRAWN_FLAGS].sort());
  });

  it("a country without a drawing falls back to its code, never to the emoji", () => {
    expect(drawnFlagCode("gb")).toBe("GB");
    expect(drawnFlagCode("CA")).toBeNull();
    expect(drawnFlagCode(null)).toBeNull();
  });
});
