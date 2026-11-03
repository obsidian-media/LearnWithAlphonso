import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import available from "../data/mascot-poses-available.json";
import moments from "../data/mascot-moments.json";
import { MASCOT_MOMENTS, mascotArt } from "./mascot-poses";

const KIT = "ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/Resources";

describe("mascot poses", () => {
  it("lesson complete is Alphonso, proud", () => {
    expect(moments.moments.lessonComplete).toEqual({ mascot: "alphonso", pose: "proud" });
    expect(mascotArt("lessonComplete", ["alphonso-proud"])).toEqual({
      mascot: "alphonso",
      src: "/mascots/alphonso-proud.png",
    });
  });

  it("a pose not in the available list falls back to the base image", () => {
    expect(mascotArt("lessonComplete", []).src).toBe("/mascots/alphonso.png");
    expect(mascotArt("hectorListening", ["alphonso-proud"]).src).toBe("/mascots/hector.png");
  });

  it("defaults to the bundled available list", () => {
    const expected = available.includes("alphonso-proud" as never)
      ? "/mascots/alphonso-proud.png"
      : "/mascots/alphonso.png";
    expect(mascotArt("lessonComplete").src).toBe(expected);
  });

  it("every moment names a known mascot and pose", () => {
    expect(MASCOT_MOMENTS.length).toBeGreaterThanOrEqual(13);
    for (const m of MASCOT_MOMENTS) {
      const { mascot, pose } = (
        moments.moments as Record<string, { mascot: string; pose: string }>
      )[m];
      expect(["alphonso", "hector"], m).toContain(mascot);
      expect(moments.poses, m).toContain(pose);
    }
  });

  it("every available pose has its web PNG and iOS imageset", () => {
    for (const name of available as string[]) {
      expect(existsSync(`public/mascots/${name}.png`), name).toBe(true);
      const asset = name.replace(/^./, (c) => c.toUpperCase());
      expect(
        existsSync(`ios/LearnWithAlphonso/Sources/Assets.xcassets/${asset}.imageset/Contents.json`),
        name,
      ).toBe(true);
    }
  });

  it("Kit copies equal the sources", () => {
    expect(JSON.parse(readFileSync(`${KIT}/mascot-moments.json`, "utf8"))).toEqual(moments);
    expect(JSON.parse(readFileSync(`${KIT}/mascot-poses-available.json`, "utf8"))).toEqual(
      available,
    );
  });
});

describe("import-mascot-poses", () => {
  it("accepts only <mascot>-<pose> names from mascot-moments.json", async () => {
    const { validPoseNames } = await import("../../scripts/import-mascot-poses");
    expect(
      validPoseNames(["hector-waving.png", "alphonso-proud.png", "notes.txt"], moments.poses),
    ).toEqual(["alphonso-proud", "hector-waving"]);
    expect(() => validPoseNames(["alphonso-dancing.png"], moments.poses)).toThrow(
      /alphonso-dancing/,
    );
    expect(() => validPoseNames(["bob-happy.png"], moments.poses)).toThrow(/bob-happy/);
    expect(() => validPoseNames(["alphonso-proud-2.png"], moments.poses)).toThrow(
      /alphonso-proud-2/,
    );
  });

  it("names the iOS asset the way MascotPoseCatalog looks it up", async () => {
    const { iosAssetName } = await import("../../scripts/import-mascot-poses");
    expect(iosAssetName("alphonso-proud")).toBe("Alphonso-proud");
    expect(iosAssetName("hector-listening")).toBe("Hector-listening");
  });
});
