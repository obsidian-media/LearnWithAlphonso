-- Weekly quest integrity.
--   1. claim_weekly_quest accepted any _week_start in the last 7 days, and the claim key includes week_start, so
--      the same quest could be claimed with 8 different "weeks". The week is now derived here (UTC
--      ISO Monday) and any other value is 'invalid-week'.
--   2. _course was not validated: an unknown course, or one with no language_progress row, returned ok and paid
--      nothing. Now 'invalid-course' / 'no-course-progress', checked before anything is recorded.
-- One claim per (user, quest, week) stays the key (the xp_earned quest counts all courses, so a per-course key
-- would pay one week's XP three times); the paid course is recorded in the new course column.
-- Rollback: re-run claim_weekly_quest from 20261006170000_fix_team_joins_and_course_aware_payouts.sql;
--   ALTER TABLE public.user_weekly_quest_claims DROP COLUMN course;

ALTER TABLE public.user_weekly_quest_claims
  ADD COLUMN IF NOT EXISTS course text NULL CHECK (course IN ('en', 'fr', 'es'));

CREATE OR REPLACE FUNCTION public.claim_weekly_quest(_quest_id text, _course text, _week_start date)
RETURNS TABLE(ok boolean, reason text, xp integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET timezone = 'UTC'
AS $$
DECLARE
  me uuid := auth.uid();
  wk date := (current_date - ((extract(isodow from current_date)::int) - 1));
  q public.weekly_quests;
  progress integer;
  cur_xp integer;
BEGIN
  IF me IS NULL THEN
    RETURN QUERY SELECT false, 'unauthenticated', NULL::integer;
    RETURN;
  END IF;
  IF _week_start IS DISTINCT FROM wk THEN
    RETURN QUERY SELECT false, 'invalid-week', NULL::integer;
    RETURN;
  END IF;
  IF _course IS NULL OR _course NOT IN ('en', 'fr', 'es') THEN
    RETURN QUERY SELECT false, 'invalid-course', NULL::integer;
    RETURN;
  END IF;

  SELECT * INTO q FROM public.weekly_quests wq WHERE wq.id = _quest_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'unknown-quest', NULL::integer;
    RETURN;
  END IF;

  IF q.metric = 'xp_earned' THEN
    SELECT COALESCE(SUM(ad.xp_earned), 0) INTO progress FROM public.activity_days ad
      WHERE ad.user_id = me AND ad.day >= wk AND ad.day < wk + 7;
  ELSE -- 'lessons_completed', the only other CHECK-allowed value
    SELECT COUNT(*) INTO progress FROM public.lesson_completions lc
      WHERE lc.user_id = me AND lc.language = _course
        AND lc.completed_at >= wk AND lc.completed_at < wk + 7;
  END IF;

  IF progress < q.target THEN
    RETURN QUERY SELECT false, 'not-yet-completed', NULL::integer;
    RETURN;
  END IF;

  SELECT lp.xp INTO cur_xp FROM public.language_progress lp WHERE lp.user_id = me AND lp.language = _course FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'no-course-progress', NULL::integer;
    RETURN;
  END IF;

  INSERT INTO public.user_weekly_quest_claims (user_id, quest_id, week_start, course)
    VALUES (me, _quest_id, wk, _course)
    ON CONFLICT (user_id, quest_id, week_start) DO NOTHING;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'already-claimed', NULL::integer;
    RETURN;
  END IF;

  UPDATE public.language_progress lp SET xp = COALESCE(cur_xp, 0) + q.xp_reward
    WHERE lp.user_id = me AND lp.language = _course;
  RETURN QUERY SELECT true, NULL::text, COALESCE(cur_xp, 0) + q.xp_reward;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_weekly_quest(text, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_weekly_quest(text, text, date) TO authenticated, service_role;

