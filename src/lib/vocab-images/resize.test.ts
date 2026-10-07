import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { resizeToJpeg } from "./resize";

describe("resizeToJpeg", () => {
  it("fits the long edge to 700px, outputs JPEG and strips EXIF", async () => {
    const input = await sharp({
      create: { width: 2000, height: 1000, channels: 3, background: "#ff0000" },
    })
      .withExif({ IFD0: { Copyright: "secret-gps" } })
      .jpeg()
      .toBuffer();
    expect((await sharp(input).metadata()).exif).toBeDefined();
    const out = await resizeToJpeg(input);
    const meta = await sharp(out.bytes).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([700, 350, "jpeg"]);
    expect([out.width, out.height]).toEqual([700, 350]);
    expect(meta.exif).toBeUndefined();
  });

  it("never enlarges a small image", async () => {
    const input = await sharp({
      create: { width: 300, height: 200, channels: 3, background: "#00ff00" },
    })
      .png()
      .toBuffer();
    const out = await resizeToJpeg(input);
    expect([out.width, out.height]).toEqual([300, 200]);
  });
});
