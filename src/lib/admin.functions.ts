import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireAdmin } from "./admin-middleware";
import { findCycle, isValidSlug, type PodcastFolder } from "./podcast-tree";
import {
  validateUpload,
  sniffAudioType,
  stagingPathFor,
  contentTypeFor,
  MAX_UPLOAD_BYTES,
} from "./admin-upload";
import { normalizeTranscript } from "./podcast-transcript";

/**
 * Every admin server function lives in this one file so
 * admin.functions.test.ts has exactly one thing to enumerate. Adding an
 * admin function anywhere else defeats that test, which is the only
 * thing standing between this design and one endpoint that forgot its
 * gate.
 *
 * KEEP IN SYNC: every createServerFn below must appear in
 * ADMIN_FUNCTION_NAMES. The test fails if the counts disagree, in both
 * directions.
 */
export const ADMIN_FUNCTION_NAMES = [
  "adminListFolders",
  "adminWhoAmI",
  "adminCreateFolder",
  "adminRenameFolder",
  "adminMoveFolder",
  "adminDeleteFolder",
  "adminListEpisodes",
  "adminUpdateEpisode",
  "adminSetPublished",
  "adminCreateAudioUploadUrl",
  "adminVerifyUploadedAudio",
  "adminGetTranscript",
  "adminSaveTranscript",
] as const;

const BUCKET = "podcast-audio";

const slugSchema = z.string().min(1).max(80).refine(isValidSlug, "use lowercase kebab-case");

/**
 * Whether re-parenting `folderId` under `newParentId` closes a loop.
 *
 * Applies the move to a COPY and asks findCycle -- the tested function
 * the CLI already uses -- rather than reimplementing reachability here.
 * A second implementation of a rule this subtle is a second thing to
 * get wrong, and only one of them would have tests.
 */
export function wouldCreateCycle(
  folders: PodcastFolder[],
  folderId: string,
  newParentId: string | null,
): boolean {
  return cycleFor(folders, folderId, newParentId) !== null;
}

/**
 * The folder ids that would form the loop, or null if the move is legal.
 *
 * `findCycle` has always returned the path and the caller threw it away,
 * so the refusal said only "that would put the folder inside itself" --
 * leaving the admin to work out *which* nesting was the problem in a tree
 * they cannot see all of at once.
 *
 * Self-parenting is reported as the single-element path rather than
 * short-circuiting to a bare boolean, so the message has something to
 * name in that case too.
 */
export function cycleFor(
  folders: PodcastFolder[],
  folderId: string,
  newParentId: string | null,
): string[] | null {
  if (folderId === newParentId) return [folderId];
  const moved = folders.map((f) => (f.id === folderId ? { ...f, parentId: newParentId } : f));
  return findCycle(moved);
}

/**
 * Turns a PostgREST write that matched nothing into a refusal.
 *
 * `.update()/.delete().eq()` against an id that no longer exists
 * succeeds: no error, zero rows touched. Every mutation here used to
 * return `{ ok: true }` for that, so an admin deleting a folder someone
 * had already removed, or renaming from a stale tab, was told it worked
 * and the list simply re-rendered unchanged.
 *
 * A null count is treated as "nothing matched", not as success: PostgREST
 * omits the count unless asked, so if a caller ever stops asking, this
 * fails loudly instead of quietly returning to the old behaviour.
 */
export function affectedOrThrow(
  result: { count: number | null; error: { message: string } | null },
  missingMessage: string,
): void {
  // The database's own error wins. Reporting a constraint violation as
  // "nothing matched" sends someone hunting for a missing row.
  if (result.error) throw new Error(result.error.message);
  if (!result.count) throw new Error(missingMessage);
}

/**
 * The generated Database type does not know the podcast tables (see
 * podcast.functions.ts's note -- regenerating needs the live project).
 * Same workaround, same reason: talk to an untyped client rather than
 * hand-edit a generated file.
 */
function untyped(client: unknown): SupabaseClient {
  return client as SupabaseClient;
}

/** The whole folder tree, including branches with nothing published. */
export const adminListFolders = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async ({ context }): Promise<PodcastFolder[]> => {
    const { data, error } = await untyped(context.supabaseAdmin)
      .from("podcast_folders")
      .select("id,parent_id,slug,title,description,sort_order")
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      id: row.id as string,
      parentId: (row.parent_id as string | null) ?? null,
      slug: row.slug as string,
      title: row.title as string,
      description: (row.description as string | null) ?? null,
      sortOrder: row.sort_order as number,
    }));
  });

/**
 * Confirms the caller is an admin, and returns only their own id.
 *
 * There is nothing else an admin session needs to know. Echoing any part
 * of the allowlist back would undo the point of making the table
 * unreadable in the first place.
 */
