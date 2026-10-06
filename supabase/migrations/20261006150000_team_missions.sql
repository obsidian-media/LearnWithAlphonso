-- Team missions (docs/superpowers/specs/2026-10-06-study-together-design.md, Part 1).
--
-- Each team of 2+ members gets one shared goal per ISO week (Monday, UTC): members x 4 lessons. The target is
-- snapshotted on the first read of the week, so a member who joins later raises it only from next week. Progress is
-- the number of lessons (one lesson_completions row per user per lesson, so replays cannot farm it) first completed
-- this week by CURRENT members, counted from max(week start, the member's joined_at) so join-hopping cannot farm it.
-- When the total reaches the target, every member with at least one contributing lesson gets +50 XP on their active
-- course, once per team-week (atomic guard on team_missions.rewarded_at), resolved lazily on the next read (the previous
-- week is resolved too, so a mission finished and never viewed is still paid). No cron, same pattern as get_my_team's
-- weekly bonus. The "Team player" badge ships with the iOS/Android catalogs (Phase 2).
-- Every function pins SET timezone = 'UTC' so the week (current_date) and the lesson bounds are UTC whatever the
-- caller's session time zone.
-- Known, accepted: payout resolves against CURRENT members, so a contributor who leaves between the week's end and
-- the first read can drop a finished mission below its target (leaving takes your contribution with you).
--
-- client-grants: none public.team_missions
-- (read only through get_team_mission(); team_mission_rewards is readable by its owner for the data export.)
--
-- ROLLBACK:
--   DROP FUNCTION public.get_team_mission();
--   DROP FUNCTION public._resolve_team_mission(uuid, date);
--   DROP FUNCTION public._team_mission_count(uuid, date, uuid);
--   DROP TABLE public.team_mission_rewards;
--   DROP TABLE public.team_missions;
-- (XP already granted is not taken back.)

CREATE TABLE public.team_missions (
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  target integer NOT NULL CHECK (target > 0),
  member_count integer NOT NULL CHECK (member_count >= 2),
  created_at timestamptz NOT NULL DEFAULT now(),
  rewarded_at timestamptz,
  PRIMARY KEY (team_id, week_start)
);
ALTER TABLE public.team_missions ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.team_missions TO service_role;

CREATE TABLE public.team_mission_rewards (
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  xp integer NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, week_start, user_id)
);
ALTER TABLE public.team_mission_rewards ENABLE ROW LEVEL SECURITY;
CREATE POLICY team_mission_rewards_select_own ON public.team_mission_rewards FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
GRANT SELECT ON public.team_mission_rewards TO authenticated;
GRANT ALL ON public.team_mission_rewards TO service_role;

-- Lessons first completed in the week [_wk, _wk + 7) by current members of _team, each counted from the later of the week
-- start and that member's joined_at. _user NULL = the whole team, otherwise just that member.
CREATE OR REPLACE FUNCTION public._team_mission_count(_team uuid, _wk date, _user uuid DEFAULT NULL)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET timezone = 'UTC'
AS $$
  SELECT count(*)::int
  FROM public.lesson_completions lc
  JOIN public.team_members tm ON tm.user_id = lc.user_id AND tm.team_id = _team
  WHERE (_user IS NULL OR lc.user_id = _user)
    AND lc.completed_at >= GREATEST(_wk::timestamptz, tm.joined_at)
    AND lc.completed_at < (_wk + 7)::timestamptz;
$$;

-- Pays the mission for _team / _wk if it exists, is unpaid and the target is met. Safe to call repeatedly and
-- concurrently: the UPDATE ... rewarded_at IS NULL is the single winner.
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
END;
$$;

CREATE OR REPLACE FUNCTION public.get_team_mission()
RETURNS TABLE (
  team_id uuid,
  week_start date,
  week_end date,
  target integer,
  total integer,
  my_count integer,
  member_count integer,
  status text,
  reward_xp integer,
  rewarded boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET timezone = 'UTC'
AS $$
DECLARE
  me uuid := auth.uid();
  wk date := (current_date - ((extract(isodow from current_date)::int) - 1));
  my_team uuid;
  members integer;
  m public.team_missions%ROWTYPE;
BEGIN
  IF me IS NULL THEN
    RETURN;
  END IF;

  SELECT tm.team_id INTO my_team FROM public.team_members tm WHERE tm.user_id = me;
  IF my_team IS NULL THEN
    RETURN;
  END IF;

  SELECT count(*)::int INTO members FROM public.team_members tm WHERE tm.team_id = my_team;

  -- A team below two members has no mission this week: no snapshot, no payout, no promise of XP it cannot pay.
  IF members < 2 THEN
    RETURN QUERY SELECT my_team, wk, wk + 7, 0, 0, 0, members, 'needs_members'::text, 0, false;
    RETURN;
  END IF;

  -- A mission finished last week and never viewed is still paid.
  PERFORM public._resolve_team_mission(my_team, wk - 7);

  SELECT * INTO m FROM public.team_missions tmi WHERE tmi.team_id = my_team AND tmi.week_start = wk;
  IF NOT FOUND AND members >= 2 THEN
    INSERT INTO public.team_missions (team_id, week_start, target, member_count)
    VALUES (my_team, wk, members * 4, members)
    ON CONFLICT DO NOTHING;
    SELECT * INTO m FROM public.team_missions tmi WHERE tmi.team_id = my_team AND tmi.week_start = wk;
  END IF;

  PERFORM public._resolve_team_mission(my_team, wk);
  SELECT * INTO m FROM public.team_missions tmi WHERE tmi.team_id = my_team AND tmi.week_start = wk;

  RETURN QUERY
  SELECT my_team, wk, wk + 7, m.target,
         public._team_mission_count(my_team, wk),
         public._team_mission_count(my_team, wk, me),
         m.member_count,
         CASE WHEN public._team_mission_count(my_team, wk) >= m.target THEN 'complete' ELSE 'in_progress' END,
         50,
         (m.rewarded_at IS NOT NULL);
END;
$$;

REVOKE ALL ON FUNCTION public._team_mission_count(uuid, date, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._resolve_team_mission(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_team_mission() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_mission() TO authenticated;
