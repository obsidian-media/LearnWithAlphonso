-- V3 backlog sec 2.2, item A: no way today to remove a friendship. Sibling
-- of accept_friend_invite (supabase/migrations/20260912041500_accept_friend_invite.sql)
-- -- same atomicity concern (both directions of the pair must go
-- together, since friendships is a directed table with one row per
-- direction), same SECURITY DEFINER shape.
--
-- Scoped to remove only, not block, per docs/v3-kickoffs/
-- 02-friends-v2-remainder-and-leaderboard-course-awareness.md's own
-- steer ("don't build blocking speculatively if only remove was
-- actually asked for") -- nothing in this project's backlog asks for
-- blocking specifically, just "a way to remove a friendship." Blocking
-- (preventing a *future* re-invite from the same person) needs its own
-- persisted state distinct from "never was a friend" and is a real,
-- separate follow-up if actually wanted.
--
-- Unlike accept_friend_invite/get_friends_progress originally were, this
-- one gets REVOKE ALL FROM PUBLIC, anon from the start (see
-- supabase/migrations/20260913010000_revoke_public_on_friend_functions.sql
-- for why that pattern exists -- every SECURITY DEFINER function in this
-- project follows it now except the two that predated it).
CREATE OR REPLACE FUNCTION public.remove_friend(_friend_id uuid)
RETURNS TABLE (ok boolean, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _me uuid := auth.uid();
BEGIN
  IF _me IS NULL THEN
    RETURN QUERY SELECT false, 'not authenticated';
    RETURN;
  END IF;
  IF _friend_id = _me THEN
    RETURN QUERY SELECT false, 'cannot remove yourself';
    RETURN;
  END IF;

  DELETE FROM public.friendships WHERE user_id = _me AND friend_id = _friend_id;
  DELETE FROM public.friendships WHERE user_id = _friend_id AND friend_id = _me;

  RETURN QUERY SELECT true, 'removed';
END;
$$;

REVOKE ALL ON FUNCTION public.remove_friend(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_friend(uuid) TO authenticated;
