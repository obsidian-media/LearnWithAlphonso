/**
 * Vocab image upload stage. OWNER-RUN: needs the service-role key, which an agent never handles.
 *   cd <worktree>
 *   export SUPABASE_URL=https://qhcjpfbxfcltjbiuknyt.supabase.co
 *   read -rs SUPABASE_SERVICE_ROLE_KEY && export SUPABASE_SERVICE_ROLE_KEY   # silent prompt, stays out of history
 *   bun scripts/upload-vocab-images.ts --dry-run
 *   bun scripts/upload-vocab-images.ts            # upload every approved image, verify the served bytes
 *   bun scripts/upload-vocab-images.ts --prune            # list bucket objects no committed image references (dry run)
 *   bun scripts/upload-vocab-images.ts --prune --apply    # delete them (refuses a tiny keep-set; >10% needs --force-large)
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  recordUpload,
  referencedObjectPaths,
  statusCounts,
} from "../src/lib/vocab-images/manifest";
import { publicUrlFor, sha8Of, storagePathFor } from "../src/lib/vocab-images/paths";
import { IMAGE_LANGS } from "../src/lib/vocab-images/types";
import {
  SUPABASE_PROJECT_ORIGIN,
  VOCAB_IMAGE_BUCKET,
  VOCAB_IMAGE_MAX_BYTES,
  VOCAB_IMAGE_MIME,
} from "../src/lib/vocab-images/url-policy";
import { WORK_DIR, readManifest, writeManifest } from "./vocab-images/workdir";

const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(
    "Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY (values are never printed).",
  );
  process.exit(1);
}
if (url !== SUPABASE_PROJECT_ORIGIN) {
  console.error(
    `SUPABASE_URL must be ${SUPABASE_PROJECT_ORIGIN}: the recorded image URLs point there.`,
  );
  process.exit(1);
}
const DRY = process.argv.includes("--dry-run");
const PRUNE = process.argv.includes("--prune");
const PRUNE_APPLY = process.argv.includes("--apply");
const FORCE_LARGE = process.argv.includes("--force-large");
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const bucket = db.storage.from(VOCAB_IMAGE_BUCKET);

async function ensureBucket(): Promise<void> {
  const { data } = await db.storage.getBucket(VOCAB_IMAGE_BUCKET);
  if (data) {
    if (!data.public) throw new Error(`${VOCAB_IMAGE_BUCKET} exists but is not public`);
    return;
  }
  if (DRY) {
    console.log(`would create bucket ${VOCAB_IMAGE_BUCKET}`);
    return;
  }
  const { error } = await db.storage.createBucket(VOCAB_IMAGE_BUCKET, {
    public: true,
    fileSizeLimit: VOCAB_IMAGE_MAX_BYTES,
    allowedMimeTypes: [VOCAB_IMAGE_MIME],
  });
  if (error) throw new Error(`createBucket: ${error.message}`);
  console.log(`created bucket ${VOCAB_IMAGE_BUCKET}`);
}

/** storage.list caps at 1,000 per call: page until a short page. */
async function listAll(prefix: string): Promise<string[]> {
  const names: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await bucket.list(prefix, {
      limit: 1000,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw new Error(`list ${prefix}: ${error.message}`);
    names.push(...data.map((o) => `${prefix}/${o.name}`));
    if (data.length < 1000) return names;
  }
}

async function main() {
  await ensureBucket();
  const manifest = readManifest();
  const approved = Object.values(manifest.entries).filter((e) => e.status === "approved");
  let n = 0;
  for (const entry of approved) {
    const c = entry.candidate;
    if (!c) throw new Error(`${entry.key}: approved without a candidate`);
    const bytes = fs.readFileSync(path.join(WORK_DIR, c.stagingPath));
    if (sha8Of(bytes) !== c.sha8) throw new Error(`${entry.key}: staged file changed since review`);
    if (bytes.length > VOCAB_IMAGE_MAX_BYTES)
      throw new Error(`${entry.key}: ${bytes.length} bytes exceeds the bucket limit`);
    const objectPath = storagePathFor(entry.key, entry.lang);
    const publicUrl = publicUrlFor(objectPath, c.sha8);
    if (DRY) {
      console.log(`would upload ${objectPath}`);
      continue;
    }
    const { error } = await bucket.upload(objectPath, bytes, {
      contentType: VOCAB_IMAGE_MIME,
      upsert: true,
      cacheControl: "31536000",
    });
    if (error) throw new Error(`${entry.key}: upload failed: ${error.message}`);
    const served = await fetch(publicUrl);
    const body = new Uint8Array(await served.arrayBuffer());
    if (served.status !== 200 || sha8Of(body) !== c.sha8) {
      throw new Error(`${entry.key}: ${publicUrl} served ${served.status} with different bytes`);
    }
    manifest.entries[entry.key] = recordUpload(entry, publicUrl);
    if (++n % 25 === 0) {
      writeManifest(manifest);
      console.log(`${n}/${approved.length}`);
    }
  }
  if (!DRY) writeManifest(manifest);

  if (PRUNE) {
    // The keep-set is the committed data plus the manifest, so a missing or
    // empty manifest alone can never make every object look stale.
    const keep = new Set([
      ...keepPathsFromImages(VOCAB_IMAGES),
      ...referencedObjectPaths(manifest),
    ]);
    const listed = (await Promise.all(IMAGE_LANGS.map(listAll))).flat();
    const stale = planPrune(listed, keep, { forceLarge: FORCE_LARGE });
    const apply = PRUNE_APPLY && !DRY;
    console.log(
      `prune: ${stale.length} unreferenced object(s)${apply ? "" : " (dry run; pass --apply to delete)"}`,
    );
    if (apply) {
      for (let i = 0; i < stale.length; i += 100) {
        const { error } = await bucket.remove(stale.slice(i, i + 100));
        if (error) throw new Error(`remove: ${error.message}`);
      }
    }
  }
  console.log(statusCounts(manifest));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
