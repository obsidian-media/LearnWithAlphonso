-- Study together, Phase 3b: opt-in matching with another learner (spec 2026-10-06-study-together-design.md Part 2,
-- plan 2026-10-07-buddy-matching.md). Owner decision 2026-10-07: minimum age 13 (App Store 13+), ship it complete.
-- Guardrails (App Store guideline 1.2 names "random or anonymous chat" as not belonging on the App Store): opt-in only;
-- matched by course and CEFR level within one step; never re-matched with a past buddy; never across a block; preset
-- messages only (Phase 5); display name and progress only; block and report on the buddy card; and a server-side
-- switch: UPDATE public.buddy_settings SET matching_enabled = false;  turns matching off for everyone, no release.
--
-- client-grants: none public.buddy_settings
--
-- ROLLBACK: DROP FUNCTION public.join_buddy_pool(text), public.leave_buddy_pool(), public.get_buddy_pool(),
-- public._cefr_rank(text); DROP TABLE public.buddy_pool, public.buddy_settings; re-apply _create_buddy_pair and
-- get_my_buddy from 20261006180000_buddy_pairing.sql (DROP get_my_buddy first: its return type changes here).

CREATE TABLE public.buddy_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  matching_enabled boolean NOT NULL DEFAULT true
);
INSERT INTO public.buddy_settings (id) VALUES (true);
ALTER TABLE public.buddy_settings ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.buddy_settings TO service_role;

