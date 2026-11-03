-- Pro learners' Hector turns get their own daily allowance ('hector'), separate
-- from the free 'chat' quota that Practice uses, so practising never blocks the
-- feature a learner pays for (web Hector + Pro design, decision 8, 2026-11-02).
-- Still capped to bound AI cost; 150/day, confirmed by the owner on 2026-11-03.
--
-- CREATE OR REPLACE replaces the whole function, so every existing limit is
-- repeated verbatim from 20261005120000_saved_word_review_items.sql.
-- /api/hector-respond only reaches this after the Pro entitlement check, so a
-- learner without Pro never spends it.

CREATE OR REPLACE FUNCTION public.consume_ai_quota(_kind text)
RETURNS TABLE(allowed boolean, used integer, quota integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  me uuid := auth.uid();
  new_count integer;
  daily_limit integer;
BEGIN
  daily_limit := CASE _kind
    WHEN 'chat' THEN 60
    WHEN 'stt' THEN 300
    WHEN 'tts' THEN 80
    WHEN 'translate' THEN 60
    WHEN 'define' THEN 40
    WHEN 'hector' THEN 150
    ELSE NULL
  END;

  IF me IS NULL OR daily_limit IS NULL THEN
    RETURN QUERY SELECT false, 0, COALESCE(daily_limit, 0);
    RETURN;
  END IF;

  INSERT INTO public.ai_usage (user_id, day, kind, count)
  VALUES (me, current_date, _kind, 1)
  ON CONFLICT (user_id, day, kind) DO UPDATE
    SET count = public.ai_usage.count + 1, updated_at = now()
  RETURNING public.ai_usage.count INTO new_count;

  IF new_count > daily_limit THEN
    RETURN QUERY SELECT false, new_count, daily_limit;
  ELSE
    RETURN QUERY SELECT true, new_count, daily_limit;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_ai_quota(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.consume_ai_quota(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.consume_ai_rate_limit(_kind text)
RETURNS TABLE(allowed boolean, count integer, per_minute_limit integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  me uuid := auth.uid();
  bucket timestamptz := date_trunc('minute', now());
  new_count integer;
  minute_limit integer;
BEGIN
  minute_limit := CASE _kind
    WHEN 'chat' THEN 10
    WHEN 'stt' THEN 10
    WHEN 'tts' THEN 15
    WHEN 'translate' THEN 10
    WHEN 'define' THEN 10
    WHEN 'hector' THEN 10
    ELSE NULL
  END;

  IF me IS NULL OR minute_limit IS NULL THEN
    RETURN QUERY SELECT false, 0, COALESCE(minute_limit, 0);
    RETURN;
  END IF;

  -- Opportunistically drop this user's stale buckets so the table stays
  -- small; indexed by (user_id, kind, minute_bucket) so this is cheap.
  DELETE FROM public.ai_rate_limits
    WHERE user_id = me AND minute_bucket < bucket - interval '5 minutes';

  INSERT INTO public.ai_rate_limits (user_id, kind, minute_bucket, count)
  VALUES (me, _kind, bucket, 1)
  ON CONFLICT (user_id, kind, minute_bucket) DO UPDATE
    SET count = public.ai_rate_limits.count + 1, updated_at = now()
  RETURNING public.ai_rate_limits.count INTO new_count;

  IF new_count > minute_limit THEN
    RETURN QUERY SELECT false, new_count, minute_limit;
  ELSE
    RETURN QUERY SELECT true, new_count, minute_limit;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_ai_rate_limit(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.consume_ai_rate_limit(text) TO authenticated, service_role;
