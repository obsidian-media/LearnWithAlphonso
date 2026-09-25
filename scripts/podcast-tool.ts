/**
 * Content-authoring CLI for the podcast/audio library (Phase 1a -- see
 * docs/superpowers/specs/2026-09-24-podcast-library-phase1-design.md).
 * Publishes episodes from two sources through one pipeline: an MP3 you
 * recorded (`--file`) or a script spoken by Deepgram (`--script`). They
 * differ only in the `source` column; everything after synthesis --
 * upload, duration measurement, row insert -- is shared.
 *
 * All the real logic (draft validation, storage paths, slug rules, tree
 * cycle detection, script chunking) lives in src/lib/podcast-authoring.ts,
 * src/lib/podcast-tree.ts and src/lib/podcast-tts.ts -- typechecked
 * (tsconfig.json's `include`) and covered by Vitest, unlike this file,
 * which is a thin argv/fs wrapper (scripts/ isn't part of the app bundle
 * or the typecheck include, same as every other script here).
 *
 * Usage (run with bun, which executes TS directly -- no build step):
 *   bun run scripts/podcast-tool.ts folder   --parent <path|root> --slug intro-a1 --title "..." [--course en] [--level A1] [--confirm]
 *   bun run scripts/podcast-tool.ts add      --folder en/a1 --file ./ep1.mp3 --slug ordering-coffee --title "..." [--confirm]
 *   bun run scripts/podcast-tool.ts add      --folder en/a1 --script ./ep1.txt --slug ordering-coffee --title "..." [--voice aura-2-thalia-en] [--confirm]
 *   bun run scripts/podcast-tool.ts validate --folder en/a1 --slug ordering-coffee
 *   bun run scripts/podcast-tool.ts publish  --folder en/a1 --slug ordering-coffee [--confirm]
 *
 * Every command that writes is part of a human-gated pipeline: without
 * `--confirm` it prints what it WOULD do and exits without touching
 * Supabase, same rule scripts/pack-tool.ts applies to `apply`.
 *
 * Credentials: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY and
 * DEEPGRAM_API_KEY come from the environment. Per CLAUDE.md the service
 * role key is resolved through the aws-secrets-manager pattern
 * (`{{resolve:secretsmanager:...}}` with asm-exec) rather than being read
 * or echoed anywhere. Nothing in this file prints a key.
 */
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  exitCodeForProblems,
  formatProblemSummary,
  storagePathFor,
  validateEpisodeDraft,
  type EpisodeDraft,
} from "../src/lib/podcast-authoring";
import { findCycle, isValidSlug, resolveFolderPath } from "../src/lib/podcast-tree";
import { normalizeTranscript } from "../src/lib/podcast-transcript";
import { chunkScript } from "../src/lib/podcast-tts";
import {
  CliArgError,
  parseCliArgs,
  requireIntFlag,
  requireOneOf,
  requireStringFlag,
  type CliFlags,
} from "../src/lib/podcast-cli-args";
import { COURSES } from "../src/data/courses";
import { LEVELS } from "../src/data/levels";

const BUCKET = "podcast-audio";
const DEFAULT_VOICE = "aura-2-thalia-en";

/**
 * Flags this tool understands. The parser rejects anything else by name
 * rather than ignoring it, and rejects a boolean carrying a value rather
 * than treating it as truthy -- see src/lib/podcast-cli-args.ts for the
 * silent dry-run that motivated all of this.
 */
const FLAG_SPEC = {
  booleans: ["confirm"],
  values: [
    "transcript",
    "parent",
    "folder",
    "slug",
    "title",
    "description",
    "course",
    "level",
    "sort",
    "file",
    "script",
    "voice",
  ],
} as const;

const COURSE_IDS = COURSES.map((course) => course.id);
const LEVEL_IDS = LEVELS.map((level) => level.id);

