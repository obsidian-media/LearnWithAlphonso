-- Podcast / audio library, Phase 1a (docs/superpowers/specs/
-- 2026-09-24-podcast-library-phase1-design.md). A folder tree of
-- audio episodes published by the account owner via
-- scripts/podcast-tool.ts. Only service_role writes: there is no
-- client insert/update policy on folders or episodes anywhere.
--
-- Depends on public.levels from 20260918120000_curriculum_data_tables.sql.
--
-- The (SELECT auth.uid()) wrapping in the per-user policies below is the
-- pattern 20260918150000_optimize_rls_auth_uid.sql applied repo-wide: a
-- bare auth.uid() re-evaluates once per row.

CREATE TABLE public.podcast_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES public.podcast_folders(id) ON DELETE RESTRICT,
  slug text NOT NULL,
  title text NOT NULL,
  description text,
  course text CHECK (course IN ('en', 'fr', 'es')),
  level_id text REFERENCES public.levels(id),
  cover_image_url text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Sibling slugs are unique -- but Postgres treats NULL parent_id values
-- as mutually distinct, so this constraint does NOT constrain root
-- folders. The partial index below covers that gap; without it the tree
-- silently accepts two roots called "english".
CREATE UNIQUE INDEX podcast_folders_parent_slug_key
  ON public.podcast_folders (parent_id, slug)
  WHERE parent_id IS NOT NULL;
CREATE UNIQUE INDEX podcast_folders_root_slug_key
  ON public.podcast_folders (slug)
  WHERE parent_id IS NULL;
CREATE INDEX ON public.podcast_folders (parent_id, sort_order);

GRANT SELECT ON public.podcast_folders TO authenticated;
GRANT ALL ON public.podcast_folders TO service_role;
ALTER TABLE public.podcast_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "podcast_folders_select_all" ON public.podcast_folders
  FOR SELECT TO authenticated USING (true);

CREATE TABLE public.podcast_episodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id uuid NOT NULL REFERENCES public.podcast_folders(id) ON DELETE RESTRICT,
  slug text NOT NULL,
  title text NOT NULL,
  description text,
  audio_path text NOT NULL,
  duration_seconds integer NOT NULL CHECK (duration_seconds > 0),
  course text CHECK (course IN ('en', 'fr', 'es')),
  level_id text REFERENCES public.levels(id),
  source text NOT NULL CHECK (source IN ('upload', 'tts')),
  published boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  UNIQUE (folder_id, slug)
);
CREATE INDEX ON public.podcast_episodes (folder_id, sort_order);

GRANT SELECT ON public.podcast_episodes TO authenticated;
GRANT ALL ON public.podcast_episodes TO service_role;
ALTER TABLE public.podcast_episodes ENABLE ROW LEVEL SECURITY;
-- Unpublished episodes are invisible to clients. NOTE: this hides the
-- ROW, not the FILE -- the bucket is public-read, so a draft episode's
-- audio is still fetchable by anyone who knows the URL. See the spec's
-- Storage section: `published` is a staging flag, not privacy.
CREATE POLICY "podcast_episodes_select_published" ON public.podcast_episodes
  FOR SELECT TO authenticated USING (published = true);

CREATE TABLE public.podcast_playback (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  episode_id uuid NOT NULL REFERENCES public.podcast_episodes(id) ON DELETE CASCADE,
  position_seconds integer NOT NULL DEFAULT 0 CHECK (position_seconds >= 0),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, episode_id)
);
GRANT SELECT, INSERT, UPDATE ON public.podcast_playback TO authenticated;
GRANT ALL ON public.podcast_playback TO service_role;
ALTER TABLE public.podcast_playback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "podcast_playback_own" ON public.podcast_playback
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE TABLE public.podcast_play_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  episode_id uuid NOT NULL REFERENCES public.podcast_episodes(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  seconds_listened integer NOT NULL DEFAULT 0 CHECK (seconds_listened >= 0)
);
CREATE INDEX ON public.podcast_play_events (episode_id, started_at);
GRANT SELECT, INSERT ON public.podcast_play_events TO authenticated;
GRANT ALL ON public.podcast_play_events TO service_role;
ALTER TABLE public.podcast_play_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "podcast_play_events_own" ON public.podcast_play_events
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
