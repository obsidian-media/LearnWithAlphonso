-- Teams -- V4 candidate #7 (deeper gamification, docs/superpowers/specs/
-- 2026-09-22-deeper-gamification-design.md). A persistent, many-to-one
-- grouping distinct from friends (strictly 1:1). One user belongs to
-- at most one team at a time (unique index on team_members.user_id),
-- with a 7-day switch lock after joining to discourage last-minute
-- team-hopping to chase a winning team.
--
-- Depends on public.weekly_xp(_user_id, _week_start) from
-- 20260922030000_weekly_xp_helper.sql -- that migration must be
-- applied to the live project before this one (merge order matters
-- here even though these are separate PRs/branches).
CREATE TABLE public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  join_code text NOT NULL UNIQUE,
  visibility text NOT NULL CHECK (visibility IN ('public', 'private')),
  member_cap integer NOT NULL DEFAULT 30,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.teams TO authenticated;
GRANT ALL ON public.teams TO service_role;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "teams_select_all" ON public.teams FOR SELECT TO authenticated USING (true);

CREATE TABLE public.team_members (
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, user_id),
  UNIQUE (user_id)
);
GRANT SELECT ON public.team_members TO authenticated;
GRANT ALL ON public.team_members TO service_role;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team_members_select_all" ON public.team_members FOR SELECT TO authenticated USING (true);

CREATE TABLE public.team_weekly_rewards (
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  resolved_at timestamptz,
  PRIMARY KEY (team_id, week_start)
);
GRANT ALL ON public.team_weekly_rewards TO service_role;
ALTER TABLE public.team_weekly_rewards ENABLE ROW LEVEL SECURITY;
-- No client policy at all -- only SECURITY DEFINER functions (running
-- as table owner) and service_role touch this table, same "hardened,
-- no direct client access" pattern as supabase/migrations/
-- 20260920050000_revoke_direct_gamification_writes.sql applies to
-- user_progress/language_progress/etc.

-- Internal helper: the actual membership write, called by all three
-- join entry points below so the switch-lock and member-cap rules
-- exist in exactly one place. Not exposed to clients directly (no
-- GRANT EXECUTE TO authenticated on this one).
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
BEGIN
  SELECT joined_at INTO existing_joined_at FROM public.team_members WHERE user_id = _me;
  IF existing_joined_at IS NOT NULL AND existing_joined_at > now() - interval '7 days' THEN
    RETURN QUERY SELECT false, 'switch-locked', NULL::uuid;
    RETURN;
  END IF;

  -- Lock the team's existing membership rows before counting, so two
  -- concurrent joins against a near-full team can't both squeeze past
  -- member_cap (self-critique finding from the design brainstorm).
  PERFORM 1 FROM public.team_members WHERE team_id = _team_id FOR UPDATE;
  SELECT count(*) INTO current_count FROM public.team_members WHERE team_id = _team_id;
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

