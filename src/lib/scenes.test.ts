import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classifyAsset, iosSceneAssetName } from "../../scripts/import-scenes";
import { FIGURES, SCENES, figureSrc, sceneSrc } from "./scenes";

describe("scenes and figures", () => {
  it("the import script accepts only the approved scene and figure names", () => {
    expect(classifyAsset("scene-learn.png")).toEqual({ kind: "scene", name: "learn" });
    expect(classifyAsset("figure-alphonso-proud.png")).toEqual({
      kind: "figure",
      name: "alphonso-proud",
    });
    expect(() => classifyAsset("scene-beach.png")).toThrow(/not an approved/);
    expect(() => classifyAsset("figure-hector-dancing.png")).toThrow(/not an approved/);
    expect(classifyAsset("notes.txt")).toBeNull();
  });

  it("names iOS image sets Scene-<name> and Figure-<name>", () => {
    expect(iosSceneAssetName({ kind: "scene", name: "learn" })).toBe("Scene-learn");
    expect(iosSceneAssetName({ kind: "figure", name: "hector-waving" })).toBe(
      "Figure-hector-waving",
    );
  });

  it("every approved scene and figure is bundled for the web and the iPhone", () => {
    for (const s of SCENES) {
      expect(existsSync(`public${sceneSrc(s)}`), s).toBe(true);
      expect(
        existsSync(
          `ios/LearnWithAlphonso/Sources/Assets.xcassets/Scene-${s}.imageset/Contents.json`,
        ),
        s,
      ).toBe(true);
    }
    for (const f of FIGURES) {
      expect(existsSync(`public${figureSrc(f)}`), f).toBe(true);
      expect(
        existsSync(
          `ios/LearnWithAlphonso/Sources/Assets.xcassets/Figure-${f}.imageset/Contents.json`,
        ),
        f,
      ).toBe(true);
    }
  });

  it("scenes stay small enough not to slow the first paint", () => {
    for (const s of SCENES) {
      expect(readFileSync(`public${sceneSrc(s)}`).length, s).toBeLessThan(400_000);
    }
  });
});
