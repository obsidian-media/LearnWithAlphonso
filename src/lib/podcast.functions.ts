import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { PodcastFolder } from "./podcast-tree";
import { buildIlikeOrFilter } from "./podcast-search";

/**
 * Read/write server functions for the podcast library (Phase 1a, see
 * docs/superpowers/specs/2026-09-24-podcast-library-phase1-design.md).
 * Same shape as review.functions.ts: createServerFn + requireSupabaseAuth
 * + a zod validator.
 *
 * Episode rows are filtered to published=true by RLS
 * (supabase/migrations/20260926010000_podcast_library.sql), so no handler
 * here re-checks it.
 */

const BUCKET = "podcast-audio";

export type PodcastEpisode = {
  id: string;
  folderId: string;
  slug: string;
  title: string;
  description: string | null;
  audioUrl: string;
  durationSeconds: number;
  positionSeconds: number;
};

/**
 * The generated Database type (src/integrations/supabase/types.ts) does
 * not yet know the podcast tables -- regenerating it requires the live
 * project, which the migration has still to be applied to. Until then
 * these handlers talk to an untyped client rather than hand-editing a
 * generated file. Once types are regenerated, delete this and use
 * `context.supabase` directly; the queries below are unchanged by it.
 */
function untyped(client: unknown): SupabaseClient {
  return client as SupabaseClient;
}

/**
 * Clamps a stored resume position onto an episode. Returns 0 when the
 * position is at or beyond the end -- an episode can be re-uploaded
 * shorter than a saved position, and seeking past the end strands the
 * player rather than restarting it.
 */
export function clampPosition(position: number, durationSeconds: number): number {
  if (!Number.isFinite(position) || position <= 0) return 0;
  if (position >= durationSeconds - 1) return 0;
  return position;
}

type FolderRow = {
  id: string;
  parent_id: string | null;
  slug: string;
  title: string;
  description: string | null;
  sort_order: number;
};

type EpisodeRow = {
  id: string;
  folder_id: string;
  slug: string;
  title: string;
  description: string | null;
  audio_path: string;
  duration_seconds: number;
};

/** Every folder, flat. The clients build the tree (see podcast-tree.ts). */
export const listFolders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PodcastFolder[]> => {
    const db = untyped(context.supabase);
    const { data, error } = await db
      .from("podcast_folders")
      .select("id, parent_id, slug, title, description, sort_order")
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return ((data ?? []) as FolderRow[]).map((row) => ({
      id: row.id,
      parentId: row.parent_id,
      slug: row.slug,
      title: row.title,
      description: row.description,
      sortOrder: row.sort_order,
    }));
  });

/** Published episodes in one folder, with this user's resume position. */
export const listEpisodes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ folderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<PodcastEpisode[]> => {
    const db = untyped(context.supabase);
    const { userId } = context;

    const episodesRes = await db
      .from("podcast_episodes")
      .select("id, folder_id, slug, title, description, audio_path, duration_seconds")
      .eq("folder_id", data.folderId)
      .order("sort_order", { ascending: true });
    if (episodesRes.error) throw new Error(episodesRes.error.message);

    const episodes = (episodesRes.data ?? []) as EpisodeRow[];

    // Scoped to the episodes actually being shown. An unfiltered read
    // returns one row per episode this user has ever started, which
    // grows without bound for an engaged learner while the result is
    // only used as a lookup over the dozen ids on screen.
    const playbackRes = episodes.length
      ? await db
          .from("podcast_playback")
          .select("episode_id, position_seconds")
          .eq("user_id", userId)
          .in(
            "episode_id",
            episodes.map((row) => row.id),
          )
          .then(
            (result) => result,
            // A failed playback read is not worth failing the whole
            // listing over: the episodes still play, they just start
            // from the beginning. Catching the rejection matters --
            // inside a Promise.all a transport failure took the entire
            // folder listing down with it.
            () => ({ data: [] as { episode_id: string; position_seconds: number }[] }),
          )
      : { data: [] as { episode_id: string; position_seconds: number }[] };

    const positions = new Map<string, number>(
      ((playbackRes.data ?? []) as { episode_id: string; position_seconds: number }[]).map(
        (row) => [row.episode_id, row.position_seconds],
      ),
    );

    return episodes.map((row) => ({
      id: row.id,
      folderId: row.folder_id,
      slug: row.slug,
      title: row.title,
      description: row.description,
      audioUrl: db.storage.from(BUCKET).getPublicUrl(row.audio_path).data.publicUrl,
      durationSeconds: row.duration_seconds,
      positionSeconds: clampPosition(positions.get(row.id) ?? 0, row.duration_seconds),
    }));
  });

