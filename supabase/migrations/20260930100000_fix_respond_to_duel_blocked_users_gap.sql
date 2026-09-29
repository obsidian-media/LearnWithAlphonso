-- Fresh whole-codebase audit finding (2026-09-29): create_duel and
-- join_open_duel_queue both refuse a blocked relationship
-- (20260928020000_block_and_report.sql), but respond_to_duel
-- (20260920060000_v3_engagement_mechanics.sql, never redefined since)
-- does not -- it only checks the duel is pending and addressed to the
-- caller. Confirmed by reading the live function body: no
-- blocked_users reference anywhere in it.
--
-- Failure scenario: A challenges B (duel created while they're still
-- unblocked, status 'pending'). B blocks A. The pending duel row is
-- untouched by block_user (which only deletes friendships), so B can
-- still open it and tap Accept -- respond_to_duel has no reason to
-- refuse, and the duel goes 'active' with mutual XP tracking between
-- two users who have an active block between them. Same "a guard exists
-- elsewhere but this one path was never extended to it" pattern this
-- codebase has already found and fixed for friend lists, leaderboards
-- and nudges -- just not previously checked for duels-in-flight.
--
-- Fix: same check, same rejection shape ('blocked'), as create_duel.
-- Declining a blocked pending duel still works unchanged (no reason to
-- block that). Everything else in the function body is identical to
-- the current live definition.
CREATE OR REPLACE FUNCTION public.respond_to_duel(_duel_id uuid, _accept boolean, _duration_days integer DEFAULT 3)
RETURNS TABLE(ok boolean, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  me uuid := auth.uid();
  d public.duels;
  my_xp integer;
  opp_xp integer;
BEGIN
  IF me IS NULL THEN
    RETURN QUERY SELECT false, 'unauthenticated';
    RETURN;
  END IF;

  SELECT * INTO d FROM public.duels WHERE id = _duel_id AND opponent_id = me AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'not-found';
    RETURN;
  END IF;

  IF NOT _accept THEN
    UPDATE public.duels SET status = 'declined' WHERE id = _duel_id;
    RETURN QUERY SELECT true, NULL::text;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.blocked_users
    WHERE (blocker = me AND blocked = d.challenger_id)
       OR (blocker = d.challenger_id AND blocked = me)
  ) THEN
    RETURN QUERY SELECT false, 'blocked';
    RETURN;
  END IF;

  SELECT xp INTO my_xp FROM public.language_progress WHERE user_id = d.opponent_id AND language = d.course;
  SELECT xp INTO opp_xp FROM public.language_progress WHERE user_id = d.challenger_id AND language = d.course;

  UPDATE public.duels SET
    status = 'active',
    opponent_xp_start = COALESCE(my_xp, 0),
    challenger_xp_start = COALESCE(opp_xp, 0),
    -- Clamped 1-14 days -- no reward is tied to duration (winner_id is
    -- bragging rights only, no XP/hearts payout), so this isn't a trust
    -- boundary, just basic product sanity against a degenerate value.
    ends_at = now() + make_interval(days => GREATEST(1, LEAST(_duration_days, 14)))
    WHERE id = _duel_id;

  RETURN QUERY SELECT true, NULL::text;
END;
$$;

REVOKE ALL ON FUNCTION public.respond_to_duel(uuid, boolean, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.respond_to_duel(uuid, boolean, integer) TO authenticated, service_role;
