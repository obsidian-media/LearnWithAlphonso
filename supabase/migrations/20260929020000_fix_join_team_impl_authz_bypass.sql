-- Security fix (pre-launch review, 2026-09-26): _join_team_impl never got
-- the `REVOKE ALL ... FROM PUBLIC, anon` that every sibling function in
-- 20260922040000_teams.sql received, and it never checked auth.uid()
-- itself -- it trusted `_me` exactly as given.
--
-- Confirmed reachable *fully unauthenticated* via
-- `POST /rest/v1/rpc/_join_team_impl` with an arbitrary `_me` uuid: the
-- call executed the function body (proven by hitting the ambiguous-column
-- bug fixed below, not a permission-denied error) instead of being
-- rejected the way `join_team` is when tested identically with the same
-- missing Authorization header. Anyone -- signed in or not -- could force
-- ANY user into ANY team (public or private, with no join code needed)
-- or evict them from whatever team they were already on, since the
-- membership write happens before any ownership/visibility check.
--
-- Two independent bugs are fixed together because they live in the same
-- function body: the missing REVOKE/auth check (the security hole), and
-- a PL/pgSQL bug where the RETURNS TABLE OUT parameter `team_id` collided
-- with `team_members.team_id` inside the row-lock/count query, raising
-- "column reference \"team_id\" is ambiguous" on every single call. That
-- bug is why team_members has zero rows in production today -- it broke
-- every legitimate join path too (join_team, join_public_team,
-- auto_join_team, create_team all route through this helper) -- but it
-- was also accidentally the only thing standing between this hole and
-- every real team, since a caller could never get far enough to see a
-- successful `ok: true` either way. Fixing only the ambiguous-column bug
-- without the auth check would have turned this from "broken for
-- everyone" into "exploitable by everyone" the moment it shipped.
--
-- Not touching the RETURNS TABLE shape (still `team_id`, not renamed) --
-- src/integrations/supabase/types.ts's _join_team_impl entry stays valid,
-- and no client code calls this RPC directly (grepped for
-- `.rpc('_join_team_impl'` -- zero matches; it was never meant to be
-- client-reachable, per this file's own original comment).
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
  -- The actual fix: every legitimate caller (join_team, join_public_team,
  -- auto_join_team, create_team) already resolves `_me := auth.uid()`
  -- before calling this -- so a real caller can never fail this check.
  -- An attacker who reaches this function directly, with someone else's
  -- id as `_me` or with no session at all, now gets rejected exactly
  -- like every other function in this file already rejects them.
  IF auth.uid() IS NULL OR auth.uid() <> _me THEN
    RETURN QUERY SELECT false, 'unauthenticated', NULL::uuid;
    RETURN;
  END IF;

  SELECT tm.joined_at INTO existing_joined_at FROM public.team_members tm WHERE tm.user_id = _me;
  IF existing_joined_at IS NOT NULL AND existing_joined_at > now() - interval '7 days' THEN
    RETURN QUERY SELECT false, 'switch-locked', NULL::uuid;
    RETURN;
  END IF;

  -- Table-qualified now (tm.team_id / t.member_cap) -- this is the
  -- ambiguous-column fix. Unqualified `team_id` here was resolving
  -- against this function's own OUT parameter of the same name instead
  -- of (or ambiguously with) team_members.team_id.
  PERFORM 1 FROM public.team_members tm WHERE tm.team_id = _team_id FOR UPDATE;
  SELECT count(*) INTO current_count FROM public.team_members tm WHERE tm.team_id = _team_id;
  SELECT t.member_cap INTO cap FROM public.teams t WHERE t.id = _team_id;
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

-- Belt and suspenders: even with the auth.uid() check above, this stays
-- what its original comment always claimed it was -- an internal helper
-- no client role can reach directly. Every legitimate caller is itself
-- SECURITY DEFINER (owned by the same role), so none of them need
-- EXECUTE granted here; they call it as the function owner, not as
-- `authenticated`.
REVOKE ALL ON FUNCTION public._join_team_impl(uuid, uuid) FROM PUBLIC, anon, authenticated;
