/**
 * Pre-records story narration (graded read-along and branching stories): one Deepgram MP3 per sentence, uploaded to the
 * public podcast-audio bucket under stories/<storyId>/ with a manifest.json the apps read. The apps play these files
 * instead of calling /api/tts per sentence, so listening costs nothing, spends no AI quota and needs no AI consent.
 * Idempotent: a sentence that already has a recording (same text, same voice) is skipped, so a re-run costs nothing and
 * an edited sentence is the only thing re-recorded. The voice is the course's default Alphonso voice
 * (DEFAULT_VOICES.alphonso in src/lib/voice-catalog.ts).
 *
 * Run from Git Bash with bun (PowerShell cannot run the bun shim). Every run is a DRY RUN that prints what it would
 * record and the Deepgram cost, until you add --confirm.
 *
 *   bun run scripts/story-audio.ts generate                       # all published stories, dry run
 *   bun run scripts/story-audio.ts generate --confirm             # record everything that is missing
 *   bun run scripts/story-audio.ts generate --story <uuid> [--confirm]   # --story still requires the story to be published
 *   bun run scripts/story-audio.ts generate --slugs a,b,c [--confirm]    # published stories with these slugs
 *   bun run scripts/story-audio.ts generate --slugs a,b,c --include-unpublished [--confirm]   # hidden (draft) stories too
 *   bun run scripts/story-audio.ts generate --course es [--confirm]
 *
 * Keys come from the environment only: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and DEEPGRAM_API_KEY. If they are not
 * set, the owner's ~/.alphonso-secrets/podcast.env is read for those three names (nothing is printed or echoed).
 * Do not put a key on the command line.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { DEFAULT_VOICES } from "../src/lib/voice-catalog";
import { deepgramSpeakUrl } from "../src/lib/podcast-tts";
import { ttsCostMicro } from "../src/lib/ai-cost";
import { pickEnv } from "../src/lib/video-authoring";
import { CliArgError, parseCliArgs, type CliFlags } from "../src/lib/podcast-cli-args";
import { planStoryAudio, planStoryFilter } from "../src/lib/story-audio-plan";
import {
  STORY_AUDIO_BUCKET,
  storyAudioPrefix,
  storyManifestPath,
} from "../src/lib/story-recordings";

const FLAG_SPEC = {
  booleans: ["confirm", "include-unpublished"],
  values: ["story", "course", "slugs"],
} as const;
const WANTED = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "DEEPGRAM_API_KEY"] as const;

function fail(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function loadEnv() {
  if (WANTED.every((name) => process.env[name])) return;
  const file = join(homedir(), ".alphonso-secrets", "podcast.env");
  if (!existsSync(file)) return;
  const found = pickEnv(readFileSync(file, "utf-8"), WANTED);
  for (const name of WANTED) if (!process.env[name] && found[name]) process.env[name] = found[name];
}

const RETRIES = 4;

/** Deepgram answers 429 (rate limit) and 5xx under load; those are retried with a growing pause, anything else fails. */
async function synthesise(text: string, voice: string, key: string): Promise<Uint8Array> {
  let response: Response | undefined;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    response = await fetch(deepgramSpeakUrl(voice), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Token ${key}` },
      body: JSON.stringify({ text }),
    });
    const transient = response.status === 429 || response.status >= 500;
    if (!transient || attempt === RETRIES) break;
    await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
  }
  if (!response || !response.ok) {
    fail(`Deepgram returned ${response?.status} for "${text.slice(0, 40)}".`);
  }
  const audio = new Uint8Array(await response.arrayBuffer());
  if (audio.length < 200) fail(`Deepgram returned an empty clip for "${text.slice(0, 40)}".`);
  return audio;
}

async function cmdGenerate(flags: CliFlags) {
  loadEnv();
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const deepgramKey = process.env.DEEPGRAM_API_KEY;
  if (!url || !serviceKey || !deepgramKey) {
    fail(
      "SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and DEEPGRAM_API_KEY must be set (in the environment or in " +
        "~/.alphonso-secrets/podcast.env). Do not paste a key on the command line.",
    );
  }
  const confirm = flags.confirm === true;
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });

  let filter;
  try {
    filter = planStoryFilter(flags);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
  let query = db.from("stories").select("id, course, slug, segments, nodes");
  if (filter.publishedOnly) query = query.eq("published", true);
  if (filter.story) query = query.eq("id", filter.story);
  if (filter.slugs) query = query.in("slug", filter.slugs);
  if (filter.course) query = query.eq("course", filter.course);
  const { data: stories, error } = await query.order("course").order("sort_order");
  if (error) fail(`could not read stories: ${error.message}`);
  if (!stories?.length)
    fail(filter.publishedOnly ? "no published stories matched." : "no stories matched.");

  let totalChars = 0;
  let totalNew = 0;
  let totalReused = 0;
  for (const story of stories) {
    const course = story.course as "en" | "fr" | "es";
    const voice = DEFAULT_VOICES.alphonso[course];
    const manifestPath = storyManifestPath(story.id);
    let existing: unknown = null;
    const dl = await db.storage.from(STORY_AUDIO_BUCKET).download(manifestPath);
    if (dl.data) {
      try {
        existing = JSON.parse(await dl.data.text());
      } catch {
        existing = null; // an unreadable manifest is treated as none: everything is planned afresh
      }
    }
    // Files already in the story's folder (a partly finished earlier run wrote files but not the manifest) are not
    // paid for twice: the name is a hash of voice + text, so a file that exists is the right audio.
    const listed = await db.storage
      .from(STORY_AUDIO_BUCKET)
      .list(storyAudioPrefix(story.id), { limit: 1000 });
    const present = new Set(
      (listed.data ?? []).map((f) => `${storyAudioPrefix(story.id)}/${f.name}`),
    );

    const plan = await planStoryAudio(story, voice, existing);
    // Only sentences with no file yet are synthesised (and billed); a manifest still gets written for the rest.
    const todo = plan.toGenerate.filter((item) => !present.has(item.file));
    const chars = todo.reduce((n, item) => n + item.text.length, 0);
    totalChars += chars;
    totalNew += todo.length;
    totalReused += plan.manifest.entries.length - todo.length;
    console.log(
      `${course}/${story.slug}: ${plan.manifest.entries.length} sentences, ` +
        `${plan.manifest.entries.length - todo.length} recorded, ${todo.length} to record (${chars} chars, ${voice})`,
    );
    if (!confirm || plan.toGenerate.length === 0) continue;

    // Files first, manifest last: a reader never sees a manifest entry whose file is not there yet.
    for (const item of todo) {
      const audio = await synthesise(item.text, voice, deepgramKey);
      const { error: upErr } = await db.storage.from(STORY_AUDIO_BUCKET).upload(item.file, audio, {
        contentType: "audio/mpeg",
        // The name is a hash of voice + text, so the bytes never change: cache for a year.
        cacheControl: "31536000",
        upsert: true,
      });
      if (upErr) fail(`upload of ${item.file} failed: ${upErr.message}`);
    }
    const { error: mErr } = await db.storage
      .from(STORY_AUDIO_BUCKET)
      .upload(manifestPath, JSON.stringify(plan.manifest), {
        contentType: "application/json",
        // The manifest changes when a story is edited or re-recorded: keep it short-lived.
        cacheControl: "300",
        upsert: true,
      });
    if (mErr) fail(`upload of ${manifestPath} failed: ${mErr.message}`);
  }

  const usd = (ttsCostMicro("aura-2-x", totalChars) ?? 0) / 1_000_000;
  console.log(
    `\n${stories.length} stories: ${totalReused} sentences already recorded, ${totalNew} ${confirm ? "recorded" : "to record"}` +
      ` (${totalChars} characters, about $${usd.toFixed(2)} of Deepgram).`,
  );
  if (!confirm && totalNew > 0) console.log("Dry run. Add --confirm to record and upload.");
}

const USAGE = `Usage:
  story-audio.ts generate [--story <id>] [--slugs a,b,c] [--course en|fr|es] [--include-unpublished] [--confirm]
  --include-unpublished also narrates hidden (published=false) stories; it requires --slugs or --story.`;

async function main() {
  const { command, flags } = parseCliArgs(process.argv.slice(2), FLAG_SPEC);
  if (command === "generate") await cmdGenerate(flags);
  else console.log(USAGE);
}

main().catch((err) => {
  if (err instanceof CliArgError) fail(err.message);
  throw err;
});
