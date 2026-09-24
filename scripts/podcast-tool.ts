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
import { parseBuffer } from "music-metadata";
import {
  storagePathFor,
  validateEpisodeDraft,
  type EpisodeDraft,
} from "../src/lib/podcast-authoring";
import { findCycle, isValidSlug, resolveFolderPath } from "../src/lib/podcast-tree";
import { chunkScript } from "../src/lib/podcast-tts";

const BUCKET = "podcast-audio";
const DEFAULT_VOICE = "aura-2-thalia-en";

type Flags = Record<string, string | boolean>;

/** Tiny argv parser: `<command> [--flag [value]]...` -- no dependency needed for a 5-command CLI. */
function parseArgs(argv: string[]): { command?: string; flags: Flags } {
  const [command, ...rest] = argv;
  const flags: Flags = {};
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = rest[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags[key] = next;
      i++;
    } else {
      flags[key] = true;
    }
  }
  return { command, flags };
}

function fail(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function requireString(flags: Flags, key: string, hint: string): string {
  const value = flags[key];
  if (typeof value !== "string" || !value) fail(`--${key} is required (${hint})`);
  return value;
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
  const metadata = await parseBuffer(audio, { mimeType: "audio/mpeg" });
  const duration = metadata.format.duration;
  // duration_seconds drives the player's scrubber, so a missing or zero
  // value is a hard failure rather than something to paper over with 0.
  if (!duration || duration <= 0) {
    fail("could not read a duration from the audio -- refusing to insert a row without one.");
  }
  return Math.round(duration);
}

async function cmdFolder(flags: Flags) {
  const slug = requireString(flags, "slug", "e.g. --slug a1");
  const title = requireString(flags, "title", 'e.g. --title "A1 Beginner"');
  const parent = typeof flags.parent === "string" ? flags.parent : "root";
  if (!isValidSlug(slug)) fail(`invalid slug "${slug}": use lowercase kebab-case.`);

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
    description: typeof flags.description === "string" ? flags.description : null,
    course: typeof flags.course === "string" ? flags.course : null,
    level_id: typeof flags.level === "string" ? flags.level : null,
    sort_order: typeof flags.sort === "string" ? Number(flags.sort) : 0,
  });
  if (error) fail(`insert failed: ${error.message}`);
  console.log(`Created folder ${parent === "root" ? "" : `${parent}/`}${slug}.`);
}

async function cmdAdd(flags: Flags) {
  const folderPath = requireString(flags, "folder", "e.g. --folder en/a1");
  const slug = requireString(flags, "slug", "e.g. --slug ordering-coffee");
  const title = requireString(flags, "title", 'e.g. --title "Ordering Coffee"');
  const file = typeof flags.file === "string" ? flags.file : null;
  const script = typeof flags.script === "string" ? flags.script : null;
  if (!file && !script) fail("pass either --file <mp3> or --script <txt>.");
  if (file && script) fail("pass --file or --script, not both.");

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
    description: typeof flags.description === "string" ? flags.description : null,
    source: script ? "tts" : "upload",
    course: (typeof flags.course === "string" ? flags.course : null) as EpisodeDraft["course"],
    levelId: typeof flags.level === "string" ? flags.level : null,
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
      typeof flags.voice === "string" ? flags.voice : DEFAULT_VOICE,
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
  console.log(`Publish it with: publish --folder ${folderPath} --slug ${slug} --confirm`);
}

async function cmdValidate(flags: Flags) {
  const folderPath = requireString(flags, "folder", "e.g. --folder en/a1");
  const slug = requireString(flags, "slug", "e.g. --slug ordering-coffee");

  const db = supabase();
  const folders = toFolders(await loadFolders(db));

  const cycle = findCycle(folders);
  if (cycle) console.error(`  [ERROR] folder tree contains a cycle: ${cycle.join(" -> ")}`);

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
  if (listError) console.error(`  [ERROR] could not check the audio object: ${listError.message}`);
  else if (!objects?.some((object) => object.name === name)) {
    console.error(`  [ERROR] audio object is missing: ${episode.audio_path}`);
  } else console.log("  audio object exists.");
}

async function cmdPublish(flags: Flags) {
  const folderPath = requireString(flags, "folder", "e.g. --folder en/a1");
  const slug = requireString(flags, "slug", "e.g. --slug ordering-coffee");

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

const USAGE = `usage:
  podcast-tool.ts folder   --parent <path|root> --slug <slug> --title <title> [--course en] [--level A1] [--confirm]
  podcast-tool.ts add      --folder <path> --slug <slug> --title <title> (--file <mp3> | --script <txt>) [--voice <model>] [--confirm]
  podcast-tool.ts validate --folder <path> --slug <slug>
  podcast-tool.ts publish  --folder <path> --slug <slug> [--confirm]`;

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));
  switch (command) {
    case "folder":
      await cmdFolder(flags);
      break;
    case "add":
      await cmdAdd(flags);
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
  fail(error instanceof Error ? error.message : String(error));
});
