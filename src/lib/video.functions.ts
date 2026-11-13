import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicError } from "./public-error";
import {
  toLibraryVideo,
  type LibraryVideo,
  type VideoRow,
  type VideoWatchRow,
} from "./video-library";

/**
 * Read and write server functions for the Library's Watch shelf (migration 20261115100000_videos_watch_shelf.sql).
 * Same shape as podcast.functions.ts: createServerFn + requireSupabaseAuth + a zod validator. Rows are filtered to
 * published videos by RLS, so no handler re-checks it.
 *
 * The generated types.ts does not know these tables until the migration is deployed and "Regenerate Supabase Types" has
 * run, so the client is cast once here (the same `untyped` pattern as profile.functions.ts) and the rows are typed by
 * VideoRow / VideoWatchRow. The cast goes when types.ts catches up.
 */
const BUCKET = "videos";

export const VIDEO_COLUMNS =
  "id, slug, course, title, description, level_id, duration_seconds, video_path, poster_path, captions_path, tags, practice_kind, practice_id, sort_order";

/** Every published video, with this learner's progress. A failed progress read shows every video as new, not an error. */
export const listVideos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LibraryVideo[]> => {
    const db = context.supabase as unknown as SupabaseClient;
    const [videos, watches] = await Promise.all([
      db.from("videos").select(VIDEO_COLUMNS).order("sort_order", { ascending: true }),
      db
        .from("video_watches")
        .select("video_id, progress_seconds, completed_at")
        .eq("user_id", context.userId),
    ]);
    if (videos.error) throw publicError(null, videos.error);
    const watched = new Map(
      ((watches.error ? [] : watches.data) as VideoWatchRow[] | null)?.map((w) => [w.video_id, w]),
    );
    const publicUrl = (path: string) => db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    return ((videos.data ?? []) as VideoRow[])
      .map((row) => toLibraryVideo(row, watched.get(row.id), publicUrl))
      .filter((v): v is LibraryVideo => v !== null);
  });

/** Saves progress through the clamping, own-row-only database function. The end of the video completes it. */
export const saveVideoProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ videoId: z.string().uuid(), progressSeconds: z.number().min(0) }).parse(d),
  )
  .handler(async ({ data, context }): Promise<void> => {
    const db = context.supabase as unknown as SupabaseClient;
    const { error } = await db.rpc("save_video_progress", {
      p_video_id: data.videoId,
      // Capped below int4 so "the very end" reaches the database's own clamp instead of overflowing it.
      p_progress_s: Math.min(Math.round(data.progressSeconds), 2_000_000_000),
    });
    if (error) throw publicError(null, error);
  });
