-- Accounts that must never be matched with a real learner.
-- Why: the App Review demo account is pre-paired with a demo learner, and "End study buddy" shows the opt-in to
-- join the stranger pool. A reviewer who joined would be matched with a real learner. An account listed here
-- is refused at join time ('matching_off', a status every client already renders) and is skipped as a candidate
-- even if a row for it is already in the pool.
-- The list is server-only: no client policy, no client privilege (service role writes it).
-- Only join_buddy_pool changes: the two exclusion checks are added to the 20261008130700 definition, and its
-- SECURITY DEFINER, search_path, grants and every other check are unchanged.
--
-- Depends on: 20261008130700 (join_buddy_pool), 20261013100000.
--
-- Rollback (one transaction):
--   re-run CREATE OR REPLACE FUNCTION public.join_buddy_pool from 20261008130700_buddy_matching_hardening.sql;
--   DROP TABLE public.buddy_pool_exclusions;
--
-- client-grants: none public.buddy_pool_exclusions

CREATE TABLE public.buddy_pool_exclusions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.buddy_pool_exclusions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.buddy_pool_exclusions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.buddy_pool_exclusions TO service_role;

CREATE OR REPLACE FUNCTION public.join_buddy_pool(_course text, _age_confirmed boolean)
RETURNS TABLE(status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET timezone = 'UTC'
AS $$
DECLARE
  me uuid := auth.uid();
  mine text;
  candidate uuid;
  result text;
BEGIN
  IF me IS NULL THEN RETURN QUERY SELECT 'unauthenticated'::text; RETURN; END IF;

  -- An excluded account (the App Review demo account) is never offered to a real learner: it gets the same
  -- answer as when matching is switched off, which every app build already renders.
  IF EXISTS (SELECT 1 FROM public.buddy_pool_exclusions x WHERE x.user_id = me) THEN
    RETURN QUERY SELECT 'matching_off'::text; RETURN;
  END IF;

  -- Rate limit: every call counts, refused ones included, so a client looping on an error is throttled too.
  DELETE FROM public.buddy_pool_attempts a WHERE a.user_id = me AND a.attempted_at < now() - interval '1 day';
  INSERT INTO public.buddy_pool_attempts (user_id) VALUES (me);
  IF (SELECT count(*) FROM public.buddy_pool_attempts a
      WHERE a.user_id = me AND a.attempted_at > now() - interval '1 hour') > 20 THEN
    RETURN QUERY SELECT 'too_many_tries'::text; RETURN;
  END IF;

  IF NOT coalesce(_age_confirmed, false) THEN
    RETURN QUERY SELECT 'age_required'::text; RETURN;
  END IF;
  -- A durable record of the declared-age confirmation.
  INSERT INTO public.buddy_age_confirmations AS c (user_id) VALUES (me)
    ON CONFLICT (user_id) DO UPDATE SET last_confirmed_at = now(), confirmations = c.confirmations + 1;

  IF NOT coalesce((SELECT bs.matching_enabled FROM public.buddy_settings bs WHERE bs.id), false) THEN
    RETURN QUERY SELECT 'matching_off'::text; RETURN;
  END IF;
  SELECT lp.cefr_level INTO mine FROM public.language_progress lp WHERE lp.user_id = me AND lp.language = _course;
  IF _course IS NULL OR _course NOT IN ('en', 'fr', 'es') OR mine IS NULL THEN
    RETURN QUERY SELECT 'not_studying'::text; RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.buddy_members bm WHERE bm.user_id = me) THEN
    RETURN QUERY SELECT 'already_paired'::text; RETURN;
  END IF;
  -- At most 3 new matches per rolling 7 days.
  IF (SELECT count(*) FROM public.buddy_pairs bp
      WHERE bp.source = 'match' AND (bp.user_a = me OR bp.user_b = me) AND bp.created_at > now() - interval '7 days') >= 3 THEN
    RETURN QUERY SELECT 'match_limit'::text; RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('buddy:pool', 0));
  SELECT p.user_id INTO candidate FROM public.buddy_pool p
    WHERE p.course = _course
      AND p.user_id <> me
      AND NOT EXISTS (SELECT 1 FROM public.buddy_pool_exclusions x WHERE x.user_id = p.user_id)
      AND abs(public._cefr_rank(p.cefr_level) - public._cefr_rank(mine)) <= 1
      AND NOT EXISTS (SELECT 1 FROM public.blocked_users b WHERE (b.blocker = me AND b.blocked = p.user_id) OR (b.blocker = p.user_id AND b.blocked = me))
      AND NOT EXISTS (
        SELECT 1 FROM public.buddy_pairs past
        WHERE past.user_a = least(me, p.user_id) AND past.user_b = greatest(me, p.user_id)
      )
      AND NOT EXISTS (SELECT 1 FROM public.buddy_members bm WHERE bm.user_id = p.user_id)
      AND (SELECT count(*) FROM public.buddy_pairs bp2
           WHERE bp2.source = 'match' AND (bp2.user_a = p.user_id OR bp2.user_b = p.user_id)
             AND bp2.created_at > now() - interval '7 days') < 3
    ORDER BY p.joined_at
    LIMIT 1;

  IF candidate IS NOT NULL THEN
    result := public._create_buddy_pair(me, candidate, 'match');
    IF result = 'paired' THEN RETURN QUERY SELECT 'paired'::text; RETURN; END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('buddy:' || me::text, 0));
  IF EXISTS (SELECT 1 FROM public.buddy_members bm WHERE bm.user_id = me) THEN
    RETURN QUERY SELECT 'already_paired'::text; RETURN;
  END IF;

  INSERT INTO public.buddy_pool AS bpl (user_id, course, cefr_level, age_confirmed_at) VALUES (me, _course, mine, now())
    ON CONFLICT (user_id) DO UPDATE
      SET course = excluded.course,
          cefr_level = excluded.cefr_level,
          age_confirmed_at = excluded.age_confirmed_at,
          joined_at = CASE WHEN bpl.course = excluded.course THEN bpl.joined_at ELSE now() END;
  RETURN QUERY SELECT 'waiting'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.join_buddy_pool(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_buddy_pool(text, boolean) TO authenticated;
