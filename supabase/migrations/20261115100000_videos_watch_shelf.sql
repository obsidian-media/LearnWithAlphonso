-- Library: Alphonso tutor videos, the "Watch" shelf (see scripts/video-tool.ts).
--
-- Depends on public.levels (20260918120000_curriculum_data_tables.sql). Versioned after the newest migration on main
-- (20261114100000_local_days.sql): `supabase db push` refuses an older version.
--
-- Two tables, both with ON DELETE CASCADE where they hang off a user (account deletion relies on it):
--   videos         the catalogue. Only service_role writes (scripts/video-tool.ts); clients read published rows.
--   video_watches  one row per user per video: progress seconds and completed_at. Clients can read and delete their own
--                  rows (clear my history); every WRITE goes through save_video_progress(), the way listen_progress does.

CREATE TABLE public.videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  course text NOT NULL CHECK (course IN ('en', 'fr', 'es')),
  title text NOT NULL,
  description text,
  level_id text REFERENCES public.levels(id),
  duration_seconds integer NOT NULL CHECK (duration_seconds > 0),
  -- Object paths inside the public `videos` bucket (not URLs: the clients build the public URL themselves).
  video_path text NOT NULL,
  poster_path text,
  -- WebVTT captions. The player turns captions ON by default (accessibility, and muted viewing), so a video without
  -- captions must never be published: see videos_published_has_captions below.
  captions_path text,
  -- Free labels for path matching: a goal (travel, work, ...) or an interest (food, tech, ...) from the first-run
  -- answers puts the video on that learner's path; any other label is just a label.
  tags text[] NOT NULL DEFAULT '{}',
  -- The matching practice item the player offers after the video ends: a lesson id, a Talk scenario id or a story
  -- campaign id. Both set or both empty.
  practice_kind text CHECK (practice_kind IN ('lesson', 'talk', 'campaign')),
  practice_id text,
  published boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  CONSTRAINT videos_practice_pair CHECK ((practice_kind IS NULL) = (practice_id IS NULL)),
  CONSTRAINT videos_published_has_captions CHECK (NOT published OR captions_path IS NOT NULL)
);
CREATE INDEX videos_course_sort_idx ON public.videos (course, sort_order);

ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.videos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.videos TO authenticated;
GRANT ALL ON public.videos TO service_role;
-- Unpublished videos are invisible to clients. This hides the ROW, not the FILE: the bucket is public-read, so a draft's
-- mp4 is fetchable by anyone who knows the URL. `published` is a staging flag, not privacy.
CREATE POLICY videos_select_published ON public.videos
  FOR SELECT TO authenticated USING (published = true);

CREATE TABLE public.video_watches (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id uuid NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  progress_seconds integer NOT NULL DEFAULT 0 CHECK (progress_seconds >= 0),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, video_id)
);
CREATE INDEX video_watches_user_updated_idx ON public.video_watches (user_id, updated_at DESC);

ALTER TABLE public.video_watches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.video_watches FROM PUBLIC, anon, authenticated;
-- NO client INSERT/UPDATE grant: a client can never name another user or invent a completion.
GRANT SELECT, DELETE ON public.video_watches TO authenticated;
GRANT ALL ON public.video_watches TO service_role;
CREATE POLICY video_watches_select_own ON public.video_watches
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY video_watches_delete_own ON public.video_watches
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);

CREATE FUNCTION public.save_video_progress(p_video_id uuid, p_progress_s integer)
RETURNS TABLE (progress_seconds integer, completed_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_dur integer;
  v_pos integer;
  v_done boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_video_id IS NULL OR p_progress_s IS NULL THEN
    RAISE EXCEPTION 'video and progress are required' USING ERRCODE = '22023';
  END IF;
  SELECT v.duration_seconds INTO v_dur
    FROM public.videos v
   WHERE v.id = p_video_id AND v.published;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown video' USING ERRCODE = '22023';
  END IF;
  v_pos := GREATEST(0, LEAST(p_progress_s, v_dur));
  -- Finished once the learner is within the last 3 seconds (or 5 percent, whichever is larger): videos are short.
  v_done := v_pos >= v_dur - GREATEST(3, v_dur / 20);
  RETURN QUERY
  INSERT INTO public.video_watches AS vw (user_id, video_id, progress_seconds, completed_at, updated_at)
  VALUES (v_uid, p_video_id, v_pos, CASE WHEN v_done THEN now() END, now())
  ON CONFLICT (user_id, video_id) DO UPDATE
    SET progress_seconds = EXCLUDED.progress_seconds,
        -- Only ever moves "completed" forward: re-watching from the start does not un-finish a video.
        completed_at = COALESCE(vw.completed_at, EXCLUDED.completed_at),
        updated_at = now()
  RETURNING vw.progress_seconds, vw.completed_at;
END;
$$;
REVOKE ALL ON FUNCTION public.save_video_progress(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_video_progress(uuid, integer) TO authenticated, service_role;

-- The media bucket, created here (infrastructure as code) rather than by a dashboard click. public = true is deliberate,
-- as for podcast-audio: free learning media, CDN-cacheable URLs, and a native player streams without token plumbing.
-- No storage.objects policy at all (see 20261105100300_podcast_audio_no_listing.sql): public objects are served by URL, and
-- a SELECT policy would only add the ability to LIST the bucket. Only the service-role CLI writes objects.
-- The size and type limits make a wrong upload fail loudly instead of filling the bucket.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'videos', 'videos', true, 52428800,
  ARRAY['video/mp4', 'image/jpeg', 'image/png', 'image/webp', 'text/vtt']
)
ON CONFLICT (id) DO NOTHING;