CREATE TABLE public.buddy_pool (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  course text NOT NULL CHECK (course IN ('en', 'fr', 'es')),
  cefr_level text NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX buddy_pool_course_idx ON public.buddy_pool (course, joined_at);
ALTER TABLE public.buddy_pool ENABLE ROW LEVEL SECURITY;
CREATE POLICY buddy_pool_select_own ON public.buddy_pool FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
GRANT SELECT ON public.buddy_pool TO authenticated;
GRANT ALL ON public.buddy_pool TO service_role;

CREATE OR REPLACE FUNCTION public._cefr_rank(_level text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT array_position(ARRAY['A1', 'A2', 'B1', 'B2', 'C1'], _level);
$$;

CREATE OR REPLACE FUNCTION public._create_buddy_pair(_x uuid, _y uuid, _source text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET timezone = 'UTC'
AS $$
DECLARE
  pid uuid;
BEGIN
  PERFORM public._lock_buddy_users(_x, _y);
  -- Re-checked under the lock: a block or unfriend that committed while we waited must win. A matched pair (opt-in
  -- pool) is between learners who are not friends, so only friend pairs need the friendship.
  IF _source = 'friend' AND NOT EXISTS (SELECT 1 FROM public.friendships f WHERE f.user_id = _x AND f.friend_id = _y AND f.status = 'accepted') THEN
    RETURN 'not_friends';
  END IF;
  IF EXISTS (SELECT 1 FROM public.blocked_users b WHERE (b.blocker = _x AND b.blocked = _y) OR (b.blocker = _y AND b.blocked = _x)) THEN
    RETURN 'blocked';
  END IF;
  IF EXISTS (SELECT 1 FROM public.buddy_members bm WHERE bm.user_id = _x) THEN RETURN 'already_paired'; END IF;
  IF EXISTS (SELECT 1 FROM public.buddy_members bm WHERE bm.user_id = _y) THEN RETURN 'friend_paired'; END IF;
  BEGIN
    INSERT INTO public.buddy_pairs (user_a, user_b, source) VALUES (least(_x, _y), greatest(_x, _y), _source)
      RETURNING id INTO pid;
    INSERT INTO public.buddy_members (user_id, pair_id) VALUES (_x, pid), (_y, pid);
  EXCEPTION WHEN unique_violation THEN
    -- a pairing with a third person (which holds a different lock pair) won the race; this block's inserts are rolled back
    RETURN CASE WHEN EXISTS (SELECT 1 FROM public.buddy_members bm WHERE bm.user_id = _x) THEN 'already_paired' ELSE 'friend_paired' END;
  END;
  UPDATE public.buddy_requests br SET status = 'cancelled', responded_at = now()
    WHERE br.status = 'pending' AND (br.from_user IN (_x, _y) OR br.to_user IN (_x, _y));
  -- Paired people are no longer looking (whichever way they paired).
  DELETE FROM public.buddy_pool bpl WHERE bpl.user_id IN (_x, _y);
  RETURN 'paired';
END;
$$;

CREATE OR REPLACE FUNCTION public.join_buddy_pool(_course text)
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

  -- One matcher at a time: two joiners can never both take the same waiting learner.
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
    ORDER BY p.joined_at
    LIMIT 1;

  IF candidate IS NOT NULL THEN
    result := public._create_buddy_pair(me, candidate, 'match'); -- re-checks blocks and pairings under the person locks
    IF result = 'paired' THEN RETURN QUERY SELECT 'paired'::text; RETURN; END IF;
  END IF;

  -- Re-check under my own person lock: a friend pairing that ran while I waited for the pool lock found no pool row to
  -- clear, and inserting one now would leave me paired AND waiting (matchable later without opting in again).
  PERFORM pg_advisory_xact_lock(hashtextextended('buddy:' || me::text, 0));
  IF EXISTS (SELECT 1 FROM public.buddy_members bm WHERE bm.user_id = me) THEN
    RETURN QUERY SELECT 'already_paired'::text; RETURN;
  END IF;

  -- Nobody suitable yet (or the candidate paired elsewhere a moment ago): wait. Re-joining the same course keeps the
  -- place in the queue; switching course starts a new wait.
  INSERT INTO public.buddy_pool AS bpl (user_id, course, cefr_level) VALUES (me, _course, mine)
    ON CONFLICT (user_id) DO UPDATE
      SET course = excluded.course,
          cefr_level = excluded.cefr_level,
          joined_at = CASE WHEN bpl.course = excluded.course THEN bpl.joined_at ELSE now() END;
  RETURN QUERY SELECT 'waiting'::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.leave_buddy_pool()
RETURNS TABLE(status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET timezone = 'UTC'
AS $$
DECLARE
  me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN RETURN QUERY SELECT 'unauthenticated'::text; RETURN; END IF;
  -- The pool lock: a join that already picked me as its candidate finishes first, so a match cannot land after I left.
  PERFORM pg_advisory_xact_lock(hashtextextended('buddy:pool', 0));
  DELETE FROM public.buddy_pool bpl WHERE bpl.user_id = me;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_waiting'::text; RETURN; END IF;
  RETURN QUERY SELECT 'left'::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_buddy_pool()
RETURNS TABLE(matching_enabled boolean, waiting boolean, course text, courses text[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET timezone = 'UTC'
AS $$
DECLARE
  me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN RETURN; END IF;
  -- Always one row: whether matching is on, whether the caller is waiting (and for which course), and the courses
  -- the caller studies (the ones they can look for a buddy in).
  RETURN QUERY
  SELECT coalesce((SELECT bs.matching_enabled FROM public.buddy_settings bs WHERE bs.id), false),
    EXISTS (SELECT 1 FROM public.buddy_pool bpl WHERE bpl.user_id = me),
    (SELECT bpl.course FROM public.buddy_pool bpl WHERE bpl.user_id = me),
    coalesce((SELECT array_agg(lp.language ORDER BY lp.language) FROM public.language_progress lp
      WHERE lp.user_id = me AND lp.language IN ('en', 'fr', 'es')), ARRAY[]::text[]);
END;
$$;

-- get_my_buddy gains is_match (a matched buddy's card shows "Matched learner" with block and report). The return type
-- changes, so it is dropped and recreated; the body is 20261006180000's plus that one column.
DROP FUNCTION public.get_my_buddy();
CREATE OR REPLACE FUNCTION public.get_my_buddy()
RETURNS TABLE(pair_id uuid, buddy_id uuid, buddy_name text, buddy_avatar_seed text, paired_at timestamptz, week_start date,
  my_count integer, buddy_count integer, goal integer, streak_weeks integer, grace_available boolean, last_outcome text,
  is_match boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET timezone = 'UTC'
AS $$
DECLARE
  me uuid := auth.uid();
  pid uuid;
  wk date := date_trunc('week', current_date)::date;
BEGIN
  IF me IS NULL THEN RETURN; END IF;
  SELECT bm.pair_id INTO pid FROM public.buddy_members bm WHERE bm.user_id = me;
  IF pid IS NULL THEN RETURN; END IF;
  PERFORM public._resolve_buddy_pair(pid);
  RETURN QUERY
  SELECT bp.id,
    other.id,
    other.display_name,
    other.avatar_seed,
    bp.created_at,
    wk,
    public._buddy_count(me, greatest(wk::timestamptz, bp.created_at), (wk + 7)::timestamptz),
    public._buddy_count(other.id, greatest(wk::timestamptz, bp.created_at), (wk + 7)::timestamptz),
    3,
    bp.streak_weeks,
    bp.grace_available,
    (SELECT bw.outcome FROM public.buddy_weeks bw WHERE bw.pair_id = bp.id ORDER BY bw.week_start DESC LIMIT 1),
    bp.source = 'match'
  FROM public.buddy_pairs bp
  JOIN public.profiles other ON other.id = CASE WHEN bp.user_a = me THEN bp.user_b ELSE bp.user_a END
  WHERE bp.id = pid AND bp.ended_at IS NULL; -- the pair may have ended while we waited for its lock
END;
$$;

REVOKE ALL ON FUNCTION public._cefr_rank(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._create_buddy_pair(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.join_buddy_pool(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_buddy_pool(text) TO authenticated;
REVOKE ALL ON FUNCTION public.leave_buddy_pool() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_buddy_pool() TO authenticated;
REVOKE ALL ON FUNCTION public.get_buddy_pool() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_buddy_pool() TO authenticated;
REVOKE ALL ON FUNCTION public.get_my_buddy() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_buddy() TO authenticated;
