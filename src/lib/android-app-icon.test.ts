import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

const res = path.join(__dirname, "../../android/LearnWithAlphonso/app/src/main/res");
const DENSITIES: Record<string, number> = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

describe("Android launcher icon", () => {
  it("the adaptive icon uses the picture background layer, not a flat colour", () => {
    const xml = fs.readFileSync(path.join(res, "mipmap-anydpi-v26/ic_launcher.xml"), "utf8");
    expect(xml).toContain('<background android:drawable="@mipmap/ic_launcher_background" />');
    expect(xml).toContain('<foreground android:drawable="@mipmap/ic_launcher_foreground" />');
  });

  for (const [density, scale] of Object.entries(DENSITIES)) {
    it(`${density}: adaptive layers are 108 dp and the legacy icon is 48 dp`, async () => {
      const dir = path.join(res, `mipmap-${density}`);
      const full = Math.round(108 * scale);
      for (const layer of ["ic_launcher_background.png", "ic_launcher_foreground.png"]) {
        const meta = await sharp(path.join(dir, layer)).metadata();
        expect([meta.width, meta.height], layer).toEqual([full, full]);
      }
      const legacy = await sharp(path.join(dir, "ic_launcher.png")).metadata();
      expect([legacy.width, legacy.height]).toEqual([48 * scale, 48 * scale]);
    });
  }

  it("the background layer is opaque edge to edge, so no mask shape shows a gap", async () => {
    const { data, info } = await sharp(path.join(res, "mipmap-xxxhdpi/ic_launcher_background.png"))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    for (let i = 3; i < data.length; i += info.channels) expect(data[i]).toBe(255);
  });
});
