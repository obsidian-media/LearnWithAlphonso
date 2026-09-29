-- Whole-codebase audit finding (2026-09-29): 20260922030000_weekly_xp_helper.sql
-- extracted weekly-XP computation into public.weekly_xp(user_id,
-- week_start) specifically so get_leaderboard and future callers (Teams'
-- weekly scoring, the Season Ladder) share one definition instead of it
-- drifting across copies. 20260928020000_block_and_report.sql then
-- re-published get_leaderboard (to add blocked-user filtering) starting
-- from a copy of the body predating that extraction -- silently reverting
-- the weekly branch to inline `SUM(a.xp_earned) WHERE a.day >= wk` (no
-- upper bound), instead of calling public.weekly_xp(pool.id, wk).
--
-- Not currently a live scoring bug: get_leaderboard only ever passes THIS
-- week's Monday as `wk`, and activity_days has no future-dated rows to
-- wrongly include without the missing `< wk + 7` upper bound, so the two
-- forms happen to agree for every input this function actually calls
-- itself with today. But it is exactly the same "silently reintroduced a
-- fixed bug via copy-paste redefinition" pattern that broke
-- create_team's gen_random_bytes qualification (see
-- 20260930060000_fix_create_team_gen_random_bytes_regression.sql) --
-- real drift risk if weekly_xp's own window logic is ever tightened
-- (e.g. for the Season Ladder's past-week resolution) without every
-- inlined copy being found and updated by hand.
--
-- Restores the shared call. Everything else (blocked-user filtering,
-- scope/period branches) is identical to the currently-live definition.
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
      AND NOT EXISTS (
        SELECT 1 FROM public.blocked_users bu
        WHERE (bu.blocker = me AND bu.blocked = p.id)
           OR (bu.blocker = p.id AND bu.blocked = me)
      )
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
