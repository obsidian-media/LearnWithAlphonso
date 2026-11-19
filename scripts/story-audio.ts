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
 *   bun run scripts/story-audio.ts generate --story <uuid> [--confirm]
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
import { planStoryAudio } from "../src/lib/story-audio-plan";
import { STORY_AUDIO_BUCKET, storyManifestPath } from "../src/lib/story-recordings";

const FLAG_SPEC = { booleans: ["confirm"], values: ["story", "course"] } as const;
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

async function synthesise(text: string, voice: string, key: string): Promise<Uint8Array> {
  const response = await fetch(deepgramSpeakUrl(voice), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Token ${key}` },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) fail(`Deepgram returned ${response.status} for "${text.slice(0, 40)}".`);
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

  let query = db.from("stories").select("id, course, slug, segments, nodes").eq("published", true);
  if (typeof flags.story === "string") query = query.eq("id", flags.story);
  if (typeof flags.course === "string") query = query.eq("course", flags.course);
  const { data: stories, error } = await query.order("course").order("sort_order");
  if (error) fail(`could not read stories: ${error.message}`);
  if (!stories?.length) fail("no published stories matched.");

  let totalChars = 0;
  let totalNew = 0;
  let totalReused = 0;
  for (const story of stories) {
    const course = story.course as "en" | "fr" | "es";
    const voice = DEFAULT_VOICES.alphonso[course];
    const manifestPath = storyManifestPath(story.id);
    let existing: unknown = null;
    const dl = await db.storage.from(STORY_AUDIO_BUCKET).download(manifestPath);
    if (dl.data) existing = JSON.parse(await dl.data.text());

    const plan = await planStoryAudio(story, voice, existing);
    totalChars += plan.chars;
    totalNew += plan.toGenerate.length;
    totalReused += plan.reused;
    console.log(
      `${course}/${story.slug}: ${plan.manifest.entries.length} sentences, ${plan.reused} recorded, ` +
        `${plan.toGenerate.length} to record (${plan.chars} chars, ${voice})`,
    );
    if (!confirm || plan.toGenerate.length === 0) continue;

    // Files first, manifest last: a reader never sees a manifest entry whose file is not there yet.
    for (const item of plan.toGenerate) {
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
  story-audio.ts generate [--story <id>] [--course en|fr|es] [--confirm]`;

async function main() {
  const { command, flags } = parseCliArgs(process.argv.slice(2), FLAG_SPEC);
  if (command === "generate") await cmdGenerate(flags);
  else console.log(USAGE);
}

main().catch((err) => {
  if (err instanceof CliArgError) fail(err.message);
  throw err;
});
