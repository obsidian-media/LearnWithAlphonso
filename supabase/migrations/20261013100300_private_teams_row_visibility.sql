-- A private team is join-by-code only, but its row (name, owner) and its member list were readable by every
-- signed-in user straight from the tables (teams_select_all / team_members_select_all were USING (true)).
-- From now on:
--   teams         a team row is visible when the team is public, or when the caller is a member of it;
--   team_members  a membership row is visible only for the caller's own team.
--
-- Nothing in the apps reads these tables directly except the "report a team name" lookup, which only ever
-- targets a team shown on the public board (a public team, or the reporter's own team), and the account export,
-- which reads the caller's own membership row. Every other read (leaderboard, my team, members, missions) goes
-- through SECURITY DEFINER functions, which bypass RLS and are unchanged.
--
-- The membership lookup lives in a SECURITY DEFINER helper so neither policy has to read team_members through
-- its own policy (which would recurse).
--
-- Rollback:
--   DROP POLICY "teams_select_visible" ON public.teams;
--   DROP POLICY "team_members_select_own_team" ON public.team_members;
--   CREATE POLICY "teams_select_all" ON public.teams FOR SELECT TO authenticated USING (true);
--   CREATE POLICY "team_members_select_all" ON public.team_members FOR SELECT TO authenticated USING (true);
--   DROP FUNCTION public._my_team_id();

CREATE OR REPLACE FUNCTION public._my_team_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tm.team_id FROM public.team_members tm WHERE tm.user_id = auth.uid()
$$;

REVOKE ALL ON FUNCTION public._my_team_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._my_team_id() TO authenticated;

DROP POLICY "teams_select_all" ON public.teams;
CREATE POLICY "teams_select_visible" ON public.teams FOR SELECT TO authenticated
  USING (visibility = 'public' OR id = (SELECT public._my_team_id()));

DROP POLICY "team_members_select_all" ON public.team_members;
CREATE POLICY "team_members_select_own_team" ON public.team_members FOR SELECT TO authenticated
  USING (team_id = (SELECT public._my_team_id()));
