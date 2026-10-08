-- iOS resume never saved a first position.
--
-- PodcastClient.savePlaybackPosition POSTs {episode_id, position_seconds,
-- updated_at} with no user_id (a client should not have to know, or be
-- trusted with, its own id), and user_id had no default, so every first save
-- failed NOT NULL (23502) inside a swallowed error. On 2026-10-07 the table
-- held 2 rows in total, both written by the web app, which sends user_id
-- itself. Android's PodcastClient sends the same body as iOS.
--
-- auth.uid() follows the caller, which is exactly what podcast_playback_own's
-- WITH CHECK already demands, so this widens nothing: a row can still only be
-- written for yourself. A service-role insert (no JWT) still has to name the
-- user, because auth.uid() is NULL there and NOT NULL rejects it.
--
-- Rollback:
--   ALTER TABLE public.podcast_playback ALTER COLUMN user_id DROP DEFAULT;
-- (The DO block below adds nothing while the primary key exists.)
ALTER TABLE public.podcast_playback ALTER COLUMN user_id SET DEFAULT auth.uid();

-- The client now upserts with on_conflict=user_id,episode_id. PostgREST needs
-- a unique index on exactly those columns. The primary key (user_id,
-- episode_id) from 20260926030000_podcast_library.sql is one (confirmed in
-- the live catalog 2026-10-07). Assert it rather than trust it, and add a
-- unique constraint only if it has gone missing.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_index i
    WHERE i.indrelid = 'public.podcast_playback'::regclass
      AND i.indisunique
      AND i.indpred IS NULL
      AND (
        SELECT array_agg(a.attname::text ORDER BY a.attname)
        FROM unnest(i.indkey::int2[]) AS k(attnum)
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
      ) = ARRAY['episode_id', 'user_id']
  ) THEN
    ALTER TABLE public.podcast_playback
      ADD CONSTRAINT podcast_playback_user_episode_key UNIQUE (user_id, episode_id);
  END IF;
END $$;
