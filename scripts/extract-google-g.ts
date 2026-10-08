/**
 * Crops Google's official multicolour "G" out of the official icon-only light button PNGs in
 * https://developers.google.com/static/identity/images/signin-assets.zip (downloaded 2026-10-07).
 * The pack's SVG places the G in the 20x20 pt region at (12,12) of the 44 pt square; this copies those pixels
 * at @1x/@2x/@3x without resizing or recolouring them (Google: do not change the G's size or colour).
 * The pack's own SVG draws the G with foreignObject and filters, which an Xcode asset catalog cannot render.
 *
 * The pack files the @1x light icon under "Neutral" (the @2x and @3x ones are under "Light").
 *
 * Usage (Git Bash): bunx tsx scripts/extract-google-g.ts /d/Temp/w6g/x
 */
import path from "node:path";
import sharp from "sharp";

const root = process.argv[2];
if (!root) {
  console.error("Usage: bunx tsx scripts/extract-google-g.ts <unzipped signin-assets dir>");
  process.exit(1);
}
const out = path.resolve(
  import.meta.dirname,
  "../ios/LearnWithAlphonso/Sources/Assets.xcassets/GoogleG.imageset",
);
const scales: Array<[number, string, string, string]> = [
  [1, "PNG @1x", "Neutral", "Theme=Light, Show text=No, Shape=Square, Platform=iOS.png"],
  [2, "PNG @2x", "Light", "Theme=Light, Show text=No, Shape=Square, Platform=iOS@2x.png"],
  [3, "PNG @3x", "Light", "Theme=Light, Show text=No, Shape=Square, Platform=iOS@3x.png"],
];
for (const [scale, folder, theme, file] of scales) {
  const source = path.join(root, "iOS", folder, theme, file);
  const meta = await sharp(source).metadata();
  if (meta.width !== 44 * scale || meta.height !== 44 * scale) {
    throw new Error(`${file}: expected ${44 * scale}px square, got ${meta.width}x${meta.height}`);
  }
  const target = path.join(out, scale === 1 ? "GoogleG.png" : `GoogleG@${scale}x.png`);
  await sharp(source)
    .extract({ left: 12 * scale, top: 12 * scale, width: 20 * scale, height: 20 * scale })
    .png()
    .toFile(target);
  console.log(`wrote ${path.relative(process.cwd(), target)} (${20 * scale}px)`);
}