export const adminWhoAmI = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async ({ context }): Promise<{ userId: string }> => {
    return { userId: context.userId };
  });

export const adminCreateFolder = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) =>
    z
      .object({
        parentId: z.string().uuid().nullable(),
        slug: slugSchema,
        title: z.string().min(1).max(200),
        description: z.string().max(2000).nullable().default(null),
        sortOrder: z.number().int().min(0).default(0),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { data: row, error } = await untyped(context.supabaseAdmin)
      .from("podcast_folders")
      .insert({
        parent_id: data.parentId,
        slug: data.slug,
        title: data.title,
        description: data.description,
        sort_order: data.sortOrder,
      })
      .select("id")
      .single();
    // The two partial unique indexes (one for parent_id IS NOT NULL, one
    // for root slugs -- Postgres treats NULL parents as mutually
    // distinct, so a plain UNIQUE would not constrain roots) surface here
    // as 23505. Translated, because "duplicate key value violates unique
    // constraint podcast_folders_root_slug_key" is not a sentence anyone
    // should have to read in a form.
    if (error) {
      throw new Error(
        error.code === "23505"
          ? `A folder with slug "${data.slug}" already exists here.`
          : error.message,
      );
    }
    return { id: row.id as string };
  });

export const adminRenameFolder = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        title: z.string().min(1).max(200),
        description: z.string().max(2000).nullable().default(null),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    // Title and description only. The slug is part of every episode's
    // storage path underneath this folder, so changing it here would
    // orphan audio without moving a single object.
    const result = await untyped(context.supabaseAdmin)
      .from("podcast_folders")
      .update({ title: data.title, description: data.description }, { count: "exact" })
      .eq("id", data.id);
    affectedOrThrow(result, "That folder no longer exists. Reload the list.");
    return { ok: true };
  });

export const adminMoveFolder = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), parentId: z.string().uuid().nullable() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const client = untyped(context.supabaseAdmin);
    const { data: rows, error: readError } = await client
      .from("podcast_folders")
      .select("id,parent_id,slug,title,description,sort_order");
    if (readError) throw new Error(readError.message);
    const folders: PodcastFolder[] = (rows ?? []).map((row) => ({
      id: row.id as string,
      parentId: (row.parent_id as string | null) ?? null,
      slug: row.slug as string,
      title: row.title as string,
      description: (row.description as string | null) ?? null,
      sortOrder: row.sort_order as number,
    }));
    // Checked here rather than by a trigger for the same reason the CLI
    // checks it: only trusted writers reach these tables, so the rule
    // lives in tested TypeScript where it can be read.
    const cycle = cycleFor(folders, data.id, data.parentId);
    if (cycle) {
      // findCycle returns the path and the first version discarded it,
      // leaving the admin to work out WHICH nesting was the problem in a
      // tree they cannot see all of at once.
      const byId = new Map(folders.map((f) => [f.id, f.title]));
      const names = cycle.map((id) => byId.get(id) ?? id).join(" → ");
      throw new Error(`That move would put the folder inside itself: ${names} → …`);
    }
    const result = await client
      .from("podcast_folders")
      .update({ parent_id: data.parentId }, { count: "exact" })
      .eq("id", data.id);
    affectedOrThrow(result, "That folder no longer exists. Reload the list.");
    return { ok: true };
  });

export const adminDeleteFolder = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const client = untyped(context.supabaseAdmin);
    // Checked here even though the database already refuses: both
    // podcast_folders.parent_id and podcast_episodes.folder_id are
    // ON DELETE RESTRICT (see 20260926030000), so Postgres raises 23503
    // anyway. This exists to turn that into a sentence, and to name
    // WHICH kind of child is in the way. It is a message, not a control
    // -- the constraint is the control, and it must stay.
    const [{ count: childCount }, { count: episodeCount }] = await Promise.all([
      client
        .from("podcast_folders")
        .select("id", { count: "exact", head: true })
        .eq("parent_id", data.id),
      client
        .from("podcast_episodes")
        .select("id", { count: "exact", head: true })
        .eq("folder_id", data.id),
    ]);
    if ((childCount ?? 0) > 0) throw new Error("Move or delete the subfolders first.");
    if ((episodeCount ?? 0) > 0) throw new Error("Delete this folder's episodes first.");
    const result = await client
      .from("podcast_folders")
      .delete({ count: "exact" })
      .eq("id", data.id);
    affectedOrThrow(result, "That folder was already deleted. Reload the list.");
    return { ok: true };
  });

export type AdminEpisode = {
  id: string;
  folderId: string;
  slug: string;
  title: string;
  description: string | null;
  durationSeconds: number;
  published: boolean;
  audioPath: string;
};

