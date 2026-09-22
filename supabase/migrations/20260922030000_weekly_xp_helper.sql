-- Extracts the weekly-XP computation out of get_leaderboard into a
-- standalone, week_start-parameterized function -- V4 candidate #7
-- (deeper gamification, docs/superpowers/specs/2026-09-22-deeper-
-- gamification-design.md) needs the exact same "how much XP did this
-- user earn in a given week" logic for Teams' weekly scoring and the
-- Season Ladder's cohort resolution (including resolving *past*
-- weeks, not just the current one). Parameterizing by an explicit
-- _week_start (rather than always "now") is what makes both possible
-- without three copies of this subquery drifting apart over time.
--
-- Range covered: [_week_start, _week_start + 7) -- a caller passing
-- the Monday of any ISO week gets that week's Mon-through-Sun total.
CREATE OR REPLACE FUNCTION public.weekly_xp(_user_id uuid, _week_start date)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(a.xp_earned)::int, 0)
  FROM public.activity_days a
  WHERE a.user_id = _user_id
    AND a.day >= _week_start
    AND a.day < _week_start + 7;
$$;

-- get_leaderboard now calls weekly_xp instead of inlining the same
-- subquery -- behavior is unchanged (same date range, same column),
-- this is a pure refactor. The all-time branch (language_progress.xp
-- sum) is untouched, copied forward exactly from the previous
-- version.
CREATE OR REPLACE FUNCTION public.get_leaderboard(_scope text, _period text)
RETURNS TABLE (user_id uuid, display_name text, country text, avatar_seed text, xp integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  my_country text;
  wk date := (current_date - ((extract(isodow from current_date)::int) - 1));
BEGIN
  IF me IS NULL THEN
    RETURN;
  END IF;

  SELECT p.country INTO my_country FROM public.profiles p WHERE p.id = me;

  RETURN QUERY
  WITH pool AS (
    SELECT p.id, p.display_name, p.country, p.avatar_seed
    FROM public.profiles p
    WHERE
      CASE _scope
        WHEN 'friends' THEN p.id = me OR p.id IN (
          SELECT f.friend_id FROM public.friendships f
          WHERE f.user_id = me AND f.status = 'accepted'
        )
        WHEN 'country' THEN my_country IS NOT NULL AND p.country = my_country
        ELSE true
      END
  ), scores AS (
    SELECT pool.id,
           pool.display_name,
           pool.country,
           pool.avatar_seed,
           CASE WHEN _period = 'weekly' THEN
             public.weekly_xp(pool.id, wk)
           ELSE
             COALESCE((SELECT SUM(lp.xp)::int FROM public.language_progress lp
                       WHERE lp.user_id = pool.id), 0)
           END AS xp
    FROM pool
  )
  SELECT s.id, s.display_name, s.country, s.avatar_seed, s.xp
  FROM scores s
  ORDER BY s.xp DESC
  LIMIT 50;
END;
$$;
