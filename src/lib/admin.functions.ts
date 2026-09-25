import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "./admin-middleware";
import type { PodcastFolder } from "./podcast-tree";

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
export const ADMIN_FUNCTION_NAMES = ["adminListFolders", "adminWhoAmI"] as const;

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
