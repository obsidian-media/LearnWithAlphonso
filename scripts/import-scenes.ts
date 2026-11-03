/**
 * Imports the approved screen scenes and full-body figures into the app.
 *
 *   bun scripts/import-scenes.ts <folder of scene-<name>.png and figure-<name>.png>
 *
 * Names must be listed in src/data/scenes.json. Writes:
 *   - scenes: public/scenes/<name>.jpg and the iOS image set Scene-<name> (1080 px wide JPEG)
 *   - figures: public/figures/<name>.png (trimmed transparent PNG, 1200 px tall). Source art for clips
 *     (scripts/import-clips.ts): the characters are baked into the clips, so the iPhone does not carry figures.
 * Figures must already have a transparent background (Higgsfield's background remover).
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ASSETS = "ios/LearnWithAlphonso/Sources/Assets.xcassets";
const SCENE_WIDTH = 1080;
const FIGURE_HEIGHT = 1200;

const approved = JSON.parse(readFileSync("src/data/scenes.json", "utf8")) as {
  scenes: string[];
  figures: string[];
};

export type SceneAsset = { kind: "scene" | "figure"; name: string };

/** "scene-learn.png" -> a scene; anything that is not a PNG is skipped; a PNG with an unapproved name is an error. */
export function classifyAsset(file: string): SceneAsset | null {
  if (!file.endsWith(".png")) return null;
  const base = file.slice(0, -4);
  const m = /^(scene|figure)-(.+)$/.exec(base);
  const kind = m?.[1] as SceneAsset["kind"] | undefined;
  const name = m?.[2];
  const list = kind === "scene" ? approved.scenes : kind === "figure" ? approved.figures : [];
  if (!kind || !name || !list.includes(name)) {
    throw new Error(`not an approved scene or figure from src/data/scenes.json: ${file}`);
  }
  return { kind, name };
}

export function iosSceneAssetName(a: SceneAsset): string {
  return `${a.kind === "scene" ? "Scene" : "Figure"}-${a.name}`;
}

function writeImageSet(asset: string, filename: string, bytes: Buffer) {
  const dir = `${ASSETS}/${asset}.imageset`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/${filename}`, bytes);
  writeFileSync(
    `${dir}/Contents.json`,
    JSON.stringify(
      {
        images: [{ filename, idiom: "universal", scale: "1x" }],
        info: { author: "xcode", version: 1 },
      },
      null,
      2,
    ) + "\n",
  );
}

async function main(folder: string) {
  const { default: sharp } = await import("sharp");
  const assets = readdirSync(folder)
    .map(classifyAsset)
    .filter((a): a is SceneAsset => a !== null);
  if (assets.length === 0) throw new Error(`no scene-*.png or figure-*.png files in ${folder}`);
  mkdirSync("public/scenes", { recursive: true });
  mkdirSync("public/figures", { recursive: true });
  for (const a of assets) {
    const src = join(folder, `${a.kind}-${a.name}.png`);
    const ios = iosSceneAssetName(a);
    if (a.kind === "scene") {
      const jpg = await sharp(src)
        .resize({ width: SCENE_WIDTH })
        .jpeg({ quality: 74, mozjpeg: true, progressive: true })
        .toBuffer();
      writeFileSync(`public/scenes/${a.name}.jpg`, jpg);
      writeImageSet(ios, `${ios}.jpg`, jpg);
    } else {
      const trimmed = await sharp(src).ensureAlpha().trim({ threshold: 1 }).toBuffer();
      const png = await sharp(trimmed)
        .resize({ height: FIGURE_HEIGHT })
        .png({ compressionLevel: 9, palette: true, quality: 90, effort: 10 })
        .toBuffer();
      writeFileSync(`public/figures/${a.name}.png`, png);
    }
    console.log(`imported ${a.kind} ${a.name}`);
  }
}

if (import.meta.main) {
  const folder = process.argv[2];
  if (!folder) throw new Error("usage: bun scripts/import-scenes.ts <folder>");
  await main(folder);
}
