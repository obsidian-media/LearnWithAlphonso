-- A blocked teammate is hidden from the blocker everywhere EXCEPT the team
-- owner's kick list, where members the owner blocked appear with blocked = true ("Blocked") so the owner can remove
-- them. A member who blocked the owner stays hidden from the owner (never disclose who blocked you). Non-owners keep
-- 20261008130200's rule: blocks hide teammates in both directions. Base: get_team_members from 20261008130200.
--
-- Rollback (one transaction): DROP FUNCTION public.get_team_members(); re-run it from
--   20261008130200_team_members_block_filter.sql, then
--   REVOKE ALL ON FUNCTION public.get_team_members() FROM PUBLIC, anon;
--   GRANT EXECUTE ON FUNCTION public.get_team_members() TO authenticated, service_role;

DROP FUNCTION public.get_team_members();
CREATE OR REPLACE FUNCTION public.get_team_members()
RETURNS TABLE(user_id uuid, display_name text, avatar_seed text, joined_at timestamptz, is_owner boolean, blocked boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  my_team uuid;
  i_own boolean;
BEGIN
  IF me IS NULL THEN
    RETURN;
  END IF;
  SELECT tm.team_id INTO my_team FROM public.team_members tm WHERE tm.user_id = me;
  IF my_team IS NULL THEN
    RETURN;
  END IF;
  SELECT coalesce(t.created_by = me, false) INTO i_own FROM public.teams t WHERE t.id = my_team;
  i_own := coalesce(i_own, false);

  RETURN QUERY
  SELECT tm.user_id, p.display_name, p.avatar_seed, tm.joined_at, (t.created_by = tm.user_id),
    EXISTS (SELECT 1 FROM public.blocked_users bu WHERE bu.blocker = me AND bu.blocked = tm.user_id)
  FROM public.team_members tm
  JOIN public.profiles p ON p.id = tm.user_id
  JOIN public.teams t ON t.id = tm.team_id
  WHERE tm.team_id = my_team
    -- They blocked me: hidden from me, owner or not.
    AND NOT EXISTS (
      SELECT 1 FROM public.blocked_users bu
      WHERE (bu.blocker = tm.user_id AND bu.blocked = me)
    )
    -- I blocked them: hidden, unless I own the team (the owner must be able to remove them).
    AND (i_own OR NOT EXISTS (
      SELECT 1 FROM public.blocked_users bu
      WHERE (bu.blocker = me AND bu.blocked = tm.user_id)
    ))
  ORDER BY tm.joined_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_team_members() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_members() TO authenticated, service_role;

