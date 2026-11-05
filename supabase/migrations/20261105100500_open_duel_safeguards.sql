-- The open duel queue pairs two learners who are not friends. Study-buddy matching already has an owner kill switch
-- and an exclusion list (buddy_settings, buddy_pool_exclusions); the duel queue had neither. This adds both:
--   - buddy_settings.open_duels_enabled (default on): off means the queue neither matches nor enqueues anyone, and
--     waiting entries are ignored. `UPDATE public.buddy_settings SET open_duels_enabled = false;` switches it off
--     with no release.
--   - an account in buddy_pool_exclusions (for example the App Review demo account) is never matched with a stranger.
-- A duel shows only a moderated display name and XP progress and carries no messages, so the buddy pool's 13+
-- confirmation (which the duel screens do not collect) is not required here.
--
-- Depends on 20260928020000 (join_open_duel_queue, latest body), 20261006180000 (buddy_settings) and
-- 20261013100100 (buddy_pool_exclusions).
--
-- Rollback:
--   ALTER TABLE public.buddy_settings DROP COLUMN open_duels_enabled;
--   re-run join_open_duel_queue from 20260928020000.

ALTER TABLE public.buddy_settings ADD COLUMN IF NOT EXISTS open_duels_enabled boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.join_open_duel_queue(_course text, _match_by_level boolean DEFAULT true)
RETURNS TABLE(matched boolean, duel_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  my_level text;
  candidate_user uuid;
  levels text[] := ARRAY['A1', 'A2', 'B1', 'B2', 'C1'];
  new_duel_id uuid;
  my_xp integer;
  candidate_xp integer;
BEGIN
  IF me IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid;
    RETURN;
  END IF;

  -- The owner's switch, and accounts kept out of contact with strangers.
  IF NOT coalesce((SELECT bs.open_duels_enabled FROM public.buddy_settings bs WHERE bs.id), false)
     OR EXISTS (SELECT 1 FROM public.buddy_pool_exclusions x WHERE x.user_id = me) THEN
    DELETE FROM public.duel_queue WHERE user_id = me;
    RETURN QUERY SELECT false, NULL::uuid;
    RETURN;
  END IF;

  SELECT lp.cefr_level INTO my_level FROM public.language_progress lp WHERE lp.user_id = me AND lp.language = _course;
  my_level := COALESCE(my_level, 'A1');

  DELETE FROM public.duel_queue WHERE queued_at < now() - interval '10 minutes';

  SELECT dq.user_id INTO candidate_user
  FROM public.duel_queue dq
  WHERE dq.course = _course
    AND dq.user_id != me
    AND (
      (_match_by_level AND dq.match_by_level AND
        abs(array_position(levels, dq.cefr_level) - array_position(levels, my_level)) <= 1)
      OR NOT _match_by_level
      OR NOT dq.match_by_level
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.blocked_users bu
      WHERE (bu.blocker = me AND bu.blocked = dq.user_id)
         OR (bu.blocker = dq.user_id AND bu.blocked = me)
    )
    AND NOT EXISTS (SELECT 1 FROM public.buddy_pool_exclusions x WHERE x.user_id = dq.user_id)
  ORDER BY dq.queued_at
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF candidate_user IS NOT NULL THEN
    DELETE FROM public.duel_queue WHERE user_id = candidate_user;
    DELETE FROM public.duel_queue WHERE user_id = me;

    SELECT xp INTO my_xp FROM public.language_progress WHERE user_id = me AND language = _course;
    SELECT xp INTO candidate_xp FROM public.language_progress WHERE user_id = candidate_user AND language = _course;

    INSERT INTO public.duels (challenger_id, opponent_id, course, status, challenger_xp_start, opponent_xp_start, ends_at)
    VALUES (me, candidate_user, _course, 'active', COALESCE(my_xp, 0), COALESCE(candidate_xp, 0), now() + interval '3 days')
    RETURNING id INTO new_duel_id;
    RETURN QUERY SELECT true, new_duel_id;
    RETURN;
  END IF;

  INSERT INTO public.duel_queue (user_id, course, cefr_level, match_by_level)
  VALUES (me, _course, my_level, _match_by_level)
  ON CONFLICT (user_id) DO UPDATE SET course = _course, cefr_level = my_level, match_by_level = _match_by_level, queued_at = now();
  RETURN QUERY SELECT false, NULL::uuid;
END;
$$;
REVOKE ALL ON FUNCTION public.join_open_duel_queue(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_open_duel_queue(text, boolean) TO authenticated;
