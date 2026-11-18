-- The AI spend circuit breaker: one function, no table, column or grant change on any table.
--
--   trip_ai_spend_breaker(p_limit_micro)   service role only. Adds up TODAY's (UTC) estimated AI spend over every
--                                          learner (ai_cost_union, 20261118200000) in micro-dollars. When it has reached
--                                          p_limit_micro AND the 'ai' switch is on, it turns that switch off in one
--                                          UPDATE and says so ({"tripped": true, ...}); otherwise it changes nothing
--                                          ({"tripped": false, ...}). Because the flip is the UPDATE itself, concurrent
--                                          callers cannot both see a trip, so the owner is emailed once per trip.
--
-- The limit is a setting of the web server (AI_SPEND_BREAKER_DAILY_USD, src/lib/ai-cost-config.ts), called from the
-- 15-minute maintenance sweep (src/lib/ai-cost-sweep.server.ts). Nothing turns the switch back on: the owner does,
-- with  UPDATE public.app_switches SET enabled = true, note = NULL, updated_at = now() WHERE key = 'ai';
-- (docs/operations.md, "AI spend circuit breaker").
--
-- Depends on app_switches (20261015100000) and ai_cost_union (20261118200000). Version 20261125130000 follows
-- 20261123140000 (staff rate limits) in the same workstream and is after both dependencies.
--
-- Rollback: DROP FUNCTION public.trip_ai_spend_breaker(bigint);

CREATE FUNCTION public.trip_ai_spend_breaker(p_limit_micro bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  today date := (now() AT TIME ZONE 'UTC')::date;
  total bigint;
  flipped integer;
BEGIN
  IF p_limit_micro IS NULL OR p_limit_micro < 1 THEN
    RAISE EXCEPTION 'trip_ai_spend_breaker: a positive limit is required' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(sum(u.u_micro), 0)::bigint INTO total
  FROM public.ai_cost_union(today) u
  WHERE u.u_day = today;

  IF total < p_limit_micro THEN
    RETURN jsonb_build_object('tripped', false, 'totalMicro', total);
  END IF;

  UPDATE public.app_switches
     SET enabled = false,
         note = 'Switched off by the daily AI spend breaker on ' || today::text,
         updated_at = now()
   WHERE key = 'ai' AND enabled = true;
  GET DIAGNOSTICS flipped = ROW_COUNT;

  RETURN jsonb_build_object('tripped', flipped > 0, 'totalMicro', total);
END
$$;
REVOKE ALL ON FUNCTION public.trip_ai_spend_breaker(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trip_ai_spend_breaker(bigint) TO service_role;