function fail(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function supabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    fail(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set. Resolve the service role key " +
        "through the aws-secrets-manager pattern (see CLAUDE.md); do not paste it on the command line.",
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

type FolderRow = {
  id: string;
  parent_id: string | null;
  slug: string;
  title: string;
  description: string | null;
  sort_order: number;
};

async function loadFolders(db: ReturnType<typeof supabase>) {
  const { data, error } = await db
    .from("podcast_folders")
    .select("id, parent_id, slug, title, description, sort_order");
  if (error) fail(`could not read podcast_folders: ${error.message}`);
  return (data ?? []) as FolderRow[];
}

/** Maps DB rows onto the camelCase shape podcast-tree.ts works in. */
function toFolders(rows: FolderRow[]) {
  return rows.map((row) => ({
    id: row.id,
    parentId: row.parent_id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    sortOrder: row.sort_order,
  }));
}

function splitPath(value: string): string[] {
  return value.split("/").filter(Boolean);
}

/**
 * Joins per-chunk MP3s into one episode.
 *
 * Byte concatenation of MP3 frames is the default and generally plays,
 * but can report an unreliable duration and seek badly. The spec's open
 * question parks a probe against real Deepgram output to settle it; this
 * is the single seam that changes if the probe says otherwise (the
 * fallback is `ffmpeg -f concat` on the authoring machine). Keeping it
 * one function is deliberate.
 */
function joinMp3Chunks(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.length;
  }
  return joined;
}

async function synthesise(script: string, voice: string): Promise<Uint8Array> {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) fail("DEEPGRAM_API_KEY must be set to synthesise a script.");
  const pieces = chunkScript(script);
  if (pieces.length === 0) fail("the script file is empty.");
  console.log(`  synthesising ${pieces.length} chunk(s) with ${voice}...`);

  const audio: Uint8Array[] = [];
  for (const [index, piece] of pieces.entries()) {
    const response = await fetch(
      `https://api.deepgram.com/v1/speak?model=${encodeURIComponent(voice)}&encoding=mp3`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Token ${key}` },
        body: JSON.stringify({ text: piece }),
      },
    );
    if (!response.ok) {
      fail(`Deepgram returned ${response.status} on chunk ${index + 1}/${pieces.length}.`);
    }
    audio.push(new Uint8Array(await response.arrayBuffer()));
  }
  return joinMp3Chunks(audio);
}

async function durationSecondsOf(audio: Uint8Array): Promise<number> {
  // Imported here rather than at module scope on purpose. A top-level import
  // makes EVERY command die with "Cannot find package 'music-metadata'" when
  // node_modules is stale -- including folder, validate and publish, none of
  // which read audio. That happened during the first real publish, and it
  // misdirects badly: the failure names an audio library while you are
  // creating a folder. It fails at import so there is no partial state, but
  // the message sends you the wrong way.
  let parseBuffer: typeof import("music-metadata").parseBuffer;
  try {
    ({ parseBuffer } = await import("music-metadata"));
  } catch {
    fail(
      "music-metadata is required to read an episode's duration. Run `bun install` and " +
        "try again -- only `add` needs it.",
    );
  }

  const metadata = await parseBuffer(audio, { mimeType: "audio/mpeg" });
  const duration = metadata.format.duration;
  // duration_seconds drives the player's scrubber, so a missing or zero
  // value is a hard failure rather than something to paper over with 0.
  if (!duration || duration <= 0) {
    fail("could not read a duration from the audio -- refusing to insert a row without one.");
  }
  return Math.round(duration);
}

async function cmdFolder(flags: CliFlags) {
  const slug = requireStringFlag(flags, "slug", "e.g. --slug a1");
  const title = requireStringFlag(flags, "title", 'e.g. --title "A1 Beginner"');
  const parent = (flags.parent as string | undefined) ?? "root";
  if (!isValidSlug(slug)) fail(`invalid slug "${slug}": use lowercase kebab-case.`);

  // Validate every flag BEFORE touching credentials or the network. A typo'd
  // --sort or --course should fail on the typo, not on a missing key, and
  // certainly not after a partial write.
  const course = requireOneOf(flags, "course", COURSE_IDS);
  const levelId = requireOneOf(flags, "level", LEVEL_IDS);
  const sortOrder = requireIntFlag(flags, "sort", 0);

  const db = supabase();
  const rows = await loadFolders(db);
  const folders = toFolders(rows);

  let parentId: string | null = null;
  if (parent !== "root") {
    const resolved = resolveFolderPath(folders, splitPath(parent));
    if (!resolved) fail(`parent folder path "${parent}" does not exist.`);
    parentId = resolved.id;
  }

  if (folders.some((folder) => folder.parentId === parentId && folder.slug === slug)) {
    fail(`a folder "${slug}" already exists under ${parent}.`);
  }

  // Validate the tree the write WOULD produce, before writing it: a
  // folder that becomes its own ancestor makes rendering infinite-loop,
  // and no CHECK constraint can catch that.
  const cycle = findCycle([
    ...folders,
    { id: "pending", parentId, slug, title, description: null, sortOrder: 0 },
  ]);
  if (cycle) fail(`that parent would create a cycle: ${cycle.join(" -> ")}`);

  if (flags.confirm !== true) {
    console.log(`Dry run. Would create folder "${slug}" (${title}) under ${parent}.`);
    console.log("Re-run with --confirm to write it.");
    return;
  }

  const { error } = await db.from("podcast_folders").insert({
    parent_id: parentId,
    slug,
    title,
    description: (flags.description as string | undefined) ?? null,
    course,
    level_id: levelId,
    sort_order: sortOrder,
  });
  if (error) fail(`insert failed: ${error.message}`);
  console.log(`Created folder ${parent === "root" ? "" : `${parent}/`}${slug}.`);
}

async function cmdAdd(flags: CliFlags) {
  const folderPath = requireStringFlag(flags, "folder", "e.g. --folder en/a1");
  const slug = requireStringFlag(flags, "slug", "e.g. --slug ordering-coffee");
  const title = requireStringFlag(flags, "title", 'e.g. --title "Ordering Coffee"');
  const file = (flags.file as string | undefined) ?? null;
  const script = (flags.script as string | undefined) ?? null;
  if (!file && !script) fail("pass either --file <mp3> or --script <txt>.");
  if (file && script) fail("pass --file or --script, not both.");

  // Read and validate the transcript up front, before credentials, the
  // upload or any synthesis: a typo'd path or an empty file should cost
  // nothing, not surface after a multi-megabyte upload has already landed.
  let transcriptText: string | null = null;
  const transcriptPath = flags.transcript as string | undefined;
  if (transcriptPath) {
    if (!existsSync(transcriptPath)) fail(`transcript file not found: ${transcriptPath}`);
    transcriptText = normalizeTranscript(readFileSync(transcriptPath, "utf-8"));
    if (transcriptText === null) fail(`${transcriptPath} has no text in it.`);
  }

  const db = supabase();
  const folders = toFolders(await loadFolders(db));
  const folder = resolveFolderPath(folders, splitPath(folderPath));
  if (!folder) fail(`folder path "${folderPath}" does not exist. Create it with \`folder\` first.`);

  const { data: siblings, error: siblingError } = await db
    .from("podcast_episodes")
    .select("slug")
    .eq("folder_id", folder.id);
  if (siblingError) fail(`could not read existing episodes: ${siblingError.message}`);

  const draft: EpisodeDraft = {
    folderSlugPath: splitPath(folderPath),
    slug,
    title,
    description: (flags.description as string | undefined) ?? null,
    source: script ? "tts" : "upload",
    course: requireOneOf(flags, "course", COURSE_IDS) as EpisodeDraft["course"],
    levelId: requireOneOf(flags, "level", LEVEL_IDS),
  };

  const problems = validateEpisodeDraft(
    draft,
    (siblings ?? []).map((row: { slug: string }) => row.slug),
  );
  if (problems.length > 0) {
    for (const problem of problems) console.error(`  [ERROR] ${problem}`);
    process.exit(1);
  }

  let audio: Uint8Array;
  if (file) {
    if (!existsSync(file)) fail(`file not found: ${file}`);
    audio = new Uint8Array(readFileSync(file));
  } else {
    if (!existsSync(script!)) fail(`script not found: ${script}`);
    audio = await synthesise(
      readFileSync(script!, "utf-8"),
      (flags.voice as string | undefined) ?? DEFAULT_VOICE,
    );
  }

  const duration = await durationSecondsOf(audio);
  const objectPath = storagePathFor(draft);

  if (flags.confirm !== true) {
    console.log(`Dry run. Would upload ${audio.length} bytes to ${BUCKET}/${objectPath}`);
    console.log(
      `  and insert episode "${slug}" (${duration}s, source=${draft.source}, unpublished).`,
    );
    console.log("Re-run with --confirm to write it.");
    return;
  }

  const upload = await db.storage
    .from(BUCKET)
    .upload(objectPath, audio, { contentType: "audio/mpeg", upsert: false });
  if (upload.error) fail(`upload failed: ${upload.error.message}`);

  // Ordering matters: the object is uploaded and verified before the row
  // exists, so a failure here leaves an orphan rather than a row pointing
  // at nothing. Name the orphan explicitly -- a silent partial state is
  // the one outcome worth ruling out.
  const { error } = await db.from("podcast_episodes").insert({
    folder_id: folder.id,
    slug,
    title,
    description: draft.description,
    audio_path: objectPath,
    duration_seconds: duration,
    course: draft.course,
    level_id: draft.levelId,
    source: draft.source,
    published: false,
  });
  if (error) {
    console.error(`Error: upload succeeded but the database insert failed: ${error.message}`);
    console.error(`Orphaned object: ${BUCKET}/${objectPath}`);
    console.error("Retry the insert or delete that object before re-running.");
    process.exit(1);
  }

  console.log(`Added "${title}" (${duration}s) at ${objectPath}. It is NOT published yet.`);

  // The transcript is attached after the episode row exists, because it is
  // keyed by episode id. A failure here leaves a perfectly good episode with
  // no transcript rather than rolling back the upload -- so it reports what
  // to re-run instead of pretending the whole command failed.
  const transcriptFile = flags.transcript as string | undefined;
  if (transcriptFile) {
    const { data: inserted, error: lookupError } = await db
      .from("podcast_episodes")
      .select("id")
      .eq("folder_id", folder.id)
      .eq("slug", slug)
      .maybeSingle();
    const episodeID = (inserted as { id: string } | null)?.id;
    if (lookupError || !episodeID) {
      console.error("Episode saved, but its id could not be read back to attach the transcript.");
      console.error(
        `Attach it with: transcript --folder ${folderPath} --slug ${slug} --transcript ${transcriptFile} --confirm`,
      );
    } else {
      const { error: transcriptError } = await db
        .from("podcast_transcripts")
        .upsert(
          { episode_id: episodeID, text: transcriptText, updated_at: new Date().toISOString() },
          { onConflict: "episode_id" },
        );
      if (transcriptError) {
        console.error(`Episode saved, but the transcript did not: ${transcriptError.message}`);
        console.error(
          `Attach it with: transcript --folder ${folderPath} --slug ${slug} --transcript ${transcriptFile} --confirm`,
        );
      } else {
        console.log("  transcript attached.");
      }
    }
  } else {
    // Said plainly rather than left silent: an episode without a transcript
    // is inaccessible to deaf and hard-of-hearing learners, which is a
    // property of the content, not a preference.
    console.log("  no transcript -- this episode is not accessible to deaf learners yet.");
  }

  console.log(`Publish it with: publish --folder ${folderPath} --slug ${slug} --confirm`);
}

async function cmdValidate(flags: CliFlags) {
  const folderPath = requireStringFlag(flags, "folder", "e.g. --folder en/a1");
  const slug = requireStringFlag(flags, "slug", "e.g. --slug ordering-coffee");

  const db = supabase();
  const folders = toFolders(await loadFolders(db));

  // Collected, not just printed. This command used to report every finding
  // to stderr and then exit 0, so a script, a CI step or an `&&` chain read
  // a clean run while the output said otherwise -- the same failure the
  // repo's curriculum-consistency.test.ts had from the other direction.
  const problems: string[] = [];

  const cycle = findCycle(folders);
  if (cycle) problems.push(`folder tree contains a cycle: ${cycle.join(" -> ")}`);

  const folder = resolveFolderPath(folders, splitPath(folderPath));
  if (!folder) fail(`folder path "${folderPath}" does not exist.`);

  const { data, error } = await db
    .from("podcast_episodes")
    .select("slug, title, duration_seconds, audio_path, published, source")
    .eq("folder_id", folder.id)
    .eq("slug", slug)
    .maybeSingle();
  if (error) fail(`could not read the episode: ${error.message}`);
  if (!data) fail(`no episode "${slug}" in ${folderPath}.`);

  const episode = data as {
    slug: string;
    title: string;
    duration_seconds: number;
    audio_path: string;
    published: boolean;
    source: string;
  };
  console.log(`${episode.title} (${episode.slug})`);
  console.log(`  source:    ${episode.source}`);
  console.log(`  duration:  ${episode.duration_seconds}s`);
  console.log(`  audio:     ${BUCKET}/${episode.audio_path}`);
  console.log(`  published: ${episode.published ? "yes" : "no"}`);

  // list() on the object's prefix, not download() -- the latter pulls the
  // whole multi-megabyte MP3 across the network just to throw it away.
  const lastSlash = episode.audio_path.lastIndexOf("/");
  const prefix = lastSlash === -1 ? "" : episode.audio_path.slice(0, lastSlash);
  const name = episode.audio_path.slice(lastSlash + 1);
  const { data: objects, error: listError } = await db.storage
    .from(BUCKET)
    .list(prefix, { search: name });
  if (listError) {
    problems.push(`could not check the audio object: ${listError.message}`);
  } else if (!objects?.some((object) => object.name === name)) {
    problems.push(`audio object is missing: ${episode.audio_path}`);
  } else {
    console.log("  audio object exists.");
  }

  // An unpublished episode is not a problem -- `published` is a staging flag
  // -- but it IS the most common reason someone cannot see an episode they
  // just added, so say it plainly rather than leaving it in the detail above.
  if (!episode.published) {
    console.log("  note: not published yet, so learners cannot see it.");
  }

  for (const problem of problems) console.error(`  [ERROR] ${problem}`);
  const summary = formatProblemSummary(problems);
  if (summary) console.error(summary);
  // The point of the change: findings reach the exit code.
  process.exit(exitCodeForProblems(problems));
}

async function cmdPublish(flags: CliFlags) {
  const folderPath = requireStringFlag(flags, "folder", "e.g. --folder en/a1");
  const slug = requireStringFlag(flags, "slug", "e.g. --slug ordering-coffee");

  const db = supabase();
  const folders = toFolders(await loadFolders(db));
  const folder = resolveFolderPath(folders, splitPath(folderPath));
  if (!folder) fail(`folder path "${folderPath}" does not exist.`);

  if (flags.confirm !== true) {
    console.log(`Dry run. Would publish "${slug}" in ${folderPath}.`);
    console.log("Re-run with --confirm to write it.");
    return;
  }

  const { data, error } = await db
    .from("podcast_episodes")
    .update({ published: true, published_at: new Date().toISOString() })
    .eq("folder_id", folder.id)
    .eq("slug", slug)
    .select("slug");
  if (error) fail(`publish failed: ${error.message}`);
  if (!data || data.length === 0) fail(`no episode "${slug}" in ${folderPath}.`);
  console.log(`Published ${folderPath}/${slug}.`);
}

/**
 * Attaches or replaces an episode's transcript.
 *
 * A separate command as well as an `add --transcript` flag, because episodes
 * published before Phase 2a already exist and need one -- including episode
 * 1, whose transcript is word-perfect because the audio was generated from
 * it.
 *
 * Deliberately independent of `source`. Episode 1 is source='upload' (the MP3
 * came from ElevenLabs, outside this tool), so keying transcripts off source
 * would have excluded the one episode that already had a perfect one.
 */
async function cmdTranscript(flags: CliFlags) {
  const folderPath = requireStringFlag(flags, "folder", "e.g. --folder en/a1");
  const slug = requireStringFlag(flags, "slug", "e.g. --slug ordering-coffee");
  const file = requireStringFlag(flags, "transcript", "e.g. --transcript ./ep01.txt");

  if (!existsSync(file)) fail(`transcript file not found: ${file}`);
  const text = normalizeTranscript(readFileSync(file, "utf-8"));
  if (text === null) fail(`${file} has no text in it.`);

  const db = supabase();
  const folders = toFolders(await loadFolders(db));
  const folder = resolveFolderPath(folders, splitPath(folderPath));
  if (!folder) fail(`folder path "${folderPath}" does not exist.`);

  const { data: episode, error: episodeError } = await db
    .from("podcast_episodes")
    .select("id")
    .eq("folder_id", folder.id)
    .eq("slug", slug)
    .maybeSingle();
  if (episodeError) fail(`could not read the episode: ${episodeError.message}`);
  if (!episode) fail(`no episode "${slug}" in ${folderPath}.`);
  const episodeID = (episode as { id: string }).id;

  const words = text.split(/\s+/).length;
  if (flags.confirm !== true) {
    console.log(`Dry run. Would attach a ${words}-word transcript to ${folderPath}/${slug}.`);
    console.log("Re-run with --confirm to write it.");
    return;
  }

  const { error } = await db
    .from("podcast_transcripts")
    .upsert(
      { episode_id: episodeID, text, updated_at: new Date().toISOString() },
      { onConflict: "episode_id" },
    );
  if (error) fail(`could not save the transcript: ${error.message}`);
  console.log(`Attached a ${words}-word transcript to ${folderPath}/${slug}.`);
}

const USAGE = `usage:
  podcast-tool.ts folder     --parent <path|root> --slug <slug> --title <title> [--course en] [--level A1] [--confirm]
  podcast-tool.ts add        --folder <path> --slug <slug> --title <title> (--file <mp3> | --script <txt>) [--transcript <txt>] [--voice <model>] [--confirm]
  podcast-tool.ts transcript --folder <path> --slug <slug> --transcript <txt> [--confirm]
  podcast-tool.ts validate   --folder <path> --slug <slug>
  podcast-tool.ts publish    --folder <path> --slug <slug> [--confirm]`;

async function main() {
  const { command, flags } = parseCliArgs(process.argv.slice(2), FLAG_SPEC);
  switch (command) {
    case "folder":
      await cmdFolder(flags);
      break;
    case "add":
      await cmdAdd(flags);
      break;
    case "transcript":
      await cmdTranscript(flags);
      break;
    case "validate":
      await cmdValidate(flags);
      break;
    case "publish":
      await cmdPublish(flags);
      break;
    default:
      console.log(USAGE);
      process.exit(command ? 1 : 0);
  }
}

main().catch((error: unknown) => {
  // A CliArgError is the operator's typo, not a crash: print the message
  // it carries, which already names the flag and what to type instead.
  if (error instanceof CliArgError) fail(error.message);
  fail(error instanceof Error ? error.message : String(error));
});
