-- Faster leaderboard and team boards: a maintained weekly XP total per learner.
--
-- Weekly XP is, and stays, the sum of activity_days.xp_earned over an ISO week (Monday to Sunday). Until now every
-- getter recomputed it per learner on every call: get_leaderboard('global', 'weekly') called weekly_xp() for every
-- profile and sorted them all, and get_team_leaderboard and get_my_team (its last-week winner check) did the same
-- for every team member, so each call grew with the number of learners.
--
-- weekly_xp_totals(user_id, week_start, xp) holds those sums. An AFTER trigger on activity_days keeps it current
-- for every write, whichever path makes it (apply_lesson_completion, submit_podcast_quiz, or anything added later),
-- so no award path can forget it. XP that is not written to activity_days (quest rewards, team payouts, purchases)
-- never counted toward weekly XP and still does not.
--
-- The getters keep their exact columns, types and results:
--   weekly_xp(user, week)      reads the total for a Monday; any other start date keeps the old 7-day sum.
--   get_leaderboard weekly     the top 50 non-zero totals of this week come from the (week_start, xp) index; only
--                              when fewer than 50 learners earned XP is the page filled with zero-XP learners, as
--                              before. The all-time branch is unchanged.
--   get_team_leaderboard       one join on this week's totals instead of a weekly_xp() call per member.
--   get_my_team                last week's winner from last week's totals; the rest is unchanged.
--   get_cohort_weekly_xp       unchanged; it calls weekly_xp().
-- Client privileges are restated unchanged.
--
-- The table is service-role only (no client read): learners see weekly XP only through the getters above.
-- Rows go with the account (ON DELETE CASCADE) and are part of the account export.
--
-- Depends on 20260725012934 (activity_days), 20260918140001 (xp_earned >= 0), 20260922030000 / 20260929020001
-- (weekly_xp), 20260930080000 (get_leaderboard), 20261013100200 (get_team_leaderboard), 20261008130500
-- (get_my_team), 20260922050000 / 20261105100000 (get_cohort_weekly_xp grants).
--
-- Rollback (one transaction): re-run weekly_xp from 20260922030000, get_leaderboard from 20260930080000,
-- get_team_leaderboard from 20261013100200 and get_my_team from 20261008130500 (each with its grants), then
--   DROP TRIGGER sync_weekly_xp_totals ON public.activity_days;
--   DROP FUNCTION public._sync_weekly_xp_totals();
--   DROP TABLE public.weekly_xp_totals;

-- client-grants: none public.weekly_xp_totals
CREATE TABLE public.weekly_xp_totals (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start date NOT NULL CHECK (extract(isodow from week_start) = 1),
  xp integer NOT NULL DEFAULT 0 CHECK (xp >= 0),
  PRIMARY KEY (user_id, week_start)
);
-- The weekly board: one week, highest totals first.
CREATE INDEX weekly_xp_totals_week_xp_idx ON public.weekly_xp_totals (week_start, xp DESC, user_id);
ALTER TABLE public.weekly_xp_totals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.weekly_xp_totals FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.weekly_xp_totals TO service_role;

CREATE FUNCTION public._sync_weekly_xp_totals() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.xp_earned <> 0 THEN
    -- Never an insert here: on an account deletion the totals row may already be gone with the account.
    UPDATE public.weekly_xp_totals w
       SET xp = w.xp - OLD.xp_earned
     WHERE w.user_id = OLD.user_id
       AND w.week_start = OLD.day - (extract(isodow from OLD.day)::int - 1);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.xp_earned <> 0 THEN
    INSERT INTO public.weekly_xp_totals AS w (user_id, week_start, xp)
    VALUES (NEW.user_id, NEW.day - (extract(isodow from NEW.day)::int - 1), NEW.xp_earned)
    ON CONFLICT (user_id, week_start) DO UPDATE SET xp = w.xp + EXCLUDED.xp;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public._sync_weekly_xp_totals() FROM PUBLIC, anon, authenticated;

-- Trigger and backfill in one statement holding a lock on activity_days, so no write falls between them: writers
-- wait the few seconds the backfill takes. (One DO block, because the migration runner may not wrap the file in a
-- transaction, and a top-level LOCK TABLE needs one.)
DO $$
BEGIN
  LOCK TABLE public.activity_days IN SHARE ROW EXCLUSIVE MODE;

  CREATE TRIGGER sync_weekly_xp_totals
    AFTER INSERT OR UPDATE OR DELETE ON public.activity_days
    FOR EACH ROW EXECUTE FUNCTION public._sync_weekly_xp_totals();

  INSERT INTO public.weekly_xp_totals (user_id, week_start, xp)
  SELECT a.user_id, a.day - (extract(isodow from a.day)::int - 1), sum(a.xp_earned)::int
    FROM public.activity_days a
   GROUP BY 1, 2
  HAVING sum(a.xp_earned) <> 0;
END;
$$;

-- Range covered: [_week_start, _week_start + 7). A Monday reads the stored total.
CREATE OR REPLACE FUNCTION public.weekly_xp(_user_id uuid, _week_start date)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN extract(isodow from _week_start) = 1 THEN
      COALESCE((SELECT w.xp FROM public.weekly_xp_totals w
                 WHERE w.user_id = _user_id AND w.week_start = _week_start), 0)
    ELSE
      COALESCE((SELECT SUM(a.xp_earned)::int FROM public.activity_days a
                 WHERE a.user_id = _user_id AND a.day >= _week_start AND a.day < _week_start + 7), 0)
  END;
