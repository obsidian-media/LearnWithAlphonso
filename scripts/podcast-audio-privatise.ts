/**
 * One-off: moves podcast audio that is NOT published out of the public `podcast-audio` bucket into the private
 * `podcast-audio-drafts` bucket (docs/OPEN-ITEMS.md item 29a). Run it once, after migration
 * 20261128120000_podcast_audio_drafts_bucket.sql is applied. Safe to re-run: it only touches what is still public.
 *
 *   bun run scripts/podcast-audio-privatise.ts            (dry run: lists what would move)
 *   bun run scripts/podcast-audio-privatise.ts --confirm  (copies, checks the copy, then removes the public one)
 *
 * Moves every object of the public bucket that no PUBLISHED episode points at, except `stories/` (narration, public
 * by design). That includes unpublished episodes and orphans with no episode row.
 *
 * Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment (resolve the key through asm-exec, never on the
 * command line). Nothing here prints a key.
 */
import { createClient } from "@supabase/supabase-js";
import {
  DRAFT_AUDIO_BUCKET,
  objectsToMakePrivate,
  PUBLIC_AUDIO_BUCKET,
} from "../src/lib/podcast-audio-buckets";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  process.exit(1);
}
const confirm = process.argv.includes("--confirm");
const db = createClient(url, key, { auth: { persistSession: false } });

/** Every object path in a bucket, walking folders (storage lists one level at a time). */
async function listAll(bucket: string, prefix = ""): Promise<string[]> {
  const out: string[] = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await db.storage.from(bucket).list(prefix, { limit: 100, offset });
    if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const entry of data) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) out.push(...(await listAll(bucket, path)));
      else out.push(path);
    }
    if (data.length < 100) break;
  }
  return out;
}

const { data: published, error: pubError } = await db
  .from("podcast_episodes")
  .select("audio_path")
  .eq("published", true);
if (pubError) {
  console.error(`Error: could not read the episodes: ${pubError.message}`);
  process.exit(1);
}

const publicObjects = await listAll(PUBLIC_AUDIO_BUCKET);
const toMove = objectsToMakePrivate(
  publicObjects,
  (published ?? []).map((row) => row.audio_path),
);

console.log(
  `${publicObjects.length} object(s) in ${PUBLIC_AUDIO_BUCKET}; ${toMove.length} to move to ${DRAFT_AUDIO_BUCKET}:`,
);
for (const path of toMove) console.log(`  ${path}`);
if (!confirm) {
  console.log("Dry run. Re-run with --confirm to move them.");
  process.exit(0);
}

let moved = 0;
for (const path of toMove) {
  // Re-read just before moving: an episode published since the list was made must keep its public file.
  const { data: rows, error: rowError } = await db
    .from("podcast_episodes")
    .select("published")
    .eq("audio_path", path);
  if (rowError) {
    console.error(`Skipped ${path}: could not re-check its episode (${rowError.message}).`);
    continue;
  }
  if ((rows ?? []).some((row) => row.published)) {
    console.error(`Skipped ${path}: an episode that uses it is published now. Left public.`);
    continue;
  }
  // Never overwrite a draft that is already there.
  const existing = await db.storage.from(DRAFT_AUDIO_BUCKET).download(path);
  if (existing.data) {
    console.error(`Skipped ${path}: a private copy already exists. Left as it is; check by hand.`);
    continue;
  }
  const { data: blob, error: downloadError } = await db.storage
    .from(PUBLIC_AUDIO_BUCKET)
    .download(path);
  if (downloadError || !blob) {
    console.error(`Skipped ${path}: could not read it (${downloadError?.message}).`);
    continue;
  }
  const { error: uploadError } = await db.storage
    .from(DRAFT_AUDIO_BUCKET)
    .upload(path, blob, { contentType: blob.type || "audio/mpeg", upsert: false });
  if (uploadError) {
    console.error(
      `Skipped ${path}: copy failed (${uploadError.message}). The public file is untouched.`,
    );
    continue;
  }
  // Only remove the public file once the private copy reads back at the same size.
  const { data: copy } = await db.storage.from(DRAFT_AUDIO_BUCKET).download(path);
  if (!copy || copy.size !== blob.size) {
    console.error(
      `Skipped ${path}: the private copy did not read back. The public file is untouched.`,
    );
    continue;
  }
  const { error: removeError } = await db.storage.from(PUBLIC_AUDIO_BUCKET).remove([path]);
  if (removeError) {
    console.error(`${path}: copied, but removing the public file failed (${removeError.message}).`);
    continue;
  }
  moved += 1;
  console.log(`Moved ${path}`);
}
console.log(`Moved ${moved} of ${toMove.length}.`);
process.exit(moved === toMove.length ? 0 : 1);
