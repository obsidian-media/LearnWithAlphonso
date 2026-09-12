-- Friends v1 (invite-link based, TASK-085). The friendships table already
-- exists (user_id, friend_id, status default 'accepted', unique pair) but
-- its INSERT policy only lets a user insert rows where they themselves are
-- user_id -- so a client can't unilaterally write the *other* direction of
-- the pair. Opening an invite link is meant to be the consent action and
-- write both directions atomically, which needs a SECURITY DEFINER
-- function (same pattern as get_leaderboard) rather than two plain client
-- inserts.

CREATE OR REPLACE FUNCTION public.accept_friend_invite(_inviter_id uuid)
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
  IF _inviter_id = _me THEN
    RETURN QUERY SELECT false, 'cannot invite yourself';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _inviter_id) THEN
    RETURN QUERY SELECT false, 'inviter not found';
    RETURN;
  END IF;

  INSERT INTO public.friendships (user_id, friend_id, status)
  VALUES (_me, _inviter_id, 'accepted')
  ON CONFLICT (user_id, friend_id) DO NOTHING;

  INSERT INTO public.friendships (user_id, friend_id, status)
  VALUES (_inviter_id, _me, 'accepted')
  ON CONFLICT (user_id, friend_id) DO NOTHING;

  RETURN QUERY SELECT true, 'friends';
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_friend_invite(uuid) TO authenticated;

-- Friends' account-wide stats (streak, this-week XP) for the Friends tab.
CREATE OR REPLACE FUNCTION public.get_friends_progress()
RETURNS TABLE (
  user_id uuid,
  display_name text,
  avatar_seed text,
  streak integer,
  week_xp bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id AS user_id,
    p.display_name,
    p.avatar_seed,
    COALESCE(up.streak, 0) AS streak,
    COALESCE((
      SELECT SUM(ad.xp_earned)
      FROM public.activity_days ad
      WHERE ad.user_id = p.id AND ad.day >= (CURRENT_DATE - INTERVAL '6 days')
    ), 0) AS week_xp
  FROM public.friendships f
  JOIN public.profiles p ON p.id = f.friend_id
  LEFT JOIN public.user_progress up ON up.user_id = p.id
  WHERE f.user_id = auth.uid() AND f.status = 'accepted'
  ORDER BY week_xp DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_friends_progress() TO authenticated;
