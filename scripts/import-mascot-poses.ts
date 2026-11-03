/**
 * Imports approved mascot poses into the app.
 *
 *   bun scripts/import-mascot-poses.ts <folder of <mascot>-<pose>.png cutouts>
 *
 * Each PNG must already have a transparent background (Higgsfield's background remover). The script trims the empty
 * margin, centres the figure on a square transparent canvas, and writes:
 *   - public/mascots/<mascot>-<pose>.png (512 px, web)
 *   - ios/LearnWithAlphonso/Sources/Assets.xcassets/<Mascot>-<pose>.imageset/ (768 px, one universal image, like the
 *     base Alphonso and Hector images)
 * and adds the name to src/data/mascot-poses-available.json and the Kit's copy of it. Only poses listed in
 * src/data/mascot-moments.json are accepted.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const WEB_PX = 512;
const IOS_PX = 768;
const AVAILABLE = "src/data/mascot-poses-available.json";
const KIT_AVAILABLE =
  "ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/Resources/mascot-poses-available.json";
const ASSETS = "ios/LearnWithAlphonso/Sources/Assets.xcassets";

const moments = JSON.parse(readFileSync("src/data/mascot-moments.json", "utf8")) as {
  poses: string[];
};

/** "alphonso-proud" -> "Alphonso-proud", the iOS asset name MascotPoseCatalog expects. */
export function iosAssetName(name: string): string {
  return name.replace(/^./, (c) => c.toUpperCase());
}

/** The pose names in a folder that are a known mascot plus a known pose; anything else is an error. */
export function validPoseNames(files: string[], poses: string[]): string[] {
  const names = files.filter((f) => f.endsWith(".png")).map((f) => f.slice(0, -4));
  for (const n of names) {
    const [mascot, pose, extra] = n.split("-");
    if (extra !== undefined || !["alphonso", "hector"].includes(mascot) || !poses.includes(pose)) {
      throw new Error(`not a <mascot>-<pose> name from mascot-moments.json: ${n}.png`);
    }
  }
  return names.sort();
}

async function squareCutout(src: string, size: number): Promise<Buffer> {
  const trimmed = await sharp(src).ensureAlpha().trim({ threshold: 1 }).toBuffer();
  return sharp(trimmed)
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9, palette: true, quality: 90, effort: 10 })
    .toBuffer();
}

async function main(folder: string) {
  const names = validPoseNames(readdirSync(folder), moments.poses);
  if (names.length === 0) throw new Error(`no <mascot>-<pose>.png files in ${folder}`);
  mkdirSync("public/mascots", { recursive: true });
  for (const name of names) {
    const src = join(folder, `${name}.png`);
    writeFileSync(`public/mascots/${name}.png`, await squareCutout(src, WEB_PX));
    const asset = iosAssetName(name);
    const dir = `${ASSETS}/${asset}.imageset`;
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/${asset}.png`, await squareCutout(src, IOS_PX));
    writeFileSync(
      `${dir}/Contents.json`,
      JSON.stringify(
        {
          images: [{ filename: `${asset}.png`, idiom: "universal", scale: "1x" }],
          info: { author: "xcode", version: 1 },
        },
        null,
        2,
      ) + "\n",
    );
    console.log(`imported ${name}`);
  }
  const current = JSON.parse(readFileSync(AVAILABLE, "utf8")) as string[];
  const merged = [...new Set([...current, ...names])].sort();
  const json = JSON.stringify(merged, null, 2) + "\n";
  writeFileSync(AVAILABLE, json);
  writeFileSync(KIT_AVAILABLE, json);
  console.log(`${merged.length} poses available`);
}

if (import.meta.main) {
  const folder = process.argv[2];
  if (!folder) {
    console.error("usage: bun scripts/import-mascot-poses.ts <folder>");
    process.exit(1);
  }
  await main(folder);
}