/** Every episode in a folder, published or not. */
export const adminListEpisodes = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => z.object({ folderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<AdminEpisode[]> => {
    const { data: rows, error } = await untyped(context.supabaseAdmin)
      .from("podcast_episodes")
      .select("id,folder_id,slug,title,description,duration_seconds,published,audio_path")
      .eq("folder_id", data.folderId)
      .order("slug", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []).map((row) => ({
      id: row.id as string,
      folderId: row.folder_id as string,
      slug: row.slug as string,
      title: row.title as string,
      description: (row.description as string | null) ?? null,
      durationSeconds: row.duration_seconds as number,
      published: row.published as boolean,
      audioPath: row.audio_path as string,
    }));
  });

export const adminUpdateEpisode = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        title: z.string().min(1).max(200),
        description: z.string().max(4000).nullable().default(null),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    // Slug is deliberately not editable. It is baked into the storage
    // path (see storagePathFor in podcast-authoring.ts), so renaming it
    // without moving the object orphans the audio -- and moving the
    // object is a different, riskier operation than editing a title.
    // Publish under a new slug instead.
    const result = await untyped(context.supabaseAdmin)
      .from("podcast_episodes")
      .update({ title: data.title, description: data.description }, { count: "exact" })
      .eq("id", data.id);
    affectedOrThrow(result, "That episode no longer exists. Reload the list.");
    return { ok: true };
  });

export const adminSetPublished = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), published: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    // Publishing hides or shows the ROW. It does not touch the object:
    // the podcast-audio bucket is public-read, so an unpublished
    // episode's audio stays fetchable by anyone holding the URL. Any UI
    // built on this must say "not listed", never "private".
    const result = await untyped(context.supabaseAdmin)
      .from("podcast_episodes")
      .update({ published: data.published }, { count: "exact" })
      .eq("id", data.id);
    affectedOrThrow(result, "That episode no longer exists. Reload the list.");
    return { ok: true };
  });

/**
 * Resolves an episode's real storage path from its id.
 *
 * The caller used to pass `audioPath` alongside `episodeId` with nothing
 * tying them together, so a stale tab could upload episode B's file and
 * have B's duration written onto A's row -- which iOS
 * `PodcastCache.durationDisagrees` then reads as a truncated download
 * and re-fetches on every launch, forever. It also let a signed upload
 * URL be minted for any key in the bucket, including one no episode
 * points at. The path is now never accepted from the client.
 */
