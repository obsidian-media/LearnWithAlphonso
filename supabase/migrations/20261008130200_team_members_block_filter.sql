-- A user blocked in either direction no longer appears in the caller's team member list.
-- get_team_members from 20260930110000_team_members_and_kick.sql, unchanged except the NOT EXISTS filter.
-- Rollback: re-run CREATE FUNCTION public.get_team_members() from 20260930110000_team_members_and_kick.sql as
-- CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.get_team_members()
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
    AND NOT EXISTS (
      SELECT 1 FROM public.blocked_users bu
      WHERE (bu.blocker = me AND bu.blocked = tm.user_id)
         OR (bu.blocker = tm.user_id AND bu.blocked = me)
    )
  ORDER BY tm.joined_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_team_members() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_members() TO authenticated;
