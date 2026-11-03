/**
 * Builds the 3D icon set (Microsoft Fluent Emoji 3D, MIT, vendored in
 * assets/fluent-3d/) for both platforms, and copies the shared design JSON
 * into the Kit's resources:
 *   - public/icons3d/<slug>.png (128 px) for the web
 *   - ios/.../Assets.xcassets/Icon3D/<slug>.imageset (@2x 128 px, @3x 192 px:
 *     sharp at sizes up to 64 pt) for the iPhone
 *   - src/data/{icon3d,icon3d-achievements,mascot-moments,mascot-poses-available}.json
 *     into ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/Resources/
 * src/lib/icon3d.test.ts and src/lib/mascot-poses.test.ts fail when an output is missing or stale.
 *
 * Usage: bun scripts/build-icon3d.ts
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const SOURCE = "assets/fluent-3d/source";
const WEB = "public/icons3d";
const IOS = "ios/LearnWithAlphonso/Sources/Assets.xcassets/Icon3D";
const KIT = "ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/Resources";
const SHARED_JSON = [
  "icon3d.json",
  "icon3d-achievements.json",
  "mascot-moments.json",
  "mascot-poses-available.json",
];

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

async function main() {
  const mapping = JSON.parse(readFileSync("src/data/icon3d.json", "utf8")) as Record<
    string,
    string
  >;
  mkdirSync(WEB, { recursive: true });
  mkdirSync(IOS, { recursive: true });
  writeFileSync(
    `${IOS}/Contents.json`,
    json({ info: { author: "xcode", version: 1 }, properties: { "provides-namespace": true } }),
  );

  for (const slug of new Set(Object.values(mapping))) {
    const src = `${SOURCE}/${slug}.png`;
    if (!existsSync(src)) throw new Error(`missing Fluent source for ${slug}: ${src}`);
    await sharp(src).resize(128, 128).png().toFile(`${WEB}/${slug}.png`);
    const set = `${IOS}/${slug}.imageset`;
    mkdirSync(set, { recursive: true });
    await sharp(src).resize(128, 128).png().toFile(`${set}/${slug}@2x.png`);
    await sharp(src).resize(192, 192).png().toFile(`${set}/${slug}@3x.png`);
    writeFileSync(
      `${set}/Contents.json`,
      json({
        images: [
          { idiom: "universal", scale: "1x" },
          { filename: `${slug}@2x.png`, idiom: "universal", scale: "2x" },
          { filename: `${slug}@3x.png`, idiom: "universal", scale: "3x" },
        ],
        info: { author: "xcode", version: 1 },
      }),
    );
  }

  for (const name of SHARED_JSON) {
    if (existsSync(`src/data/${name}`)) copyFileSync(`src/data/${name}`, `${KIT}/${name}`);
  }
  console.log(
    `built ${new Set(Object.values(mapping)).size} 3D icons and copied shared JSON to the Kit`,
  );
}

await main();