async function audioPathForEpisode(client: SupabaseClient, episodeId: string): Promise<string> {
  const { data, error } = await client
    .from("podcast_episodes")
    .select("audio_path")
    .eq("id", episodeId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("That episode no longer exists.");
  return data.audio_path as string;
}

/**
 * A short-lived signed URL the browser uploads the audio to directly.
 *
 * Direct-to-storage, not a POST of the bytes through here: a serverless
 * function body is capped near 4.5 MB on Vercel and base64 inflates by a
 * third, so an ordinary 3 MB episode routed through a server function
 * would fail at the platform rather than in any code we could fix.
 *
 * The URL targets a STAGING key, never the live object. The live audio
 * of a published episode must not hold unverified bytes for even a
 * moment: an earlier version uploaded straight onto `audio_path` and
 * deleted on failure, so one mis-picked file destroyed a published
 * episode's audio -- unrecoverably, with no bucket versioning and no
 * backup, while the row stayed published and pointing at nothing.
 */
export const adminCreateAudioUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) =>
    z
      .object({
        episodeId: z.string().uuid(),
        declaredBytes: z.number().int().positive(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ signedUrl: string; token: string }> => {
    // The declared size is the caller's claim and buys only a cheap early
    // refusal. The number that counts is measured from the stored object
    // in adminVerifyUploadedAudio.
    if (data.declaredBytes > MAX_UPLOAD_BYTES) {
      throw new Error(
        `That file is too large (${Math.round(data.declaredBytes / 1024 / 1024)} MB). The limit is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`,
      );
    }
    const client = untyped(context.supabaseAdmin);
    const audioPath = await audioPathForEpisode(client, data.episodeId);
    const { data: signed, error } = await client.storage
      .from(BUCKET)
      .createSignedUploadUrl(stagingPathFor(audioPath), { upsert: true });
    if (error || !signed) throw new Error(error?.message ?? "Could not start the upload.");
    return { signedUrl: signed.signedUrl, token: signed.token };
  });

/**
 * Verifies the staged object and, only if it is real audio, promotes it
 * onto the live path and writes the new duration.
 *
 * Every failure removes the staging object and leaves the live one
 * untouched, so a rejected upload costs the admin nothing but the
 * message. That ordering is the whole fix: verification necessarily
 * happens after a write, and the bucket is public-read and served from
 * our own domain, so the write must land somewhere nothing points at.
 */
export const adminVerifyUploadedAudio = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => z.object({ episodeId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true; durationSeconds: number }> => {
    const client = untyped(context.supabaseAdmin);
    const audioPath = await audioPathForEpisode(client, data.episodeId);
    const staging = stagingPathFor(audioPath);

    /** Removes the staged object, then reports why it was refused. */
    const reject = async (message: string): Promise<never> => {
      await client.storage.from(BUCKET).remove([staging]);
      throw new Error(message);
    };

    const { data: blob, error: downloadError } = await client.storage
      .from(BUCKET)
      .download(staging);
    if (downloadError || !blob) throw new Error("The upload did not arrive. Try again.");

    const buffer = Buffer.from(await blob.arrayBuffer());
    const head = new Uint8Array(buffer.subarray(0, 16));
    const problem = validateUpload(head, buffer.byteLength);
    if (problem) return reject(problem);

    // Non-null: validateUpload already refused anything sniffAudioType
    // does not recognise.
    const kind = sniffAudioType(head)!;

    // music-metadata is imported lazily, matching podcast-tool.ts: a
    // top-level import made commands that never read audio die at import
    // time, and the same would apply to every admin request here.
    //
    // The parse is wrapped because it THROWS on input the sniffer
    // accepts -- three "ID3" bytes followed by anything is enough. An
    // unguarded throw used to escape the handler with the object still
    // sitting in the bucket, which is the exact outcome byte-sniffing
    // exists to prevent.
    let durationSeconds = 0;
    try {
      const { parseBuffer } = await import("music-metadata");
      // The sniffed kind, not a hardcoded audio/mpeg. Parsing an M4A as
      // MPEG plausibly yields no duration, and under the old flow that
      // deleted a file the picker had invited.
      const metadata = await parseBuffer(buffer, { mimeType: contentTypeFor(kind) });
      durationSeconds = Math.round(metadata.format.duration ?? 0);
    } catch {
      return reject("That file could not be read as audio. It may be truncated.");
    }
    if (durationSeconds <= 0) {
      return reject("Could not read a duration from that file. It may be truncated.");
    }

    // Promote: copy onto the live path, then drop the staging object.
    // Content type is set from the sniffed bytes rather than from
    // whatever the browser PUT, because the stored type is what the
    // bucket serves with -- sniffing alone does not control that.
    const { error: promoteError } = await client.storage
      .from(BUCKET)
      .upload(audioPath, buffer, { contentType: contentTypeFor(kind), upsert: true });
    if (promoteError) return reject(promoteError.message);
    await client.storage.from(BUCKET).remove([staging]);

    // Written only after the live object is the verified one. A row
    // claiming a duration the file does not have is exactly what the iOS
    // cache's durationDisagrees check reads as a truncated download.
    const { error } = await client
      .from("podcast_episodes")
      .update({ duration_seconds: durationSeconds })
      .eq("id", data.episodeId);
    if (error) throw new Error(error.message);
    return { ok: true, durationSeconds };
  });

export const adminGetTranscript = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => z.object({ episodeId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ text: string | null }> => {
    const { data: row, error } = await untyped(context.supabaseAdmin)
      .from("podcast_transcripts")
      .select("text")
      .eq("episode_id", data.episodeId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { text: (row?.text as string | undefined) ?? null };
  });

export const adminSaveTranscript = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) =>
    z.object({ episodeId: z.string().uuid(), text: z.string().max(200_000) }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    // The SAME rule --transcript enforces, from the same module. A
    // transcript is not the TTS script: episode 1's script carries
    // ElevenLabs SSML, and rendering that to a screen reader is the
    // precise failure this feature exists to prevent.
    //
    // normalizeTranscript THROWS on markup and on over-length, and
    // returns null only for genuinely empty text. Those are three
    // different outcomes and are kept distinct here: collapsing them
    // would turn "you pasted the TTS script" into "saved nothing,
    // succeeded".
    let normalized: string | null;
    try {
      normalized = normalizeTranscript(data.text);
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : "That transcript was rejected.");
    }
    if (normalized === null) {
      // Empty is a deletion request, not an error: clearing the box is
      // how an admin removes a transcript that should never have been
      // published. Refusing would leave them no way to undo it.
      const { error: deleteError } = await untyped(context.supabaseAdmin)
        .from("podcast_transcripts")
        .delete()
        .eq("episode_id", data.episodeId);
      if (deleteError) throw new Error(deleteError.message);
      return { ok: true };
    }
    const { error } = await untyped(context.supabaseAdmin)
      .from("podcast_transcripts")
      .upsert({ episode_id: data.episodeId, text: normalized }, { onConflict: "episode_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
