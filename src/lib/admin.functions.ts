import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { z } from "zod";
import { requireStaff } from "./staff-middleware";
import type { Scope, StaffRole } from "./staff-scopes";
import { findCycle, isValidSlug, slugPathFor, type PodcastFolder } from "./podcast-tree";
import { validateEpisodeDraft, storagePathFor, type EpisodeDraft } from "./podcast-authoring";
import {
  validateUpload,
  sniffAudioType,
  stagingPathFor,
  contentTypeFor,
  MAX_UPLOAD_BYTES,
} from "./admin-upload";
import { normalizeTranscript } from "./podcast-transcript";
import { isPublishableProvider, UNPUBLISHABLE_PROVIDER_MESSAGE } from "./podcast-provenance";
import { socialReasonMessage } from "./social-reason-copy";
import {
  bucketForEpisode,
  DRAFT_AUDIO_BUCKET,
  moveAudioForPublishState,
  PUBLIC_AUDIO_BUCKET,
} from "./podcast-audio-buckets";

// Matches podcast_folders/podcast_episodes.course's own CHECK constraint
// (20260926030000_podcast_library.sql) verbatim. Not imported from
// @/data/courses: that module drags in the full curriculum content
// (1000+ lines per language) for three literal strings.
const COURSE_IDS = ["en", "fr", "es"] as const;

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
  "adminCreateEpisodeUploadUrl",
  "adminCreateEpisode",
  "adminGetTranscript",
  "adminSaveTranscript",
  "adminListReports",
  "adminResetDisplayName",
  "adminRenameTeam",
  "adminDisbandTeam",
  "adminDismissReport",
] as const;

// Published audio is in the public bucket; everything else (drafts, uploads still being checked) is in the private
// drafts bucket. See src/lib/podcast-audio-buckets.ts.
const BUCKET = PUBLIC_AUDIO_BUCKET;
const DRAFTS = DRAFT_AUDIO_BUCKET;

/**
 * Calls one staff_podcast_* SQL function as the signed-in staff member. Each of them checks the reason (3 to 500
 * characters), makes the change and writes the action-record row in ONE transaction, so a change can never exist
 * without its reason and its record. The database error is returned, not thrown, so each caller can turn the
 * constraint it expects (a duplicate slug, a folder that still has episodes) into a sentence.
 */
async function podcastWrite(
  context: { supabaseAdmin: SupabaseClient; userId: string; staffRole: StaffRole },
  fn: string,
  args: Record<string, unknown>,
): Promise<{ data: unknown; error: { message: string; code?: string } | null }> {
  const { data, error } = await context.supabaseAdmin.rpc(fn, {
    p_actor: context.userId,
    p_role: context.staffRole,
    ...args,
  } as never);
  return { data, error };
}

/** The reason every podcast write carries: checked here for a readable refusal, and again in SQL. */
async function podcastReason(reason: unknown): Promise<string> {
  const { validateReason } = await import("./staff-audit.server");
  return validateReason(reason);
}

/** Every podcast write's input carries the reason the person typed. */
const reasonField = { reason: z.string() };

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
 * A folder with its real episode counts. The counts are null (never 0) when they could not be read, so the screen says
 * "Could not read" instead of showing an empty folder that may not be empty.
 */
export type AdminFolder = PodcastFolder & {
  episodeCount: number | null;
  publishedCount: number | null;
};