CREATE OR REPLACE FUNCTION public.join_team(_code text)
RETURNS TABLE(ok boolean, reason text, team_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  target uuid;
BEGIN
  IF me IS NULL THEN
    RETURN QUERY SELECT false, 'unauthenticated', NULL::uuid;
    RETURN;
  END IF;
  SELECT id INTO target FROM public.teams WHERE join_code = _code;
  IF target IS NULL THEN
    RETURN QUERY SELECT false, 'invalid-code', NULL::uuid;
    RETURN;
  END IF;
  RETURN QUERY SELECT * FROM public._join_team_impl(target, me);
END;
$$;

CREATE OR REPLACE FUNCTION public.join_public_team(_team_id uuid)
RETURNS TABLE(ok boolean, reason text, team_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  is_public boolean;
BEGIN
  IF me IS NULL THEN
    RETURN QUERY SELECT false, 'unauthenticated', NULL::uuid;
    RETURN;
  END IF;
  SELECT (visibility = 'public') INTO is_public FROM public.teams WHERE id = _team_id;
  IF is_public IS NOT TRUE THEN
    RETURN QUERY SELECT false, 'team-not-found', NULL::uuid;
    RETURN;
  END IF;
  RETURN QUERY SELECT * FROM public._join_team_impl(_team_id, me);
END;
$$;

-- Word lists for auto-generated team names (auto_join_team, when no
-- public team has room). Not cryptographic -- just needs to "pick two
-- words," random() is fine here.
CREATE OR REPLACE FUNCTION public._random_team_name()
RETURNS text
LANGUAGE sql
AS $$
  SELECT (ARRAY['Swift','Bright','Bold','Keen','Steady','Quiet','Golden','Brave'])[1 + (floor(random() * 8))::int]
    || ' ' ||
    (ARRAY['Falcons','Otters','Maples','Ravens','Comets','Foxes','Larks','Cedars'])[1 + (floor(random() * 8))::int];
$$;

CREATE OR REPLACE FUNCTION public.auto_join_team()
RETURNS TABLE(ok boolean, reason text, team_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  target uuid;
  new_id uuid;
BEGIN
  IF me IS NULL THEN
    RETURN QUERY SELECT false, 'unauthenticated', NULL::uuid;
    RETURN;
  END IF;

  SELECT t.id INTO target
  FROM public.teams t
  WHERE t.visibility = 'public'
    AND (SELECT count(*) FROM public.team_members tm WHERE tm.team_id = t.id) < t.member_cap
  ORDER BY random()
  LIMIT 1;

  IF target IS NULL THEN
    INSERT INTO public.teams (name, join_code, visibility, created_by)
    VALUES (public._random_team_name(), encode(gen_random_bytes(6), 'base64'), 'public', me)
    RETURNING id INTO new_id;
    target := new_id;
  END IF;

  RETURN QUERY SELECT * FROM public._join_team_impl(target, me);
END;
$$;

CREATE OR REPLACE FUNCTION public.leave_team()
RETURNS TABLE(ok boolean, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  existing_joined_at timestamptz;
BEGIN
  IF me IS NULL THEN
    RETURN QUERY SELECT false, 'unauthenticated';
    RETURN;
  END IF;
  SELECT joined_at INTO existing_joined_at FROM public.team_members WHERE user_id = me;
  IF existing_joined_at IS NULL THEN
    RETURN QUERY SELECT false, 'not-on-a-team';
    RETURN;
  END IF;
  IF existing_joined_at > now() - interval '7 days' THEN
    RETURN QUERY SELECT false, 'switch-locked';
    RETURN;
  END IF;
  DELETE FROM public.team_members WHERE user_id = me;
  RETURN QUERY SELECT true, NULL::text;
END;
$$;

REVOKE ALL ON FUNCTION public.join_team(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_team(text) TO authenticated;
REVOKE ALL ON FUNCTION public.join_public_team(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_public_team(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.auto_join_team() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auto_join_team() TO authenticated;
REVOKE ALL ON FUNCTION public.leave_team() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_team() TO authenticated;

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
  SELECT t.id, t.name, COALESCE(SUM(public.weekly_xp(tm.user_id, wk)), 0)::int
  FROM public.teams t
  JOIN public.team_members tm ON tm.team_id = t.id
  GROUP BY t.id, t.name
  ORDER BY 3 DESC
  LIMIT 50;
END;
$$;

-- Resolves the caller's own team's PREVIOUS week's win bonus (if it
-- was #1 and hasn't been paid yet), the same "resolve as a side
-- effect of a read the client already makes" pattern get_my_duels
-- uses for its own lazy window-resolution -- no cron, no separate
-- trigger call needed.
CREATE OR REPLACE FUNCTION public.get_my_team()
RETURNS TABLE(
  team_id uuid, name text, join_code text, joined_at timestamptz,
  switch_locked_until timestamptz, this_week_xp integer
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
  -- team_weekly_rewards primary key.
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

    -- Only actually grant XP if this insert is the one that "won" the
    -- race (guards against two concurrent callers both trying to pay
    -- out the same week). Set-based UPDATE across every member at
    -- once -- not a per-member loop, which would need a correlated
    -- subquery per iteration and is easy to get wrong (verified while
    -- writing this: a naive loop version doesn't correlate the UPDATE
    -- to the current loop member and breaks on more than one member).
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
         COALESCE(SUM(public.weekly_xp(tm.user_id, wk)), 0)::int
  FROM public.teams t
  JOIN public.team_members tm ON tm.team_id = t.id
  WHERE t.id = my_team
  GROUP BY t.id, t.name, t.join_code;
END;
$$;

REVOKE ALL ON FUNCTION public.get_team_leaderboard() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_leaderboard() TO authenticated;
REVOKE ALL ON FUNCTION public.get_my_team() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_team() TO authenticated;
