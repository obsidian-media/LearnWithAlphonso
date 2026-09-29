-- TestFlight feedback (2026-09-29): "Does the team owner have any
-- authority?" -- honest answer at the time was no: teams had no visible
-- member list at all, and no owner-only action of any kind. Adds a
-- member-list RPC and an owner-only kick, and threads is_owner through
-- get_my_team so the client knows whether to show kick controls.
--
-- get_my_team's RETURNS TABLE column set is changing (adding is_owner),
-- which CREATE OR REPLACE cannot do -- Postgres requires a drop/create
-- for that, and a drop loses any grants, so they're re-applied below.
DROP FUNCTION public.get_my_team();

CREATE FUNCTION public.get_my_team()
RETURNS TABLE(
  team_id uuid, name text, join_code text, joined_at timestamptz,
  switch_locked_until timestamptz, this_week_xp integer, is_owner boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    SELECT 1 FROM public.team_weekly_rewards WHERE team_id = winner_team AND week_start = prev_wk
  ) THEN
    INSERT INTO public.team_weekly_rewards (team_id, week_start, resolved_at)
    VALUES (winner_team, prev_wk, now())
    ON CONFLICT DO NOTHING;

    IF FOUND THEN
      UPDATE public.language_progress lp
      SET xp = lp.xp + 100
      FROM public.team_members tm3
      JOIN public.profiles p ON p.id = tm3.user_id
      WHERE tm3.team_id = winner_team
        AND lp.user_id = tm3.user_id
        AND lp.language = p.active_language;
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

-- Every member of the caller's own team, owner flagged. team_members_
-- select_all's RLS policy already lets any authenticated user read every
-- row directly, but a dedicated RPC (rather than a raw PostgREST embed)
-- avoids depending on PostgREST auto-detecting a join across
-- team_members/profiles that don't have a direct FK to each other (both
-- reference auth.users, not one another) -- matches this codebase's
-- established pattern of joined-read RPCs elsewhere (get_friends_progress,
-- get_team_leaderboard).
CREATE FUNCTION public.get_team_members()
RETURNS TABLE(user_id uuid, display_name text, avatar_seed text, joined_at timestamptz, is_owner boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  my_team uuid;
BEGIN
  IF me IS NULL THEN
    RETURN;
  END IF;
  SELECT tm.team_id INTO my_team FROM public.team_members tm WHERE tm.user_id = me;
  IF my_team IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT tm.user_id, p.display_name, p.avatar_seed, tm.joined_at, (t.created_by = tm.user_id)
  FROM public.team_members tm
  JOIN public.profiles p ON p.id = tm.user_id
  JOIN public.teams t ON t.id = tm.team_id
  WHERE tm.team_id = my_team
  ORDER BY tm.joined_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_team_members() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_members() TO authenticated;

-- Owner-only removal. Deliberately refuses removing yourself (leave_team
-- already covers that, with its own switch-lock semantics this function
-- doesn't need to duplicate or interact with).
CREATE FUNCTION public.kick_team_member(_user_id uuid)
RETURNS TABLE(ok boolean, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  my_team uuid;
  owner uuid;
BEGIN
  IF me IS NULL THEN
    RETURN QUERY SELECT false, 'unauthenticated';
    RETURN;
  END IF;
  IF _user_id = me THEN
    RETURN QUERY SELECT false, 'cannot-kick-yourself';
    RETURN;
  END IF;

  SELECT tm.team_id INTO my_team FROM public.team_members tm WHERE tm.user_id = me;
  IF my_team IS NULL THEN
    RETURN QUERY SELECT false, 'not-on-a-team';
    RETURN;
  END IF;

  SELECT t.created_by INTO owner FROM public.teams t WHERE t.id = my_team;
  IF owner IS DISTINCT FROM me THEN
    RETURN QUERY SELECT false, 'not-team-owner';
    RETURN;
  END IF;

  DELETE FROM public.team_members WHERE team_id = my_team AND user_id = _user_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'member-not-found';
    RETURN;
  END IF;

  RETURN QUERY SELECT true, NULL::text;
END;
$$;

REVOKE ALL ON FUNCTION public.kick_team_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kick_team_member(uuid) TO authenticated;