/** The whole folder tree, including branches with nothing published, each with its episode and published counts. */
export const adminListFolders = createServerFn({ method: "GET" })
  .middleware([requireStaff("podcasts.manage")])
  .handler(async ({ context }): Promise<AdminFolder[]> => {
    const [{ data, error }, counted] = await Promise.all([
      context.supabaseAdmin
        .from("podcast_folders")
        .select("id,parent_id,slug,title,description,sort_order")
        .order("sort_order", { ascending: true }),
      context.supabaseAdmin.rpc("staff_podcast_folder_counts"),
    ]);
    if (error) throw new Error(error.message);
    // Grouped in the database. A folder missing from the result has no episodes: a real zero, but only when the read worked.
    const counts = counted.error
      ? null
      : new Map(
          ((counted.data ?? []) as { folder_id: string; total: number; published: number }[]).map(
            (c) => [c.folder_id, { total: Number(c.total), published: Number(c.published) }],
          ),
        );
    return (data ?? []).map((row) => ({
      id: row.id,
      parentId: row.parent_id ?? null,
      slug: row.slug,
      title: row.title,
      description: row.description ?? null,
      sortOrder: row.sort_order,
      episodeCount: counts ? (counts.get(row.id)?.total ?? 0) : null,
      publishedCount: counts ? (counts.get(row.id)?.published ?? 0) : null,
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
  .middleware([requireStaff()])
  .handler(
    async ({
      context,
    }): Promise<{
      userId: string;
      role: StaffRole;
      scopes: Scope[];
      displayName: string | null;
    }> => {
      // The caller's own display name, for the navigation. A failed read is not a failed sign-in: no name is shown.
      const { data } = await context.supabaseAdmin
        .from("profiles")
        .select("display_name")
        .eq("id", context.userId)
        .maybeSingle();
      return {
        userId: context.userId,
        role: context.staffRole,
        scopes: context.staffScopes,
        displayName: data?.display_name ?? null,
      };
    },
  );

export const adminCreateFolder = createServerFn({ method: "POST" })
  .middleware([requireStaff("podcasts.manage")])
  .inputValidator((d: unknown) =>
    z
      .object({
        parentId: z.string().uuid().nullable(),
        slug: slugSchema,
        title: z.string().min(1).max(200),
        description: z.string().max(2000).nullable().default(null),
        sortOrder: z.number().int().min(0).default(0),
        ...reasonField,
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const reason = await podcastReason(data.reason);
    const { data: newId, error } = await podcastWrite(context, "staff_podcast_folder_create", {
      p_parent: data.parentId,
      p_slug: data.slug,
      p_title: data.title,
      p_description: data.description,
      p_sort_order: data.sortOrder,
      p_reason: reason,
    });
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
    return { id: newId as string };
  });

export const adminRenameFolder = createServerFn({ method: "POST" })
  .middleware([requireStaff("podcasts.manage")])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        title: z.string().min(1).max(200),
        description: z.string().max(2000).nullable().default(null),
        ...reasonField,
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const reason = await podcastReason(data.reason);
    // Title and description only. The slug is part of every episode's
    // storage path underneath this folder, so changing it here would
    // orphan audio without moving a single object.
    const { data: changed, error } = await podcastWrite(context, "staff_podcast_folder_rename", {
      p_id: data.id,
      p_title: data.title,
      p_description: data.description,
      p_reason: reason,
    });
    if (error) throw new Error(error.message);
    if (!changed) throw new Error("That folder no longer exists. Reload the list.");
    return { ok: true };
  });

export const adminMoveFolder = createServerFn({ method: "POST" })
  .middleware([requireStaff("podcasts.manage")])
  .inputValidator((d: unknown) =>
    z
      .object({ id: z.string().uuid(), parentId: z.string().uuid().nullable(), ...reasonField })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const reason = await podcastReason(data.reason);
    const client = context.supabaseAdmin;
    const { data: rows, error: readError } = await client
      .from("podcast_folders")
      .select("id,parent_id,slug,title,description,sort_order");
    if (readError) throw new Error(readError.message);
    const folders: PodcastFolder[] = (rows ?? []).map((row) => ({
      id: row.id,
      parentId: row.parent_id ?? null,
      slug: row.slug,
      title: row.title,
      description: row.description ?? null,
      sortOrder: row.sort_order,
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
    // The database checks the loop again in the same transaction as the write (the check above is for the readable message).
    const { data: changed, error } = await podcastWrite(context, "staff_podcast_folder_move", {
      p_id: data.id,
      p_parent: data.parentId,
      p_reason: reason,
    });
    if (error) {
      throw new Error(
        error.code === "23514" ? "That move would put the folder inside itself." : error.message,
      );
    }
    if (!changed) throw new Error("That folder no longer exists. Reload the list.");
    return { ok: true };
  });

export const adminDeleteFolder = createServerFn({ method: "POST" })
  .middleware([requireStaff("podcasts.manage")])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), ...reasonField }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const reason = await podcastReason(data.reason);
    const client = context.supabaseAdmin;
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
    const { data: removed, error } = await podcastWrite(context, "staff_podcast_folder_delete", {
      p_id: data.id,
      p_reason: reason,
    });
    if (error) {
      throw new Error(
        // ON DELETE RESTRICT raises restrict_violation (23001); a plain foreign key says 23503.
        error.code === "23001" || error.code === "23503"
          ? "Move or delete what is inside this folder first."
          : error.message,
      );
    }
    if (!removed) throw new Error("That folder was already deleted. Reload the list.");
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
  /** The first time it was published; null while it never was. */
  publishedAt: string | null;
  /** en | fr | es, or null when the episode has no language set. */
  course: string | null;
  /** Who made the audio (deepgram, human, ...) and the voice or model; null when never recorded. */
  voiceProvider: string | null;
  voiceModel: string | null;
  /** The public URL of the audio, built by the storage client from audioPath; null when it could not be built. */
  audioUrl: string | null;
};

/** Every episode in a folder, published or not. */
export const adminListEpisodes = createServerFn({ method: "GET" })
  .middleware([requireStaff("podcasts.manage")])
  .inputValidator((d: unknown) => z.object({ folderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<AdminEpisode[]> => {
    const { data: rows, error } = await context.supabaseAdmin
      .from("podcast_episodes")
      .select(
        "id,folder_id,slug,title,description,duration_seconds,published,audio_path,published_at,course,voice_provider,voice_model",
      )
      .eq("folder_id", data.folderId)
      .order("slug", { ascending: true });
    if (error) throw new Error(error.message);
    const bucket = context.supabaseAdmin.storage.from(BUCKET);
    const drafts = context.supabaseAdmin.storage.from(DRAFTS);
    // An unpublished episode has no public URL; the console player gets a one-hour signed link instead.
    const urls = await Promise.all(
      (rows ?? []).map(async (row) =>
        row.published
          ? (bucket.getPublicUrl(row.audio_path).data?.publicUrl ?? null)
          : ((await drafts.createSignedUrl(row.audio_path, 3600)).data?.signedUrl ?? null),
      ),
    );
    return (rows ?? []).map((row, index) => ({
      id: row.id,
      folderId: row.folder_id,
      slug: row.slug,
      title: row.title,
      description: row.description ?? null,
      durationSeconds: row.duration_seconds,
      published: row.published,
      audioPath: row.audio_path,
      publishedAt: row.published_at ?? null,
      course: row.course ?? null,
      voiceProvider: row.voice_provider ?? null,
      voiceModel: row.voice_model ?? null,
      audioUrl: urls[index],
    }));
  });

export const adminUpdateEpisode = createServerFn({ method: "POST" })
  .middleware([requireStaff("podcasts.manage")])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        title: z.string().min(1).max(200),
        description: z.string().max(4000).nullable().default(null),
        ...reasonField,
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const reason = await podcastReason(data.reason);
    // Slug is deliberately not editable. It is baked into the storage
    // path (see storagePathFor in podcast-authoring.ts), so renaming it
    // without moving the object orphans the audio -- and moving the
    // object is a different, riskier operation than editing a title.
    // Publish under a new slug instead.
    const { data: changed, error } = await podcastWrite(context, "staff_podcast_episode_update", {
      p_id: data.id,
      p_title: data.title,
      p_description: data.description,
      p_reason: reason,
    });
    if (error) throw new Error(error.message);
    if (!changed) throw new Error("That episode no longer exists. Reload the list.");
    return { ok: true };
  });

export const adminSetPublished = createServerFn({ method: "POST" })
  .middleware([requireStaff("podcasts.manage")])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), published: z.boolean(), ...reasonField }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const reason = await podcastReason(data.reason);
    // Publishing moves the audio too: it is copied into the public bucket before the row flips, and unpublishing
    // moves it back to the private drafts bucket, so unpublished audio cannot be fetched by URL.
    //
    // Publishing is also the point where the audio's provenance is
    // checked, the same rule scripts/podcast-tool.ts publish applies.
    // Admin uploads are recorded as 'unknown', so they cannot be
    // published from here until their audio is re-voiced. The database
    // CHECK podcast_episodes_published_licensed is the backstop.
    if (data.published) {
      const { data: row, error: readError } = await context.supabaseAdmin
        .from("podcast_episodes")
        // "*" and a cast, not select("voice_provider"): types.ts gains the
        // column only when regenerate-supabase-types runs after deploy.
        .select("*")
        .eq("id", data.id)
        .maybeSingle();
      if (readError) throw new Error(readError.message);
      if (!row) throw new Error("That episode no longer exists. Reload the list.");
      if (!isPublishableProvider((row as { voice_provider?: string | null }).voice_provider)) {
        throw new Error(UNPUBLISHABLE_PROVIDER_MESSAGE);
      }
    }
    const audioPath = await audioPathForEpisode(context.supabaseAdmin, data.id);
    // Another episode row may share this audio file: the public copy stays while one is published, the private one
    // while one is not.
    const { data: others, error: othersError } = await context.supabaseAdmin
      .from("podcast_episodes")
      .select("published")
      .eq("audio_path", audioPath)
      .neq("id", data.id);
    if (othersError) throw new Error(othersError.message);
    const sharers = Array.isArray(others) ? (others as { published: boolean }[]) : [];
    await moveAudioForPublishState({
      storage: context.supabaseAdmin.storage,
      path: audioPath,
      publish: data.published,
      sharedWith: {
        published: sharers.some((row) => row.published),
        unpublished: sharers.some((row) => !row.published),
      },
      onCleanupFailed: async (failure) => {
        // A draft is now public: write an ops_events row so the System health page and the owner alert see it.
        const { recordOpsEvent } = await import("./ops-events.server");
        await recordOpsEvent("publish_cleanup_failed", {
          bucket: failure.bucket,
          path: failure.paths[0] ?? null,
          path_count: failure.paths.length,
        });
      },
      flip: async () => {
        const { data: changed, error } = await podcastWrite(
          context,
          "staff_podcast_episode_set_published",
          { p_id: data.id, p_published: data.published, p_reason: reason },
        );
        if (error) {
          // The table's own CHECK is the backstop for audio the app may not distribute.
          throw new Error(error.code === "23514" ? UNPUBLISHABLE_PROVIDER_MESSAGE : error.message);
        }
        if (!changed) throw new Error("That episode no longer exists. Reload the list.");
      },
    });
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
async function audioPathForEpisode(
  client: SupabaseClient<Database>,
  episodeId: string,
): Promise<string> {
  const { data, error } = await client
    .from("podcast_episodes")
    .select("audio_path")
    .eq("id", episodeId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("That episode no longer exists.");
  return data.audio_path;
}

/** The bucket an existing episode's audio is in right now, from its published flag. */
async function audioBucketForEpisode(
  client: SupabaseClient<Database>,
  episodeId: string,
): Promise<string> {
  const { data, error } = await client
    .from("podcast_episodes")
    .select("published")
    .eq("id", episodeId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("That episode no longer exists.");
  return bucketForEpisode(data.published);
}

/**
 * Builds and validates a new episode's draft, the same rule
 * scripts/podcast-tool.ts's `add` command enforces (validateEpisodeDraft
 * is shared with it, not reimplemented), and resolves the folder's full
 * slug path so storagePathFor can place the audio object correctly.
 */
async function draftForNewEpisode(
  client: SupabaseClient<Database>,
  input: {
    folderId: string;
    slug: string;
    title: string;
    description: string | null;
    course: EpisodeDraft["course"];
    levelId: string | null;
  },
): Promise<EpisodeDraft> {
  const { data: folderRows, error: folderError } = await client
    .from("podcast_folders")
    .select("id,parent_id,slug,title,description,sort_order");
  if (folderError) throw new Error(folderError.message);
  const folders: PodcastFolder[] = (folderRows ?? []).map((row) => ({
    id: row.id,
    parentId: row.parent_id ?? null,
    slug: row.slug,
    title: row.title,
    description: row.description ?? null,
    sortOrder: row.sort_order,
  }));
  const folderSlugPath = slugPathFor(folders, input.folderId);
  if (!folderSlugPath) throw new Error("That folder no longer exists. Reload the list.");

  const { data: siblings, error: siblingError } = await client
    .from("podcast_episodes")
    .select("slug")
    .eq("folder_id", input.folderId);
  if (siblingError) throw new Error(siblingError.message);

  const draft: EpisodeDraft = {
    folderSlugPath,
    slug: input.slug,
    title: input.title,
    description: input.description,
    source: "upload",
    course: input.course,
    levelId: input.levelId,
  };
  const problems = validateEpisodeDraft(
    draft,
    (siblings ?? []).map((row) => row.slug),
  );
  // Same posture as the CLI: a named list of everything wrong at once,
  // not one refusal per re-submit.
  if (problems.length > 0) throw new Error(problems.join(" "));
  return draft;
}

/**
 * Downloads a staged object, refuses anything that is not real,
 * readable audio, and reports what it found. Shared by the "replace an
 * existing episode's audio" flow and the "first upload for a brand-new
 * episode" flow below -- both need the exact same sniff-then-parse
 * check, and a second copy of it is a second thing to get wrong.
 *
 * Always removes the staged object before returning or throwing: a
 * caller either promotes the returned buffer itself right after (so the
 * staging copy is redundant) or the upload was refused (so it must not
 * linger).
 */
async function verifyStagedAudio(
  client: SupabaseClient<Database>,
  stagingPath: string,
): Promise<{ buffer: Buffer; contentType: string; durationSeconds: number }> {
  const reject = async (message: string): Promise<never> => {
    await client.storage.from(DRAFTS).remove([stagingPath]);
    throw new Error(message);
  };

  const { data: blob, error: downloadError } = await client.storage
    .from(DRAFTS)
    .download(stagingPath);
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
  let durationSeconds = 0;
  try {
    const { parseBuffer } = await import("music-metadata");
    const metadata = await parseBuffer(buffer, { mimeType: contentTypeFor(kind) });
    durationSeconds = Math.round(metadata.format.duration ?? 0);
  } catch {
    return reject("That file could not be read as audio. It may be truncated.");
  }
  if (durationSeconds <= 0) {
    return reject("Could not read a duration from that file. It may be truncated.");
  }

  await client.storage.from(DRAFTS).remove([stagingPath]);
  return { buffer, contentType: contentTypeFor(kind), durationSeconds };
}

/**
 * Signed upload URL for a BRAND-NEW episode's first audio -- the
 * counterpart to adminCreateAudioUploadUrl below, which requires the
 * episode (and therefore its audio_path) to already exist.
 * podcast_episodes.audio_path and duration_seconds are both NOT NULL
 * (duration_seconds also CHECK > 0), so there is no "create the row,
 * then fill in the file" order available here the way replacing audio
 * has -- the object must be uploaded and verified FIRST, and
 * adminCreateEpisode below inserts the row only once that succeeds.
 *
 * The path is computed here from folderId + slug rather than trusted
 * from the client, same reasoning as audioPathForEpisode: it is
 * recomputed identically in adminCreateEpisode, so the two cannot
 * disagree about where the bytes belong.
 */
export const adminCreateEpisodeUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireStaff("podcasts.manage")])
  .inputValidator((d: unknown) =>
    z
      .object({
        folderId: z.string().uuid(),
        slug: slugSchema,
        title: z.string().min(1).max(200),
        description: z.string().max(4000).nullable().default(null),
        course: z.enum(COURSE_IDS).nullable().default(null),
        levelId: z.string().min(1).nullable().default(null),
        declaredBytes: z.number().int().positive(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ signedUrl: string; token: string }> => {
    if (data.declaredBytes > MAX_UPLOAD_BYTES) {
      throw new Error(
        `That file is too large (${Math.round(data.declaredBytes / 1024 / 1024)} MB). The limit is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`,
      );
    }
    const client = context.supabaseAdmin;
    const draft = await draftForNewEpisode(client, data);
    const audioPath = storagePathFor(draft);
    const { data: signed, error } = await client.storage
      .from(DRAFTS)
      .createSignedUploadUrl(stagingPathFor(audioPath), { upsert: true });
    if (error || !signed) throw new Error(error?.message ?? "Could not start the upload.");
    return { signedUrl: signed.signedUrl, token: signed.token };
  });

/**
 * Verifies the just-uploaded staging object and, only if it is real
 * audio, promotes it onto the live path and inserts the episode row --
 * unpublished, matching scripts/podcast-tool.ts's own new-episode
 * default. Takes the same fields as adminCreateEpisodeUploadUrl (minus
 * declaredBytes) so it can recompute the identical draft and path;
 * nothing about where the audio lives is ever accepted from the client.
 *
 * If the insert fails after the object is already promoted (e.g. a
 * second admin took the same slug in the gap between the two calls),
 * the object is left in place rather than guessed-deleted -- same
 * accepted risk podcast-tool.ts's own `add` command documents at its
 * insert step, not a new one introduced here.
 */
export const adminCreateEpisode = createServerFn({ method: "POST" })
  .middleware([requireStaff("podcasts.manage")])
  .inputValidator((d: unknown) =>
    z
      .object({
        folderId: z.string().uuid(),
        slug: slugSchema,
        title: z.string().min(1).max(200),
        description: z.string().max(4000).nullable().default(null),
        course: z.enum(COURSE_IDS).nullable().default(null),
        levelId: z.string().min(1).nullable().default(null),
        ...reasonField,
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ id: string; durationSeconds: number }> => {
    // Before the audio is read or promoted: a missing reason must not leave a promoted object behind.
    const reason = await podcastReason(data.reason);
    const client = context.supabaseAdmin;
    const draft = await draftForNewEpisode(client, data);
    const audioPath = storagePathFor(draft);
    const { buffer, contentType, durationSeconds } = await verifyStagedAudio(
      client,
      stagingPathFor(audioPath),
    );

    // A new episode is unpublished, so its audio lands in the private drafts bucket.
    const { error: promoteError } = await client.storage
      .from(DRAFTS)
      .upload(audioPath, buffer, { contentType, upsert: true });
    if (promoteError) throw new Error(promoteError.message);

    const { data: newId, error } = await podcastWrite(context, "staff_podcast_episode_create", {
      p_folder: data.folderId,
      p_slug: data.slug,
      p_title: data.title,
      p_description: data.description,
      p_audio_path: audioPath,
      p_duration: durationSeconds,
      p_course: data.course,
      p_level: data.levelId,
      p_reason: reason,
    });
    if (error) {
      throw new Error(
        error.code === "23505"
          ? `An episode with slug "${data.slug}" already exists in this folder. The audio uploaded to ${DRAFTS}/${audioPath} anyway -- delete it manually or reuse it with a different slug.`
          : `Upload succeeded but the database insert failed: ${error.message}. Orphaned object: ${DRAFTS}/${audioPath}`,
      );
    }
    return { id: newId as string, durationSeconds };
  });

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
  .middleware([requireStaff("podcasts.manage")])
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
    const client = context.supabaseAdmin;
    const audioPath = await audioPathForEpisode(client, data.episodeId);
    const { data: signed, error } = await client.storage
      .from(DRAFTS)
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
  .middleware([requireStaff("podcasts.manage")])
  .inputValidator((d: unknown) =>
    z.object({ episodeId: z.string().uuid(), ...reasonField }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true; durationSeconds: number }> => {
    const reason = await podcastReason(data.reason);
    const client = context.supabaseAdmin;
    const audioPath = await audioPathForEpisode(client, data.episodeId);
    const { buffer, contentType, durationSeconds } = await verifyStagedAudio(
      client,
      stagingPathFor(audioPath),
    );

    // Promote: copy onto the live path. Content type is set from the
    // sniffed bytes rather than from whatever the browser PUT, because
    // the stored type is what the bucket serves with -- sniffing alone
    // does not control that.
    const liveBucket = await audioBucketForEpisode(client, data.episodeId);
    const { error: promoteError } = await client.storage
      .from(liveBucket)
      .upload(audioPath, buffer, { contentType, upsert: true });
    if (promoteError) throw new Error(promoteError.message);

    // Written only after the live object is the verified one. A row
    // claiming a duration the file does not have is exactly what the iOS
    // cache's durationDisagrees check reads as a truncated download.
    const { data: changed, error } = await podcastWrite(
      context,
      "staff_podcast_episode_audio_replace",
      { p_id: data.episodeId, p_duration: durationSeconds, p_reason: reason },
    );
    if (error) throw new Error(error.message);
    if (!changed) throw new Error("That episode no longer exists. Reload the list.");
    return { ok: true, durationSeconds };
  });

export const adminGetTranscript = createServerFn({ method: "GET" })
  .middleware([requireStaff("podcasts.manage")])
  .inputValidator((d: unknown) => z.object({ episodeId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ text: string | null }> => {
    const { data: row, error } = await context.supabaseAdmin
      .from("podcast_transcripts")
      .select("text")
      .eq("episode_id", data.episodeId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { text: row?.text ?? null };
  });

export const adminSaveTranscript = createServerFn({ method: "POST" })
  .middleware([requireStaff("podcasts.manage")])
  .inputValidator((d: unknown) =>
    z
      .object({ episodeId: z.string().uuid(), text: z.string().max(200_000), ...reasonField })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const reason = await podcastReason(data.reason);
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
    // Empty is a deletion request, not an error: clearing the box is how an admin removes a transcript that should never
    // have been published. Refusing would leave them no way to undo it. The SQL function deletes on empty text.
    const { error } = await podcastWrite(context, "staff_podcast_transcript_save", {
      p_episode: data.episodeId,
      p_text: normalized ?? "",
      p_reason: reason,
    });
    if (error) {
      throw new Error(
        error.code === "23503" ? "That episode no longer exists. Reload the list." : error.message,
      );
    }
    return { ok: true };
  });

export type AdminReport = {
  id: string;
  kind: "user" | "team_name" | "ai_response";
  /** Null once the reporter's account is deleted (the report is kept for 90 days, see accountDeletedAt). */
  reporterId: string | null;
  reporterName: string;
  /** Null for an AI-response report, and once the reported account is deleted. */
  reportedId: string | null;
  /** Null only for an AI-response report, which names no account. */
  reportedName: string | null;
  reason: string;
  /** The report's own detail (team_id, or an AI reply's source/course/message); JSON so it crosses the server boundary. */
  context: { [key: string]: Json | undefined } | null;
  teamId: string | null;
  /** The team's current name, so the admin sees what they are renaming or disbanding; null if it is gone. */
  teamName: string | null;
  createdAt: string;
  /** When an account on this report was deleted; the maintenance sweep removes the report 90 days later. */
  accountDeletedAt: string | null;
  /**
   * How many OPEN reports name the same target (this one included): the same learner for a learner report, the same
   * team for a team-name report. Null when the report has no target to count (an AI response, or an account that is
   * gone), so "unknown" is never a 1.
   */
  repeatCount: number | null;
};

const LEGACY_TEAM_REASON = /^team_name:([0-9a-f-]{36}):/i;

/** The team a report is about: context.team_id (current clients) or the legacy iOS reason prefix. */
export function teamIdForReport(report: { reason: string; context: unknown }): string | null {
  const teamId = (report.context as { team_id?: unknown } | null)?.team_id;
  if (typeof teamId === "string" && z.string().uuid().safeParse(teamId).success) return teamId;
  return LEGACY_TEAM_REASON.exec(report.reason)?.[1] ?? null;
}

/**
 * Every abuse report, newest first, with both accounts' display names
 * joined on. content_reports is insert-only from the client (RLS has no
 * select policy at all -- supabase/migrations/20260928020000_block_and_report.sql)
 * and service_role bypasses that, so this is the only place these rows
 * are ever read back. Before this existed, a report went into a table
 * nobody looked at -- storage without action, the same defect class
 * blocking itself was until enforcement was wired into every read/write
 * path in that same migration.
 *
 * Two queries, not a PostgREST embed: content_reports.reporter/reported
 * both reference auth.users, and profiles.id also references auth.users,
 * but there is no FK between content_reports and profiles directly for
 * PostgREST to embed across.
 *
 * A report outlives a deleted account for 90 days (20261105101100): its reporter or reported id is then NULL and
 * account_deleted_at is set, so that side shows as "(deleted account)" and no lookup is made for it.
 */
export const adminListReports = createServerFn({ method: "GET" })
  .middleware([requireStaff("reports.manage")])
  .handler(async ({ context }): Promise<AdminReport[]> => {
    const { data: reports, error } = await context.supabaseAdmin
      .from("content_reports")
      .select("id, kind, reporter, reported, reason, context, created_at, account_deleted_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    if (!reports || reports.length === 0) return [];

    const userIds = [
      ...new Set(
        reports.flatMap((r) => [r.reporter, r.reported]).filter((id): id is string => !!id),
      ),
    ];
    const nameById = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: profiles, error: profilesError } = await context.supabaseAdmin
        .from("profiles")
        .select("id, display_name")
        .in("id", userIds);
      if (profilesError) throw new Error(profilesError.message);
      for (const p of profiles ?? []) nameById.set(p.id, p.display_name);
    }
    const nameOf = (id: string | null) =>
      (id ? nameById.get(id) : undefined) ?? "(deleted account)";

    const teamIds = [
      ...new Set(
        reports
          .map((r) => teamIdForReport({ reason: r.reason, context: r.context }))
          .filter((id): id is string => !!id),
      ),
    ];
    const teamNameById = new Map<string, string>();
    if (teamIds.length > 0) {
      const { data: teams, error: teamsError } = await context.supabaseAdmin
        .from("teams")
        .select("id, name")
        .in("id", teamIds);
      if (teamsError) throw new Error(teamsError.message);
      for (const t of teams ?? []) teamNameById.set(t.id, t.name);
    }

    // Open reports per target. Every row read here is open (a handled report is deleted), so this is the real count.
    const targetOf = (r: (typeof reports)[number]): string | null => {
      const team = teamIdForReport({ reason: r.reason, context: r.context });
      if (r.kind === "team_name" || team) return team ? `team:${team}` : null;
      return r.kind === "user" && r.reported ? `user:${r.reported}` : null;
    };
    const perTarget = new Map<string, number>();
    for (const r of reports) {
      const t = targetOf(r);
      if (t) perTarget.set(t, (perTarget.get(t) ?? 0) + 1);
    }

    return reports.map((r) => ({
      id: r.id,
      kind: r.kind as AdminReport["kind"],
      reporterId: r.reporter,
      reporterName: nameOf(r.reporter),
      reportedId: r.reported,
      reportedName: r.kind === "ai_response" ? null : nameOf(r.reported),
      reason: r.reason,
      context: (r.context as { [key: string]: Json | undefined } | null) ?? null,
      teamId: teamIdForReport({ reason: r.reason, context: r.context }),
      teamName:
        teamNameById.get(teamIdForReport({ reason: r.reason, context: r.context }) ?? "") ?? null,
      createdAt: r.created_at,
      accountDeletedAt: r.account_deleted_at ?? null,
      repeatCount: perTarget.get(targetOf(r) ?? "") ?? null,
    }));
  });

type ReportRow = {
  id: string;
  kind: string;
  reported: string | null;
  reason: string;
  context: unknown;
};
type AdminClient = SupabaseClient<Database>;

async function loadReport(supabaseAdmin: AdminClient, reportId: string): Promise<ReportRow> {
  const { data, error } = await supabaseAdmin
    .from("content_reports")
    .select("id, kind, reported, reason, context")
    .eq("id", reportId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("That report no longer exists.");
  return data as ReportRow;
}

async function resolveReport(supabaseAdmin: AdminClient, reportId: string): Promise<void> {
  affectedOrThrow(
    await supabaseAdmin.from("content_reports").delete({ count: "exact" }).eq("id", reportId),
    "That report no longer exists.",
  );
}

const reportIdSchema = z.object({ reportId: z.string().uuid() });
/** Every report action carries the reason the person typed; the handler checks its length and the SQL checks it again. */
const reportActionSchema = reportIdSchema.extend({ reason: z.string() });

/** Audit trail: one structured line per admin action, ids only (never names, reasons or messages). */
function logAdminAction(
  action: string,
  reportId: string,
  targetId: string | null,
  adminId: string,
) {
  console.info(JSON.stringify({ event: "admin_action", action, reportId, targetId, adminId }));
}

const ACTION_DONE_REPORT_KEPT = "Action done, but the report wasn't dismissed. Refresh the list.";

/** After an action that already changed something: a failed resolve must not read as a failed action. */
async function resolveAfterAction(supabaseAdmin: AdminClient, reportId: string): Promise<void> {
  try {
    await resolveReport(supabaseAdmin, reportId);
  } catch {
    throw new Error(ACTION_DONE_REPORT_KEPT);
  }
}

/**
 * The four report actions each change something AND write the action record in one database call (the staff_*
 * functions in 20261113100000_staff_console.sql), so there is no change without a record. The report itself is
 * resolved afterwards, as before.
 */
export const adminDismissReport = createServerFn({ method: "POST" })
  .middleware([requireStaff("reports.manage")])
  .inputValidator((d: unknown) => reportActionSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { validateReason } = await import("./staff-audit.server");
    const reason = validateReason(data.reason);
    const report = await loadReport(context.supabaseAdmin, data.reportId);
    const { data: removed, error } = await context.supabaseAdmin.rpc("staff_dismiss_report", {
      p_actor: context.userId,
      p_role: context.staffRole,
      p_target: report.reported,
      p_report: data.reportId,
      p_reason: reason,
    } as never);
    if (error) throw new Error(error.message);
    if (!removed) throw new Error("That report no longer exists.");
    logAdminAction("dismiss_report", data.reportId, null, context.userId);
    return { ok: true };
  });

/** A fresh Learner-XXXX handle for the reported account; they are asked to choose a name again. */
export const adminResetDisplayName = createServerFn({ method: "POST" })
  .middleware([requireStaff("reports.manage")])
  .inputValidator((d: unknown) => reportActionSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true; newName: string }> => {
    const { validateReason } = await import("./staff-audit.server");
    const reason = validateReason(data.reason);
    const report = await loadReport(context.supabaseAdmin, data.reportId);
    if (!report.reported) throw new Error("This report has no account to rename.");
    const { data: newName, error } = await context.supabaseAdmin.rpc("staff_reset_display_name", {
      p_actor: context.userId,
      p_role: context.staffRole,
      p_target: report.reported,
      p_report: data.reportId,
      p_reason: reason,
    } as never);
    if (error) throw new Error(error.message);
    if (!newName) throw new Error("That account no longer exists.");
    logAdminAction("reset_display_name", data.reportId, report.reported, context.userId);
    await resolveAfterAction(context.supabaseAdmin, data.reportId);
    return { ok: true, newName: newName as string };
  });

export const adminRenameTeam = createServerFn({ method: "POST" })
  .middleware([requireStaff("reports.manage")])
  .inputValidator((d: unknown) =>
    reportActionSchema.extend({ name: z.string().min(1).max(80) }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { validateReason } = await import("./staff-audit.server");
    const reason = validateReason(data.reason);
    const report = await loadReport(context.supabaseAdmin, data.reportId);
    const teamId = teamIdForReport(report);
    if (!teamId) throw new Error("This report is not about a team.");
    const { data: refusal, error } = await context.supabaseAdmin.rpc("staff_rename_team", {
      p_actor: context.userId,
      p_role: context.staffRole,
      p_target: report.reported,
      p_report: data.reportId,
      p_team: teamId,
      p_name: data.name,
      p_reason: reason,
    } as never);
    if (error) throw new Error(error.message);
    if (refusal) throw new Error(socialReasonMessage(refusal as string));
    logAdminAction("rename_team", data.reportId, teamId, context.userId);
    await resolveAfterAction(context.supabaseAdmin, data.reportId);
    return { ok: true };
  });

/** Deletes the team the report names; members, missions, rewards and kicks cascade. */
export const adminDisbandTeam = createServerFn({ method: "POST" })
  .middleware([requireStaff("reports.manage")])
  .inputValidator((d: unknown) => reportActionSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { validateReason } = await import("./staff-audit.server");
    const reason = validateReason(data.reason);
    const report = await loadReport(context.supabaseAdmin, data.reportId);
    const teamId = teamIdForReport(report);
    if (!teamId) throw new Error("This report is not about a team.");
    const { data: removed, error } = await context.supabaseAdmin.rpc("staff_disband_team", {
      p_actor: context.userId,
      p_role: context.staffRole,
      p_target: report.reported,
      p_report: data.reportId,
      p_team: teamId,
      p_reason: reason,
    } as never);
    if (error) throw new Error(error.message);
    if (!removed) throw new Error("That team no longer exists.");
    logAdminAction("disband_team", data.reportId, teamId, context.userId);
    await resolveAfterAction(context.supabaseAdmin, data.reportId);
    return { ok: true };
  });
