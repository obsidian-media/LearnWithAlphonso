-- Found via two independent third-party audits (Codex, Fable), confirmed
-- live: accept_friend_invite(_inviter_id uuid) force-creates a mutual
-- friendship for ANY uuid the caller supplies, with zero verification
-- that the "inviter" ever intended to invite that caller -- or anyone.
-- friends.functions.ts's own doc comment on acceptFriendInvite assumed
-- "opening the inviter's link and confirming *is* the consent action",
-- but the link (/invite/$inviterId) is just the target's raw user id,
-- which is already incidentally exposed through get_leaderboard,
-- get_team_members, get_my_duels and the activity feed. Any
-- authenticated user can build that URL for any OTHER user's id and
-- click "Add friend" themselves, forcing a friendship the target never
-- agreed to -- the "confirm" step was performed by the attacker, not
-- the target the link claims to belong to.
--
-- Fix mirrors the team join_code pattern (20260922040000_teams.sql): a
-- per-user opaque invite code, generated lazily, unrelated to the
-- user's id, that only becomes known to another user when the owner
-- deliberately shares it (profile_.friends.tsx's "copy invite link").
-- Unlike public.teams.join_code, this lives in its own table with NO
-- client-facing policy at all -- profiles' own "profiles_read_all_auth"
-- policy (USING (true)) would otherwise make a same-table code column
-- exactly as universally readable as the uuid it's replacing, defeating
-- the fix. The only two things that ever touch this table are the two
-- SECURITY DEFINER functions below, same "hardened, no direct client
-- access" pattern as team_weekly_rewards already uses in the same file.
CREATE TABLE public.friend_invite_codes (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.friend_invite_codes TO service_role;
ALTER TABLE public.friend_invite_codes ENABLE ROW LEVEL SECURITY;

-- TABLE-returning, not a bare scalar, so this parses through the exact
-- same "array of row objects" PostgREST shape every other RPC in this
-- codebase already uses on both the web and iOS clients -- a scalar
-- return would be the one function needing its own bespoke parsing path.
CREATE OR REPLACE FUNCTION public.get_or_create_my_friend_code()
RETURNS TABLE(code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  existing text;
BEGIN
  IF me IS NULL THEN
    RETURN;
  END IF;
  SELECT c.code INTO existing FROM public.friend_invite_codes c WHERE c.user_id = me;
  IF existing IS NOT NULL THEN
    RETURN QUERY SELECT existing;
    RETURN;
  END IF;
  INSERT INTO public.friend_invite_codes (user_id, code)
  VALUES (me, encode(extensions.gen_random_bytes(6), 'base64'))
  ON CONFLICT (user_id) DO NOTHING;
  SELECT c.code INTO existing FROM public.friend_invite_codes c WHERE c.user_id = me;
  RETURN QUERY SELECT existing;
END;
$$;
REVOKE ALL ON FUNCTION public.get_or_create_my_friend_code() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_my_friend_code() TO authenticated, service_role;

-- Replaces accept_friend_invite(_inviter_id uuid) -- DROP is required
-- because the parameter list itself is changing (uuid -> text);
-- CREATE OR REPLACE cannot do that. A drop loses grants, so both are
-- re-applied explicitly below rather than left to the CREATE default
-- (which would be PUBLIC EXECUTE -- broader than this function ever had).
DROP FUNCTION IF EXISTS public.accept_friend_invite(uuid);

CREATE FUNCTION public.accept_friend_invite(_code text)
RETURNS TABLE (ok boolean, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _me uuid := auth.uid();
  _inviter_id uuid;
BEGIN
  IF _me IS NULL THEN
    RETURN QUERY SELECT false, 'not authenticated';
    RETURN;
  END IF;

  SELECT user_id INTO _inviter_id FROM public.friend_invite_codes WHERE code = _code;
  IF _inviter_id IS NULL THEN
    RETURN QUERY SELECT false, 'invalid-code';
    RETURN;
  END IF;
  IF _inviter_id = _me THEN
    RETURN QUERY SELECT false, 'cannot invite yourself';
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.blocked_users
    WHERE (blocker = _me AND blocked = _inviter_id)
       OR (blocker = _inviter_id AND blocked = _me)
  ) THEN
    RETURN QUERY SELECT false, 'blocked';
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
REVOKE ALL ON FUNCTION public.accept_friend_invite(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_friend_invite(text) TO authenticated, service_role;

-- Replaces getInviterProfile's direct `select display_name,avatar_seed
-- from profiles where id = $inviterId` (friends.functions.ts) -- that
-- query only worked because the URL param WAS the uuid; with an opaque
-- code the client has no uuid to filter on, so the code -> profile
-- lookup has to happen inside a SECURITY DEFINER function same as the
-- accept call above. Also reports is_self, since the client can no
-- longer tell "is this my own code" by comparing ids client-side either.
CREATE OR REPLACE FUNCTION public.get_friend_invite_preview(_code text)
RETURNS TABLE(ok boolean, is_self boolean, display_name text, avatar_seed text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  inviter_id uuid;
BEGIN
  IF me IS NULL THEN
    RETURN QUERY SELECT false, false, NULL::text, NULL::text;
    RETURN;
  END IF;
  SELECT user_id INTO inviter_id FROM public.friend_invite_codes WHERE code = _code;
  IF inviter_id IS NULL THEN
    RETURN QUERY SELECT false, false, NULL::text, NULL::text;
    RETURN;
  END IF;
  IF inviter_id = me THEN
    RETURN QUERY SELECT true, true, NULL::text, NULL::text;
    RETURN;
  END IF;
  RETURN QUERY
    SELECT true, false, p.display_name, p.avatar_seed
    FROM public.profiles p WHERE p.id = inviter_id;
END;
$$;
REVOKE ALL ON FUNCTION public.get_friend_invite_preview(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_friend_invite_preview(text) TO authenticated, service_role;