$$;
REVOKE ALL ON FUNCTION public.weekly_xp(uuid, date) FROM PUBLIC, anon, authenticated;

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

  IF _period = 'weekly' THEN
    RETURN QUERY
    WITH earners AS (
      SELECT p.id, p.display_name, p.country, p.avatar_seed, w.xp
      FROM public.weekly_xp_totals w
      JOIN public.profiles p ON p.id = w.user_id
      WHERE w.week_start = wk
        AND w.xp > 0
        AND CASE _scope
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
      ORDER BY w.xp DESC
      LIMIT 50
    )
    SELECT e.id, e.display_name, e.country, e.avatar_seed, e.xp FROM earners e
    UNION ALL
    (
      SELECT p.id, p.display_name, p.country, p.avatar_seed, 0
      FROM public.profiles p
      WHERE CASE _scope
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
        AND NOT EXISTS (
          SELECT 1 FROM public.weekly_xp_totals w2
          WHERE w2.user_id = p.id AND w2.week_start = wk AND w2.xp > 0
        )
      LIMIT GREATEST(50 - (SELECT count(*) FROM earners), 0)
    )
    ORDER BY 5 DESC
    LIMIT 50;
    RETURN;
  END IF;

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
           COALESCE((SELECT SUM(lp.xp)::int FROM public.language_progress lp
                     WHERE lp.user_id = pool.id), 0) AS xp
    FROM pool
  )
  SELECT s.id, s.display_name, s.country, s.avatar_seed, s.xp
  FROM scores s
  ORDER BY s.xp DESC
  LIMIT 50;
END;
$$;
REVOKE ALL ON FUNCTION public.get_leaderboard(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_leaderboard(text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_team_leaderboard()
RETURNS TABLE(team_id uuid, name text, weekly_xp integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  wk date := (current_date - ((extract(isodow from current_date)::int) - 1));
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT t.id, t.name, COALESCE(SUM(w.xp), 0)::int
  FROM public.teams t
  JOIN public.team_members tm ON tm.team_id = t.id
  LEFT JOIN public.weekly_xp_totals w ON w.user_id = tm.user_id AND w.week_start = wk
  WHERE t.visibility = 'public'
     OR t.id IN (SELECT m.team_id FROM public.team_members m WHERE m.user_id = auth.uid())
  GROUP BY t.id, t.name
  ORDER BY 3 DESC
  LIMIT 50;
END;
$$;
REVOKE ALL ON FUNCTION public.get_team_leaderboard() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_leaderboard() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_team()
RETURNS TABLE(
  team_id uuid, name text, join_code text, joined_at timestamptz,
  switch_locked_until timestamptz, this_week_xp integer, is_owner boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET timezone = 'UTC'
AS $$
DECLARE
  me uuid := auth.uid();
  my_team uuid;
  my_joined_at timestamptz;
  wk date := (current_date - ((extract(isodow from current_date)::int) - 1));
  prev_wk date := wk - 7;
  winner_team uuid;
BEGIN
  IF me IS NULL THEN
    RETURN;
  END IF;

  SELECT tm.team_id, tm.joined_at INTO my_team, my_joined_at
  FROM public.team_members tm WHERE tm.user_id = me;

  IF my_team IS NULL THEN
    RETURN;
  END IF;

  -- Only learners with XP last week can make a team win, so start from last week's non-zero totals.
  SELECT t.id INTO winner_team
  FROM public.weekly_xp_totals w2
  JOIN public.team_members tm2 ON tm2.user_id = w2.user_id
  JOIN public.teams t ON t.id = tm2.team_id
  WHERE w2.week_start = prev_wk AND w2.xp > 0
  GROUP BY t.id
  ORDER BY SUM(w2.xp) DESC, t.id
  LIMIT 1;

  IF winner_team IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.team_weekly_rewards rw WHERE rw.team_id = winner_team AND rw.week_start = prev_wk
  ) THEN
    INSERT INTO public.team_weekly_rewards (team_id, week_start, resolved_at)
    VALUES (winner_team, prev_wk, now())
    ON CONFLICT DO NOTHING;

    IF FOUND THEN
      UPDATE public.language_progress lp
      SET xp = lp.xp + 100
      FROM public.team_members tm3
      WHERE tm3.team_id = winner_team
        AND lp.user_id = tm3.user_id
        AND lp.language = (
          SELECT lc.language FROM public.lesson_completions lc
          WHERE lc.user_id = tm3.user_id ORDER BY lc.completed_at DESC LIMIT 1
        );
    END IF;
  END IF;

  RETURN QUERY
  SELECT t.id, t.name, t.join_code, my_joined_at,
         my_joined_at + interval '7 days',
         COALESCE(SUM(public.weekly_xp(tm.user_id, wk)), 0)::int,
         (t.created_by = me)
  FROM public.teams t
  JOIN public.team_members tm ON tm.team_id = t.id
  WHERE t.id = my_team
  GROUP BY t.id, t.name, t.join_code, t.created_by;
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_team() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_team() TO authenticated;

-- Unchanged body (it calls weekly_xp); grants restated as 20261105100000 left them.
REVOKE ALL ON FUNCTION public.get_cohort_weekly_xp(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_cohort_weekly_xp(uuid, date) TO service_role;
