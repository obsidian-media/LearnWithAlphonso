/**
 * Owner-run uploader for the Library's Watch shelf (Alphonso tutor videos). Mirrors scripts/podcast-tool.ts: all the
 * real logic (slug and path rules, tag and practice-target parsing, file sniffing, the row, the publish checks) is in
 * src/lib/video-authoring.ts, typechecked and covered by Vitest; this file is the argv / fs / network wrapper.
 *
 * Run it from Git Bash with bun (bun is a Bash shim on this machine; PowerShell cannot run it):
 *   bun run scripts/video-tool.ts add       --file ./en-x.mp4 --poster ./en-x.jpg --captions ./en-x.en.vtt --course en --slug en-x --title "..." [--description "..."] [--level A1] [--tags food,travel] [--practice lesson:u3l2] [--sort 0] [--confirm]
 *   bun run scripts/video-tool.ts publish   --slug en-x [--confirm]
 *   bun run scripts/video-tool.ts unpublish --slug en-x [--confirm]
 *
 * `add` uploads the mp4, the poster and the WebVTT captions to the public `videos` bucket and upserts the `videos` row
 * UNPUBLISHED. `publish` is a separate step: it refuses a video without captions or with a missing object. Without
 * --confirm every command prints what it WOULD do and touches nothing.
 *
 * Credentials: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the environment, or, when unset, read from the owner's
 * ~/.alphonso-secrets/podcast.env (only those two names are picked out of it; nothing is printed). The service-role key
 * is the owner's: nobody else runs this tool against production.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  CliArgError,
  parseCliArgs,
  requireIntFlag,
  requireOneOf,
  requireStringFlag,
  type CliFlags,
} from "../src/lib/podcast-cli-args";
import {
  buildVideoRow,
  isLikelyJpeg,
  isLikelyMp4,
  isLikelyVtt,
  MAX_VIDEO_BYTES,
  parsePracticeTarget,
  parseTags,
  pickEnv,
  publishProblems,
  validateVideoDraft,
  VIDEO_BUCKET,
  VIDEO_COURSES,
  videoStoragePaths,
  type StoredVideo,
  type VideoDraft,
} from "../src/lib/video-authoring";
import { LEVELS } from "../src/data/levels";

const FLAG_SPEC = {
  booleans: ["confirm"],
  values: [
    "file",
    "poster",
    "captions",
    "course",
    "slug",
    "title",
    "description",
    "level",
    "tags",
    "practice",
    "sort",
  ],
} as const;

const LEVEL_IDS = LEVELS.map((level) => level.id);

function fail(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function loadEnv() {
  const wanted = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;
  if (wanted.every((name) => process.env[name])) return;
  const file = join(homedir(), ".alphonso-secrets", "podcast.env");
  if (!existsSync(file)) return;
  const found = pickEnv(readFileSync(file, "utf-8"), wanted);
  for (const name of wanted) if (!process.env[name] && found[name]) process.env[name] = found[name];
}

function supabase() {
  loadEnv();
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    fail(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (in the environment or in ~/.alphonso-secrets/podcast.env). " +
        "Do not paste the key on the command line.",
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

async function mp4DurationSeconds(bytes: Uint8Array): Promise<number> {
  let parseBuffer: typeof import("music-metadata").parseBuffer;
  try {
    ({ parseBuffer } = await import("music-metadata"));
  } catch {
    fail("music-metadata is required to read the duration. Run `bun install` and try again.");
  }
  const metadata = await parseBuffer(bytes, { mimeType: "video/mp4" });
  return Math.round(metadata.format.duration ?? 0);
}

function readChecked(path: string, what: string): Uint8Array {
  if (!existsSync(path)) fail(`${what} not found: ${path}`);
  return new Uint8Array(readFileSync(path));
}

async function cmdAdd(flags: CliFlags) {
  const slug = requireStringFlag(flags, "slug", "e.g. --slug en-id-like-vs-i-want");
  const title = requireStringFlag(flags, "title", 'e.g. --title "I\'d like vs I want"');
  const course = requireOneOf(flags, "course", VIDEO_COURSES);
  const levelId = requireOneOf(flags, "level", LEVEL_IDS);
  const sortOrder = requireIntFlag(flags, "sort", 0);
  const filePath = requireStringFlag(flags, "file", "the .mp4");
  const posterPath = requireStringFlag(flags, "poster", "the poster .jpg");
  const captionsPath = requireStringFlag(
    flags,
    "captions",
    "the WebVTT .vtt: videos are never published without captions",
  );

  let tags: string[];
  let practice: VideoDraft["practice"] = null;
  try {
    tags = parseTags(flags.tags as string | undefined);
    if (typeof flags.practice === "string") practice = parsePracticeTarget(flags.practice);
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }

  // Every file is read and sniffed BEFORE credentials or the network: a wrong file costs nothing.
  const video = readChecked(filePath, "video");
  if (!isLikelyMp4(video))
    fail(`${basename(filePath)} does not look like an MP4. Transcode it first.`);
  if (video.length > MAX_VIDEO_BYTES)
    fail(
      `${basename(filePath)} is ${video.length} bytes; the bucket accepts at most ${MAX_VIDEO_BYTES}.`,
    );
  const poster = readChecked(posterPath, "poster");
  if (!isLikelyJpeg(poster)) fail(`${basename(posterPath)} does not look like a JPEG.`);
  const captionsText = readFileSync(
    existsSync(captionsPath) ? captionsPath : fail(`captions not found: ${captionsPath}`),
    "utf-8",
  );
  if (!isLikelyVtt(captionsText))
    fail(`${basename(captionsPath)} is not WebVTT (it must start with WEBVTT and hold cues).`);

  const draft: VideoDraft = {
    slug,
    course,
    title,
    description: (flags.description as string | undefined) ?? null,
    levelId,
    durationSeconds: await mp4DurationSeconds(video),
    tags,
    practice,
    sortOrder,
  };
  const problems = validateVideoDraft(draft, LEVEL_IDS);
  if (problems.length > 0) {
    for (const problem of problems) console.error(`  [ERROR] ${problem}`);
    process.exit(1);
  }

  const paths = videoStoragePaths(draft.course!, slug);
  if (flags.confirm !== true) {
    console.log(
      `Dry run. Would upload ${video.length} bytes to ${VIDEO_BUCKET}/${paths.video}, the poster to ${paths.poster} and the captions to ${paths.captions},`,
    );
    console.log(
      `  and upsert video "${slug}" (${draft.durationSeconds}s, course=${course}, level=${levelId ?? "none"}, tags=[${tags.join(", ")}], practice=${practice ? `${practice.kind}:${practice.id}` : "none"}, UNPUBLISHED).`,
    );
    console.log("Re-run with --confirm to write it.");
    return;
  }

  const db = supabase();
  const uploads: [string, Uint8Array | string, string][] = [
    [paths.video, video, "video/mp4"],
    [paths.poster, poster, "image/jpeg"],
    [paths.captions, captionsText, "text/vtt"],
  ];
  for (const [objectPath, body, contentType] of uploads) {
    const { error } = await db.storage
      .from(VIDEO_BUCKET)
      .upload(objectPath, body, { contentType, upsert: true });
    if (error) fail(`upload of ${objectPath} failed: ${error.message}. No row was written.`);
  }
  // Objects first, row second: a failure here leaves orphan files, never a row pointing at nothing.
  const { error } = await db.from("videos").upsert(buildVideoRow(draft), { onConflict: "slug" });
  if (error) {
    console.error(`Error: the uploads succeeded but the database upsert failed: ${error.message}`);
    console.error(`Orphaned objects: ${paths.video}, ${paths.poster}, ${paths.captions}`);
    process.exit(1);
  }
  console.log(`Added "${title}" (${draft.durationSeconds}s). It is NOT published yet.`);
  console.log(`Publish it with: publish --slug ${slug} --confirm`);
}

async function loadVideo(
  db: ReturnType<typeof supabase>,
  slug: string,
): Promise<StoredVideo & { course: string }> {
  const { data, error } = await db
    .from("videos")
    .select("slug, course, published, video_path, poster_path, captions_path")
    .eq("slug", slug)
    .maybeSingle();
  if (error) fail(`could not read the video: ${error.message}`);
  if (!data) fail(`no video "${slug}". Add it first.`);
  return data as StoredVideo & { course: string };
}

async function cmdPublish(flags: CliFlags, publish: boolean) {
  const slug = requireStringFlag(flags, "slug", "e.g. --slug en-id-like-vs-i-want");
  const db = supabase();
  const row = await loadVideo(db, slug);

  if (publish) {
    const { data: listed, error: listError } = await db.storage
      .from(VIDEO_BUCKET)
      .list(row.course, { limit: 1000 });
    if (listError) fail(`could not list the bucket: ${listError.message}`);
    const existing = (listed ?? []).map((o: { name: string }) => `${row.course}/${o.name}`);
    const problems = publishProblems(row, existing);
    if (problems.length > 0) {
      for (const problem of problems) console.error(`  [ERROR] ${problem}`);
      process.exit(1);
    }
  }
  if (row.published === publish) {
    console.log(`"${slug}" is already ${publish ? "published" : "unpublished"}. Nothing to do.`);
    return;
  }
  if (flags.confirm !== true) {
    console.log(`Dry run. Would ${publish ? "publish" : "unpublish"} "${slug}".`);
    console.log("Re-run with --confirm to write it.");
    return;
  }
  const { error } = await db
    .from("videos")
    .update({ published: publish, published_at: publish ? new Date().toISOString() : null })
    .eq("slug", slug);
  if (error) fail(`${publish ? "publish" : "unpublish"} failed: ${error.message}`);
  console.log(`${publish ? "Published" : "Unpublished"} "${slug}".`);
  if (!publish)
    console.log("The files stay in the public bucket: unpublishing hides the row, not the file.");
}

const USAGE = `usage:
  video-tool.ts add       --file <mp4> --poster <jpg> --captions <vtt> --course <en|fr|es> --slug <slug> --title <title> [--description <text>] [--level A1] [--tags a,b] [--practice <lesson|talk|campaign>:<id>] [--sort 0] [--confirm]
  video-tool.ts publish   --slug <slug> [--confirm]
  video-tool.ts unpublish --slug <slug> [--confirm]`;

async function main() {
  const { command, flags } = parseCliArgs(process.argv.slice(2), FLAG_SPEC);
  switch (command) {
    case "add":
      await cmdAdd(flags);
      break;
    case "publish":
      await cmdPublish(flags, true);
      break;
    case "unpublish":
      await cmdPublish(flags, false);
      break;
    default:
      console.log(USAGE);
      process.exit(command ? 1 : 0);
  }
}

main().catch((error: unknown) => {
  if (error instanceof CliArgError) fail(error.message);
  fail(error instanceof Error ? error.message : String(error));
});
