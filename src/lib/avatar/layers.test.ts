import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contentSecurityPolicy } from "../security-policy";
import {
  ALL_FILE_NAMES,
  AVATAR_BASE_PATH,
  AVATAR_PREFERENCE_DEFAULT,
  AVATAR_PREFERENCE_KEY,
  BROWS_RECT,
  HECTOR_KIT,
  ALPHONSO_KIT,
  GLINT_RECT,
  MOUTH_RECT,
} from "./layers";

const root = path.resolve(import.meta.dirname, "../../..");
const WEB = path.join(root, "public/avatar");
const IOS = path.join(root, "ios/LearnWithAlphonso/AlphonsoAvatar");

describe("the art served to the web", () => {
  it("has every layer the code can ask for, and no other image", () => {
    const files = fs.readdirSync(WEB).filter((f) => f.endsWith(".webp"));
    expect([...files].sort()).toEqual([...ALL_FILE_NAMES].sort());
    expect(ALL_FILE_NAMES).toHaveLength(11);
  });

  it("is the same art, byte for byte, as the iOS app bundles", () => {
    for (const file of [...ALL_FILE_NAMES, "manifest.json"])
      expect(
        fs.readFileSync(path.join(WEB, file)).equals(fs.readFileSync(path.join(IOS, file))),
        file,
      ).toBe(true);
  });

  it("places every layer where the manifest does", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(WEB, "manifest.json"), "utf8")) as {
      layers: Record<string, unknown>;
    };
    expect(MOUTH_RECT).toEqual(manifest.layers["mouth-ah"]);
    for (const m of ["half", "talk", "ah", "oh", "ee", "fv"])
      expect(manifest.layers[`mouth-${m}`]).toEqual(MOUTH_RECT);
    for (const b of ["neutral", "raised", "lowered"])
      expect(manifest.layers[`brows-${b}`]).toEqual(BROWS_RECT);
    expect(manifest.layers["glint-mask"]).toEqual(GLINT_RECT);
    expect(manifest.layers.base).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });
});

describe("the two kits", () => {
  it("is Alphonso's realistic kit: no ear layers, the glint kept, brows as the expression group", () => {
    expect(ALPHONSO_KIT.rects.earLeft).toBeUndefined();
    expect(ALPHONSO_KIT.rects.earRight).toBeUndefined();
    expect(ALPHONSO_KIT.rects.glint).toBeDefined();
    expect(ALPHONSO_KIT.expressionFiles.lowered).toBe("brows-lowered.webp");
    expect(fs.readdirSync(WEB).some((f) => f.startsWith("ear-"))).toBe(false);
  });

  it("is Hector's kit: no ears, no glint, eyes as the expression group, his own folder", () => {
    const files = fs.readdirSync(path.join(root, "public/hector")).sort();
    const expected = [
      "base",
      ...["half", "talk", "ah", "oh", "ee", "fv"].map((m) => `mouth-${m}`),
      ...["neutral", "raised", "lowered"].map((e) => `eyes-${e}`),
    ].map((n) => `${n}.webp`);
    expect(files).toEqual([...expected, "manifest.json"].sort());
    expect(HECTOR_KIT.displayName).toBe("Hector");
    expect(HECTOR_KIT.basePath).toBe("/hector");
    expect(HECTOR_KIT.rects.earLeft).toBeUndefined();
    expect(HECTOR_KIT.rects.glint).toBeUndefined();
    expect(HECTOR_KIT.expressionFiles.raised).toBe("eyes-raised.webp");
    const manifest = JSON.parse(
      fs.readFileSync(path.join(root, "public/hector/manifest.json"), "utf8"),
    );
    expect(manifest.expressionPrefix).toBe("eyes");
    expect(HECTOR_KIT.rects.mouth).toEqual(manifest.layers["mouth-ah"]);
    expect(HECTOR_KIT.rects.expression).toEqual(manifest.layers["eyes-neutral"]);
  });

  it("is the same art, byte for byte, as iOS bundles for each character", () => {
    for (const [web, ios] of [["public/hector", "ios/LearnWithAlphonso/HectorAvatar"]] as const)
      for (const f of fs.readdirSync(path.join(root, web)))
        expect(
          fs.readFileSync(path.join(root, web, f)).equals(fs.readFileSync(path.join(root, ios, f))),
          f,
        ).toBe(true);
  });
});

describe("the Content-Security-Policy", () => {
  it("lets the page load the art: it is same-origin, and img-src allows 'self'", () => {
    expect(AVATAR_BASE_PATH).toMatch(/^\/[^/]/);
    const csp = contentSecurityPolicy("nonce", "https://example.supabase.co");
    const imgSrc = csp.split("; ").find((d) => d.startsWith("img-src "))!;
    expect(imgSrc.split(" ")).toContain("'self'");
  });

  it("needs no new origin for the glint mask (a blob: URL) either", () => {
    const csp = contentSecurityPolicy("nonce");
    const imgSrc = csp.split("; ").find((d) => d.startsWith("img-src "))!;
    expect(imgSrc.split(" ")).toContain("blob:");
  });
});

describe("the setting", () => {
  it("shares its key and default with the iOS setting", () => {
    expect(AVATAR_PREFERENCE_KEY).toBe("showAlphonsoWhilePractising");
    expect(AVATAR_PREFERENCE_DEFAULT).toBe(true);
  });
});