export const savePlaybackPosition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        episodeId: z.string().uuid(),
        positionSeconds: z.number().min(0),
        completed: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ positionSeconds: number }> => {
    const db = untyped(context.supabase);
    const positionSeconds = Math.round(data.positionSeconds);
    const { error } = await db.from("podcast_playback").upsert(
      {
        user_id: context.userId,
        episode_id: data.episodeId,
        position_seconds: positionSeconds,
        // completed_at exists precisely to record completion; without
        // this it was never written by anything, and completion was
        // being inferred from the play-events table instead.
        ...(data.completed ? { completed_at: new Date().toISOString() } : {}),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,episode_id" },
    );
    if (error) throw new Error(error.message);
    return { positionSeconds };
  });

/**
 * One row per play session. Without this there is no evidence anyone
 * listens, and Phase 2 would build transcripts and quizzes on content of
 * unknown value.
 */
export const recordPlayEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ episodeId: z.string().uuid(), secondsListened: z.number().min(0) }).parse(d),
  )
  .handler(async ({ data, context }): Promise<void> => {
    const db = untyped(context.supabase);
    // Through the SECURITY DEFINER function, never a direct insert:
    // `authenticated` no longer holds INSERT on this table (see
    // supabase/migrations/20260926223031_podcast_play_event_rpc.sql). The
    // function takes the user from auth.uid() and the timestamp from
    // now(), and bounds seconds_listened by the episode's real duration,
    // so none of those three can be dictated by a client.
    const { error } = await db.rpc("record_podcast_play_event", {
      _episode_id: data.episodeId,
      _seconds_listened: Math.round(data.secondsListened),
    });
    if (error) throw new Error(error.message);
  });

/**
 * Episodes whose title or description contains `query`, across every folder.
 *
 * Search is flat by design: the reason to search is not knowing where a thing
 * lives. RLS keeps this to published episodes.
 *
 * The filter comes from `buildIlikeOrFilter`, which escapes LIKE wildcards
 * and quotes the value -- PostgREST's `or=` treats commas and parentheses as
 * syntax, and neither failure would look like a failure: both return
 * plausible-looking results for the wrong query.
 */
export const searchEpisodes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ query: z.string() }).parse(d))
  .handler(async ({ data, context }): Promise<PodcastEpisode[]> => {
    const filter = buildIlikeOrFilter(data.query, ["title", "description"]);
    // Too short, or nothing but whitespace: an empty result. Not an error,
    // and emphatically not every episode in the library.
    if (filter === null) return [];

    const db = untyped(context.supabase);
    const { data: rows, error } = await db
      .from("podcast_episodes")
      .select("id, folder_id, slug, title, description, audio_path, duration_seconds")
      .or(filter)
      .order("title", { ascending: true })
      .limit(50);
    if (error) throw new Error(error.message);

    return ((rows ?? []) as EpisodeRow[]).map((row) => ({
      id: row.id,
      folderId: row.folder_id,
      slug: row.slug,
      title: row.title,
      description: row.description,
      audioUrl: db.storage.from(BUCKET).getPublicUrl(row.audio_path).data.publicUrl,
      durationSeconds: row.duration_seconds,
      // Resume position is deliberately not joined here: a search result is a
      // way to find an episode, and the player reads the authoritative
      // position when it opens one.
      positionSeconds: 0,
    }));
  });
