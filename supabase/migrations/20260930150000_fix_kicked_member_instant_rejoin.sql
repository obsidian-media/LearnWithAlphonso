-- Found via two independent third-party audits (Fable, Codex #4),
-- confirmed live: kick_team_member() only DELETEs the kicked user's
-- public.team_members row -- which is also the ONLY thing the existing
-- 7-day switch-lock reads (_join_team_impl's `existing_joined_at`
-- check, keyed on that row's own `joined_at`). Deleting it destroys the
-- switch-lock information along with the membership, so a kicked user
-- who still has the team's join_code (unrotated -- kicking never
-- rotates it) can call join_team() again immediately and rejoin the
-- same team the owner just removed them from. Kicking currently has no
-- durable effect at all beyond a few seconds.
--
-- Fix: record the kick separately, in its own table, and have
-- _join_team_impl treat a recent kick exactly like the switch-lock it
-- already enforces -- same 7-day window, same 'switch-locked' reason
-- string, so no web/iOS client change is needed. One row per user (not
-- per team_id/user_id pair): the switch-lock itself is inherently
-- per-user ("you may not switch teams for 7 days"), not per-team, so a
-- second kick from a different team simply overwrites the first --
-- correct, since only the most recent kick's cooldown matters.
CREATE TABLE public.team_kicks (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  kicked_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.team_kicks TO service_role;
ALTER TABLE public.team_kicks ENABLE ROW LEVEL SECURITY;
-- No client-facing policy at all -- only the two SECURITY DEFINER
-- functions below touch it, same "hardened" pattern as
-- team_weekly_rewards in the same original migration.

-- Reproduced in full (CREATE OR REPLACE needs the whole body): adds one
-- more early-return check, identical shape to the switch-lock check
-- directly above it.
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
  recently_kicked_at timestamptz;
BEGIN
  SELECT joined_at INTO existing_joined_at FROM public.team_members WHERE user_id = _me;
  IF existing_joined_at IS NOT NULL AND existing_joined_at > now() - interval '7 days' THEN
    RETURN QUERY SELECT false, 'switch-locked', NULL::uuid;
    RETURN;
  END IF;

  SELECT tk.kicked_at INTO recently_kicked_at FROM public.team_kicks tk WHERE tk.user_id = _me;
  IF recently_kicked_at IS NOT NULL AND recently_kicked_at > now() - interval '7 days' THEN
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

-- Reproduced in full: one INSERT added right after the existing
-- DELETE's FOUND check, recording the kick once it's confirmed a real
-- member was actually removed.
CREATE OR REPLACE FUNCTION public.kick_team_member(_user_id uuid)
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

  -- Recorded only after the delete actually removed a real member --
  -- ordering matters: doing this before the FOUND check would let the
  -- owner "kick" (and switch-lock) an arbitrary uuid that was never
  -- even on the team.
  INSERT INTO public.team_kicks (user_id, team_id, kicked_at)
  VALUES (_user_id, my_team, now())
  ON CONFLICT (user_id) DO UPDATE SET team_id = excluded.team_id, kicked_at = excluded.kicked_at;

  RETURN QUERY SELECT true, NULL::text;
END;
$$;
REVOKE ALL ON FUNCTION public.kick_team_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kick_team_member(uuid) TO authenticated;
