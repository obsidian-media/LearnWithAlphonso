-- The learner's own time zone, written by the apps (owner decision 2026-11-18: learner days follow local time).
--
-- Since 20261114100000 the server books streaks, daily goals, reminders and the widget from learner_time_zones, but only
-- the service-role set_learner_time_zone() could write it and no client ever called it, so every learner stayed on UTC.
-- This adds the one door the native apps need (the web keeps its server function, which calls the same writer):
--
--   set_my_time_zone(_time_zone)   the signed-in learner records their own IANA zone (auth.uid(); no user id argument).
--   set_learner_time_zone          unchanged contract, but an unchanged zone no longer touches the row (no write, no
--                                  updated_at bump), so a client that re-sends on every launch is free.
--
-- A zone the database does not know is rejected (22023) by the writer, exactly as before. The AI quota day is NOT
-- affected: consume_ai_quota keys on current_date (UTC). The streak is NOT touched here: day_basis stays 'utc' until the
-- learner's next completion, which applies the one-time bridge (bridgeUtcDay) and writes 'local'.
--
-- Depends on 20261107120000 (learner_time_zones, set_learner_time_zone).
--
-- Rollback: DROP FUNCTION public.set_my_time_zone(text); restore set_learner_time_zone from 20261107120000.

CREATE OR REPLACE FUNCTION public.set_learner_time_zone(_user_id uuid, _time_zone text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF _user_id IS NULL OR _time_zone IS NULL OR char_length(_time_zone) > 64
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names n WHERE n.name = _time_zone) THEN
    RAISE EXCEPTION 'set_learner_time_zone: not a known time zone' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.learner_time_zones AS t (user_id, time_zone)
  VALUES (_user_id, _time_zone)
  ON CONFLICT (user_id) DO UPDATE SET time_zone = EXCLUDED.time_zone, updated_at = now()
    WHERE t.time_zone IS DISTINCT FROM EXCLUDED.time_zone;
  RETURN _time_zone;
END;
$$;
REVOKE ALL ON FUNCTION public.set_learner_time_zone(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_learner_time_zone(uuid, text) TO service_role;

CREATE FUNCTION public.set_my_time_zone(_time_zone text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'set_my_time_zone: sign in first' USING ERRCODE = '42501';
  END IF;
  RETURN public.set_learner_time_zone(uid, _time_zone);
END;
$$;
REVOKE ALL ON FUNCTION public.set_my_time_zone(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_time_zone(text) TO authenticated, service_role;
