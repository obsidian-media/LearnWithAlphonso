-- Teams were broken in production: nobody could create or join a team, and a member could not load their own team.
-- Plus BACKLOG 0.0-af: two XP payouts paid nobody who studies a language other than English.
--
-- 1. _join_team_impl (every join path: join_team, join_public_team, auto_join_team, create_team) and get_my_team both
--    declare a RETURNS TABLE column called team_id, then used an unqualified `WHERE team_id = ...` in their bodies.
--    In plpgsql that is a run-time error (42702 "column reference team_id is ambiguous", plpgsql.variable_conflict is
--    'error'), nothing fails at migration time, and there is no local Postgres to run it against, so it shipped. Found on
--    2026-10-06 by running the deployed functions as seeded users in a rolled-back transaction: create_team and
--    auto_join_team failed, and get_my_team failed for any user who is on a team (production had 0 team members).
--    The references are now qualified (team_members.team_id, rw.team_id). src/lib/plpgsql-output-column-clash.test.ts
--    reads every migration and fails on this whole class from now on.
-- 2. get_weekly_challenges (+100 XP per completed challenge) and get_my_team (+100 XP to every member of last week's
--    winning team) paid `language_progress WHERE language = profiles.active_language`. Nothing ever writes that column
--    (live: all 15 profiles are 'en'), so a French or Spanish learner was recorded as paid and received nothing, forever,
--    because both payouts run once. They now pay the learner's current course: the language of their most recently
--    completed lesson (lesson_completions.completed_at is the FIRST completion time and is never updated on a replay).
--    Team missions already pay the studied course (20261006150000).
--
-- Each function is the deployed one (20260930150000, 20260922030500, 20260930110000) with exactly the changes above plus
-- SET timezone = 'UTC' on the two that use current_date (the ISO week must not follow the caller's session time zone).
-- src/lib/team-and-payout-fixes-migration.test.ts pins that nothing else changed.
--
-- Not retroactive. No one lost XP: the two existing challenge completions belong to users who also have an English row (so
-- they were paid there), and no team bonus was ever paid because no team ever had a member.
--
-- ROLLBACK: re-apply _join_team_impl from 20260930150000_fix_kicked_member_instant_rejoin.sql, get_weekly_challenges from
-- 20260922030500_weekly_challenges.sql and get_my_team from 20260930110000_team_members_and_kick.sql (that restores the bug).

CREATE OR REPLACE FUNCTION public._join_team_impl(_team_id uuid, _me uuid)
RETURNS TABLE(ok boolean, reason text, team_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cap integer;
  current_count integer;
  existing_joined_at timestamptz;
  recently_kicked_at timestamptz;
BEGIN
  SELECT joined_at INTO existing_joined_at FROM public.team_members WHERE user_id = _me;
  IF existing_joined_at IS NOT NULL AND existing_joined_at > now() - interval '7 days' THEN
    RETURN QUERY SELECT false, 'switch-locked', NULL::uuid;
    RETURN;
  END IF;

  SELECT tk.kicked_at INTO recently_kicked_at FROM public.team_kicks tk WHERE tk.user_id = _me;
  IF recently_kicked_at IS NOT NULL AND recently_kicked_at > now() - interval '7 days' THEN
    RETURN QUERY SELECT false, 'switch-locked', NULL::uuid;
    RETURN;
  END IF;

  -- Lock the team's existing membership rows before counting, so two
  -- concurrent joins against a near-full team can't both squeeze past
  -- member_cap (self-critique finding from the design brainstorm).
  PERFORM 1 FROM public.team_members WHERE team_members.team_id = _team_id FOR UPDATE;
  SELECT count(*) INTO current_count FROM public.team_members WHERE team_members.team_id = _team_id;
  SELECT member_cap INTO cap FROM public.teams WHERE id = _team_id;
  IF cap IS NULL THEN
    RETURN QUERY SELECT false, 'team-not-found', NULL::uuid;
    RETURN;
  END IF;
  IF current_count >= cap THEN
    RETURN QUERY SELECT false, 'team-full', NULL::uuid;
    RETURN;
  END IF;

  DELETE FROM public.team_members WHERE user_id = _me;
  INSERT INTO public.team_members (team_id, user_id) VALUES (_team_id, _me);
  RETURN QUERY SELECT true, NULL::text, _team_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_weekly_challenges()
RETURNS TABLE(template_id text, title text, description text, type text, threshold integer, progress integer, completed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET timezone = 'UTC'
AS $$
DECLARE
  me uuid := auth.uid();
  wk date := (current_date - ((extract(isodow from current_date)::int) - 1));
  tpl RECORD;
  computed_progress integer;
  is_complete boolean;
BEGIN
  IF me IS NULL THEN
    RETURN;
  END IF;


  FOR tpl IN
    SELECT ct.id, ct.title, ct.description, ct.type, ct.threshold
    FROM public.challenge_templates ct
    ORDER BY hashtext(ct.id || wk::text)
    LIMIT 3
  LOOP
    IF tpl.type = 'lesson_count' THEN
      SELECT count(*) INTO computed_progress FROM public.lesson_completions lc
        WHERE lc.user_id = me AND lc.completed_at >= wk;
    ELSIF tpl.type = 'perfect_score_count' THEN
      SELECT count(*) INTO computed_progress FROM public.lesson_completions lc
        WHERE lc.user_id = me AND lc.completed_at >= wk AND lc.correct = lc.total;
    ELSE -- study_every_day
      SELECT count(DISTINCT ad.day) INTO computed_progress FROM public.activity_days ad
        WHERE ad.user_id = me AND ad.day >= wk;
    END IF;

    is_complete := EXISTS (
      SELECT 1 FROM public.challenge_completions cc
      WHERE cc.user_id = me AND cc.week_start = wk AND cc.template_id = tpl.id
    );

    IF NOT is_complete AND computed_progress >= tpl.threshold THEN
      INSERT INTO public.challenge_completions (user_id, week_start, template_id)
      VALUES (me, wk, tpl.id)
      ON CONFLICT DO NOTHING;
      IF FOUND THEN
        UPDATE public.language_progress lp SET xp = lp.xp + 100
        WHERE lp.user_id = me AND lp.language = (
          SELECT lc.language FROM public.lesson_completions lc
          WHERE lc.user_id = me ORDER BY lc.completed_at DESC LIMIT 1
        );
        is_complete := true;
      END IF;
    END IF;

    RETURN QUERY SELECT tpl.id, tpl.title, tpl.description, tpl.type, tpl.threshold, computed_progress, is_complete;
  END LOOP;
END;
$$;

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

  -- Lazy reward resolution for whichever team was #1 last week --
  -- resolved at most once per team per week, guarded by the
  -- team_weekly_rewards primary key. Unchanged from the original.
  SELECT t.id INTO winner_team
  FROM public.teams t
  JOIN public.team_members tm2 ON tm2.team_id = t.id
  GROUP BY t.id
  ORDER BY COALESCE(SUM(public.weekly_xp(tm2.user_id, prev_wk)), 0) DESC
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

-- CREATE OR REPLACE keeps the existing privileges; state them so nobody has to wonder. _join_team_impl is internal.
REVOKE ALL ON FUNCTION public._join_team_impl(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_weekly_challenges() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_weekly_challenges() TO authenticated;
REVOKE ALL ON FUNCTION public.get_my_team() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_team() TO authenticated;
