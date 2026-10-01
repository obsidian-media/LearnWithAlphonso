/**
 * Uploads a local Reels-format mp4 to Supabase Storage so it has a public
 * HTTPS URL Instagram's Graph API can fetch (the API requires a fetchable
 * URL, not a direct file upload -- see instagram_upload.py in
 * YouTubeChannel/scripts/, which is the next step after this).
 *
 * Reuses the existing public `podcast-audio` bucket under an
 * `instagram-reels/` prefix rather than provisioning a new bucket -- same
 * bucket-level public-read policy already verified working all session
 * for podcast mp3s; Supabase Storage doesn't restrict by content type per
 * bucket, so an mp4 under a new prefix is equally public.
 *
 * Usage (run with bun -- account-owner-run, same as podcast-tool.ts,
 * because it needs the service-role key):
 *   bun run scripts/upload-reel-video.ts --file <path.mp4> --slug <slug> [--confirm]
 *
 * Without --confirm it prints what it would upload and exits without
 * touching Supabase, same convention as podcast-tool.ts.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "podcast-audio";
const PREFIX = "instagram-reels";

function fail(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function parseArgs(argv: string[]) {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      i++;
    } else {
      args[key] = true;
    }
  }
  return args;
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const file = args.file as string | undefined;
  const slug = args.slug as string | undefined;
  const confirm = args.confirm === true;

  if (!file || !slug) fail("Usage: upload-reel-video.ts --file <path.mp4> --slug <slug> [--confirm]");
  if (!existsSync(file)) fail(`File not found: ${file}`);
  if (!/^[a-z0-9-]+$/.test(slug)) fail("Slug must be lowercase letters, digits, and hyphens only.");

  const sizeBytes = statSync(file).size;
  const objectPath = `${PREFIX}/${slug}.mp4`;

  console.log(`Would upload ${file} (${(sizeBytes / 1024 / 1024).toFixed(1)} MB) to ${BUCKET}/${objectPath}`);

  if (!confirm) {
    console.log("Dry run -- pass --confirm to actually upload.");
    return;
  }

  const db = supabase();
  const video = readFileSync(file);
  const { error } = await db.storage
    .from(BUCKET)
    .upload(objectPath, video, { contentType: "video/mp4", upsert: true });

  if (error) fail(`Upload failed: ${error.message}`);

  const { data } = db.storage.from(BUCKET).getPublicUrl(objectPath);
  console.log(`Uploaded. Public URL:\n${data.publicUrl}`);
}

main();
