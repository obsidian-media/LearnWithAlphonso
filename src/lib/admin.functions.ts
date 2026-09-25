import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireAdmin } from "./admin-middleware";
import { findCycle, isValidSlug, type PodcastFolder } from "./podcast-tree";

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
] as const;

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
  if (folderId === newParentId) return true;
  const moved = folders.map((f) => (f.id === folderId ? { ...f, parentId: newParentId } : f));
  return findCycle(moved) !== null;
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
    const { error } = await untyped(context.supabaseAdmin)
      .from("podcast_folders")
      .update({ title: data.title, description: data.description })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
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
    if (wouldCreateCycle(folders, data.id, data.parentId)) {
      throw new Error("That move would put the folder inside itself.");
    }
    const { error } = await client
      .from("podcast_folders")
      .update({ parent_id: data.parentId })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
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
    const { error } = await client.from("podcast_folders").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
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
    const { error } = await untyped(context.supabaseAdmin)
      .from("podcast_episodes")
      .update({ title: data.title, description: data.description })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
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
    const { error } = await untyped(context.supabaseAdmin)
      .from("podcast_episodes")
      .update({ published: data.published })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
