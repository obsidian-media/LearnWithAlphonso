-- "Team player" badge (docs/superpowers/specs/2026-10-06-study-together-design.md, Part 1, Phase 2).
--
-- Members who help their team finish a weekly mission also unlock this badge. Two changes:
--  1. one achievements row: team_player, category 'team', threshold 1;
--  2. _resolve_team_mission (from 20261006150000) grants it to exactly the members it just paid, inside the same
--     atomic payout. Everything else in that function is unchanged (course-aware payout, two-member gate, UTC pin).
--
-- The 'team' category is not computed by any client (sync.functions.ts reads stats[category] ?? 0), so only this
-- server path can unlock it. The client catalogs (web, iOS, Android) list it so it renders.
--
-- ROLLBACK:
--   DELETE FROM public.user_achievements WHERE achievement_id = 'team_player';
--   DELETE FROM public.achievements WHERE id = 'team_player';
--   then re-apply _resolve_team_mission exactly as in 20261006150000_team_missions.sql.

INSERT INTO public.achievements (id, title, description, icon, tier, category, threshold, sort_order)
VALUES ('team_player', 'Team player', 'Help your team finish a weekly mission', 'star', 'silver', 'team', 1, 50)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public._resolve_team_mission(_team uuid, _wk date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET timezone = 'UTC'
AS $$
DECLARE
  m public.team_missions%ROWTYPE;
BEGIN
  SELECT * INTO m FROM public.team_missions WHERE team_id = _team AND week_start = _wk;
  IF NOT FOUND OR m.rewarded_at IS NOT NULL THEN
    RETURN;
  END IF;
  IF public._team_mission_count(_team, _wk) < m.target THEN
    RETURN;
  END IF;
  -- A team that has dropped below two members since the snapshot is no longer a team mission.
  IF (SELECT count(*) FROM public.team_members tm WHERE tm.team_id = _team) < 2 THEN
    RETURN;
  END IF;

  UPDATE public.team_missions SET rewarded_at = now()
  WHERE team_id = _team AND week_start = _wk AND rewarded_at IS NULL;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  INSERT INTO public.team_mission_rewards (team_id, week_start, user_id, xp)
  SELECT _team, _wk, tm.user_id, 50
  FROM public.team_members tm
  WHERE tm.team_id = _team
    AND public._team_mission_count(_team, _wk, tm.user_id) >= 1
  ON CONFLICT DO NOTHING;

  -- Paid on the course the member actually studied this week (their latest contributing lesson), not on
  -- profiles.active_language: nothing ever writes that column, so it is 'en' for everyone and a French or Spanish
  -- learner would be recorded as rewarded and receive nothing. A contributing member always has a language_progress
  -- row for that course (completing a lesson upserts it).
  UPDATE public.language_progress lp
  SET xp = lp.xp + r.xp
  FROM public.team_mission_rewards r
  WHERE r.team_id = _team AND r.week_start = _wk
    AND lp.user_id = r.user_id
    AND lp.language = (
      SELECT lc.language
      FROM public.lesson_completions lc
      JOIN public.team_members tm ON tm.user_id = lc.user_id AND tm.team_id = _team
      WHERE lc.user_id = r.user_id
        AND lc.completed_at >= GREATEST(_wk::timestamptz, tm.joined_at)
        AND lc.completed_at < (_wk + 7)::timestamptz
      ORDER BY lc.completed_at DESC
      LIMIT 1
    );

  -- The Team player badge goes to exactly the members who were just paid, in the same payout (the atomic rewarded_at
  -- guard above makes this run once per team-week). Granted here, by the server, because the 'team' achievement
  -- category has no client-side stat, so lesson completion can never unlock it.
  INSERT INTO public.user_achievements (user_id, achievement_id, progress)
  SELECT r.user_id, 'team_player', 1
  FROM public.team_mission_rewards r
  WHERE r.team_id = _team AND r.week_start = _wk
  ON CONFLICT (user_id, achievement_id) DO NOTHING;
END;
$$;

-- CREATE OR REPLACE keeps existing privileges, but state them so a future reader never has to wonder.
REVOKE ALL ON FUNCTION public._resolve_team_mission(uuid, date) FROM PUBLIC, anon, authenticated;
