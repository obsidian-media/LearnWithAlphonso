-- Per-user listening progress for the Listen redesign (continue listening, per-episode bars, folder percent).
--
-- Clients get SELECT and DELETE (clear my history) only. There is NO client INSERT/UPDATE grant: every write goes
-- through save_listen_progress(), which takes the user from auth.uid() (a client can never name another user),
-- requires a real published episode, clamps the position into [0, duration] and only ever moves "completed" forward.
CREATE TABLE public.listen_progress (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  episode_id uuid NOT NULL REFERENCES public.podcast_episodes(id) ON DELETE CASCADE,
  position_s integer NOT NULL DEFAULT 0 CHECK (position_s >= 0),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, episode_id)
);
CREATE INDEX listen_progress_user_updated_idx ON public.listen_progress (user_id, updated_at DESC);

ALTER TABLE public.listen_progress ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.listen_progress FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.listen_progress TO authenticated;
GRANT ALL ON public.listen_progress TO service_role;
CREATE POLICY listen_progress_select_own ON public.listen_progress
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY listen_progress_delete_own ON public.listen_progress
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);

CREATE FUNCTION public.save_listen_progress(p_episode_id uuid, p_position_s integer)
RETURNS TABLE (position_s integer, completed_at timestamptz)
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
  IF p_episode_id IS NULL OR p_position_s IS NULL THEN
    RAISE EXCEPTION 'episode and position are required' USING ERRCODE = '22023';
  END IF;
  SELECT e.duration_seconds INTO v_dur
    FROM public.podcast_episodes e
   WHERE e.id = p_episode_id AND e.published;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown episode' USING ERRCODE = '22023';
  END IF;
  v_pos := GREATEST(0, LEAST(p_position_s, v_dur));
  -- Finished once the learner is within the last 5 percent (or 10 s, whichever is larger).
  v_done := v_dur > 0 AND v_pos >= v_dur - GREATEST(10, v_dur / 20);
  RETURN QUERY
  INSERT INTO public.listen_progress AS lp (user_id, episode_id, position_s, completed_at, updated_at)
  VALUES (v_uid, p_episode_id, v_pos, CASE WHEN v_done THEN now() END, now())
  ON CONFLICT (user_id, episode_id) DO UPDATE
    SET position_s = EXCLUDED.position_s,
        completed_at = COALESCE(lp.completed_at, EXCLUDED.completed_at),
        updated_at = now()
  RETURNING lp.position_s, lp.completed_at;
END;
$$;
REVOKE ALL ON FUNCTION public.save_listen_progress(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_listen_progress(uuid, integer) TO authenticated, service_role;
