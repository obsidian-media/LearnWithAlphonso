-- The global "top teams" board listed every team, including private ones. A private team is join-by-code only
-- (and auto-match never places anyone in one), so it should not be advertised to everyone. The board
-- now shows public teams, plus the caller's own team whether public or private (so a member still sees
-- where their own team ranks).
--
-- Only the WHERE clause changes from the definition in 20260922040000_teams.sql. Return shape, SECURITY
-- DEFINER, search_path, STABLE, the signed-out early return, ordering, the limit and the grants are as before.
--
-- Rollback: re-run the get_team_leaderboard definition from 20260922040000_teams.sql (the same statement
-- without the WHERE clause).

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
  WHERE t.visibility = 'public'
     OR t.id IN (SELECT m.team_id FROM public.team_members m WHERE m.user_id = auth.uid())
  GROUP BY t.id, t.name
  ORDER BY 3 DESC
  LIMIT 50;
END;
$$;

REVOKE ALL ON FUNCTION public.get_team_leaderboard() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_leaderboard() TO authenticated;
