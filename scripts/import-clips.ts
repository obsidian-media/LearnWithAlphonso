/**
 * Imports the approved scene clips into the app.
 *
 *   bun scripts/import-clips.ts <folder of clip-<name>.mp4>
 *
 * Names must be listed under "clips" in src/data/scenes.json. Needs ffmpeg on the PATH. Writes:
 *   - web: public/clips/<name>.mp4 (720x1280 H.264, no sound, fast start) and public/clips/<name>.jpg (first frame)
 *   - iPhone: the data asset Clip-<name> (the same mp4) and the image set Clip-<name>-poster (the first frame)
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ASSETS = "ios/LearnWithAlphonso/Sources/Assets.xcassets";

const approved = (JSON.parse(readFileSync("src/data/scenes.json", "utf8")) as { clips: string[] })
  .clips;

/** "clip-learn.mp4" -> "learn"; anything that is not an mp4 is skipped; an mp4 with an unapproved name is an error. */
export function clipName(file: string): string | null {
  if (!file.endsWith(".mp4")) return null;
  const m = /^clip-(.+)\.mp4$/.exec(file);
  if (!m || !approved.includes(m[1])) {
    throw new Error(`not an approved clip from src/data/scenes.json: ${file}`);
  }
  return m[1];
}

function ffmpeg(args: string[]) {
  execFileSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: "inherit" });
}

function writeContents(dir: string, body: object) {
  writeFileSync(`${dir}/Contents.json`, JSON.stringify(body, null, 2) + "\n");
}

function main(folder: string) {
  mkdirSync("public/clips", { recursive: true });
  for (const file of readdirSync(folder)) {
    const name = clipName(file);
    if (!name) continue;
    const mp4 = `public/clips/${name}.mp4`;
    const jpg = `public/clips/${name}.jpg`;
    ffmpeg([
      "-i",
      join(folder, file),
      "-an",
      "-vf",
      "scale=720:1280,format=yuv420p",
      "-c:v",
      "libx264",
      "-profile:v",
      "high",
      "-crf",
      "27",
      "-preset",
      "slow",
      "-movflags",
      "+faststart",
      mp4,
    ]);
    ffmpeg(["-i", mp4, "-frames:v", "1", "-q:v", "4", jpg]);

    const data = `${ASSETS}/Clip-${name}.dataset`;
    mkdirSync(data, { recursive: true });
    writeFileSync(`${data}/clip-${name}.mp4`, readFileSync(mp4));
    writeContents(data, {
      data: [
        {
          filename: `clip-${name}.mp4`,
          idiom: "universal",
          "universal-type-identifier": "public.mpeg-4",
        },
      ],
      info: { author: "xcode", version: 1 },
    });
    const poster = `${ASSETS}/Clip-${name}-poster.imageset`;
    mkdirSync(poster, { recursive: true });
    writeFileSync(`${poster}/clip-${name}.jpg`, readFileSync(jpg));
    writeContents(poster, {
      images: [{ filename: `clip-${name}.jpg`, idiom: "universal", scale: "1x" }],
      info: { author: "xcode", version: 1 },
    });
    console.log(`imported clip ${name}`);
  }
}

if (import.meta.main) {
  const folder = process.argv[2];
  if (!folder) throw new Error("usage: bun scripts/import-clips.ts <folder>");
  main(folder);
}
