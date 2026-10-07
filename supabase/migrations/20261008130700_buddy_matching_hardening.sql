-- Stranger matching hardening.
-- Audit of 20261007120000_buddy_matching.sql: presets-only messages, block/report on the card, block ends the pair,
-- no re-match, own-row RLS and the kill switch were already right (probe P9 pins each). Two gaps are closed here:
--   * no rate limit: join_buddy_pool could be called without limit, and end_buddy + join cycles through strangers.
--     Now at most 20 calls an hour ('too_many_tries', every call counted, refused ones too) and at most 3 new
--     matches per rolling 7 days ('match_limit'); a waiting learner at their limit is not offered as a candidate.
--   * the 13+ confirmation lived only in the buddy_pool row, which is deleted on pairing or leaving. Every confirmed
--     call is now recorded in buddy_age_confirmations (owner-readable for the data export; written only here).
-- Rollback: re-run join_buddy_pool from 20261007120000_buddy_matching.sql;
--   DROP TABLE public.buddy_pool_attempts, public.buddy_age_confirmations;

CREATE TABLE public.buddy_age_confirmations (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_confirmed_at timestamptz NOT NULL DEFAULT now(),
  last_confirmed_at timestamptz NOT NULL DEFAULT now(),
  confirmations integer NOT NULL DEFAULT 1
);
ALTER TABLE public.buddy_age_confirmations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.buddy_age_confirmations FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.buddy_age_confirmations TO service_role;
-- The learner's own row is part of their data export; writes happen only inside join_buddy_pool.
CREATE POLICY buddy_age_confirmations_select_own ON public.buddy_age_confirmations
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
GRANT SELECT ON public.buddy_age_confirmations TO authenticated;

CREATE TABLE public.buddy_pool_attempts (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  attempted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX buddy_pool_attempts_user_idx ON public.buddy_pool_attempts (user_id, attempted_at);
ALTER TABLE public.buddy_pool_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.buddy_pool_attempts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.buddy_pool_attempts TO service_role;
-- The learner's own rows are part of their data export; writes happen only inside join_buddy_pool.
CREATE POLICY buddy_pool_attempts_select_own ON public.buddy_pool_attempts
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
GRANT SELECT ON public.buddy_pool_attempts TO authenticated;

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

