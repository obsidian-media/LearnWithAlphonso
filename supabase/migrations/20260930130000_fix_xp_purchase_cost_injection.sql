-- Third-party pre-submission audit (2026-09-30, ChatGPT/Astra): CRITICAL.
-- buy_heart_with_xp(_course, _cost) and buy_streak_freeze_with_xp
-- (_course, _cost) both accept a caller-controlled `_cost` as a real
-- PostgREST RPC parameter (only the web/iOS clients' own good behavior
-- ever passed the intended fixed value -- nothing server-side enforced
-- it). Both check `cur_xp < _cost` then write `cur_xp - _cost`. Any
-- authenticated user calling either RPC directly with a NEGATIVE _cost
-- (e.g. -100000) passes the "insufficient XP" check trivially (cur_xp is
-- always >= 0, so it's never less than a negative number), and the
-- subtraction then INCREASES xp by the magnitude of _cost. Repeatable
-- for unlimited XP and unlimited streak freezes -- affects leaderboards,
-- teams, duels, achievements and the review-clear/league-promotion
-- logic that reads xp. Confirmed live: called with a negative _cost
-- directly (not through the app) actually did mint XP.
--
-- Fix: the cost is no longer a caller-supplied parameter at all -- both
-- functions now hardcode the same fixed values the web/iOS clients were
-- already passing (50 XP for a heart, matching
-- HeartsEconomy.xpHeartCost/XP_HEART_COST; 75 for a streak freeze,
-- matching XP_STREAK_FREEZE_COST), so there is nothing left for a caller
-- to inject. This changes both functions' signatures (removing a
-- parameter), which CREATE OR REPLACE cannot do -- a DROP/CREATE pair is
-- required, and a drop loses grants, so they're re-applied below. Web's
-- two callers (sync.functions.ts) are updated in the same commit to stop
-- passing `_cost` at all; iOS already never did.
DROP FUNCTION IF EXISTS public.buy_heart_with_xp(text, integer);

CREATE FUNCTION public.buy_heart_with_xp(_course text)
RETURNS TABLE(ok boolean, reason text, hearts integer, xp integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  me uuid := auth.uid();
  cur_hearts integer;
  cur_refill timestamptz;
  cur_xp integer;
  cost constant integer := 50;
BEGIN
  IF me IS NULL THEN
    RETURN QUERY SELECT false, 'unauthenticated', NULL::integer, NULL::integer;
    RETURN;
  END IF;

  SELECT up.hearts, up.hearts_refill_at INTO cur_hearts, cur_refill
    FROM public.user_progress up WHERE up.user_id = me FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.user_progress (user_id) VALUES (me)
      ON CONFLICT (user_id) DO NOTHING;
    cur_hearts := 5;
    cur_refill := NULL;
  END IF;

  IF cur_refill IS NOT NULL AND now() >= cur_refill THEN
    cur_hearts := 5;
    cur_refill := NULL;
  END IF;

  IF cur_hearts >= 5 THEN
    RETURN QUERY SELECT false, 'hearts-full', cur_hearts, NULL::integer;
    RETURN;
  END IF;

  SELECT lp.xp INTO cur_xp FROM public.language_progress lp
    WHERE lp.user_id = me AND lp.language = _course FOR UPDATE;
  IF NOT FOUND OR cur_xp IS NULL THEN
    cur_xp := 0;
  END IF;

  IF cur_xp < cost THEN
    RETURN QUERY SELECT false, 'insufficient-xp', cur_hearts, cur_xp;
    RETURN;
  END IF;

  UPDATE public.user_progress SET hearts = cur_hearts + 1, hearts_refill_at = NULL
    WHERE user_id = me;
  UPDATE public.language_progress SET xp = cur_xp - cost
    WHERE user_id = me AND language = _course;

  RETURN QUERY SELECT true, NULL::text, cur_hearts + 1, cur_xp - cost;
END;
$$;

REVOKE ALL ON FUNCTION public.buy_heart_with_xp(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.buy_heart_with_xp(text) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.buy_streak_freeze_with_xp(text, integer);

CREATE FUNCTION public.buy_streak_freeze_with_xp(_course text)
RETURNS TABLE(ok boolean, reason text, streak_freezes integer, xp integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  me uuid := auth.uid();
  cur_freezes integer;
  cur_xp integer;
  cost constant integer := 75;
BEGIN
  IF me IS NULL THEN
    RETURN QUERY SELECT false, 'unauthenticated', NULL::integer, NULL::integer;
    RETURN;
  END IF;

  SELECT up.streak_freezes INTO cur_freezes
    FROM public.user_progress up WHERE up.user_id = me FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.user_progress (user_id) VALUES (me)
      ON CONFLICT (user_id) DO NOTHING;
    cur_freezes := 0;
  END IF;

  SELECT lp.xp INTO cur_xp FROM public.language_progress lp
    WHERE lp.user_id = me AND lp.language = _course FOR UPDATE;
  IF NOT FOUND OR cur_xp IS NULL THEN
    cur_xp := 0;
  END IF;

  IF cur_xp < cost THEN
    RETURN QUERY SELECT false, 'insufficient-xp', cur_freezes, cur_xp;
    RETURN;
  END IF;

  UPDATE public.user_progress SET streak_freezes = cur_freezes + 1
    WHERE user_id = me;
  UPDATE public.language_progress SET xp = cur_xp - cost
    WHERE user_id = me AND language = _course;

  RETURN QUERY SELECT true, NULL::text, cur_freezes + 1, cur_xp - cost;
END;
$$;

REVOKE ALL ON FUNCTION public.buy_streak_freeze_with_xp(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.buy_streak_freeze_with_xp(text) TO authenticated, service_role;
