-- V5 phase 4: teach the two quota functions about the 'translate' kind.
--
-- Without this the feature is silently half-dead in production. Both functions
-- resolve their limit with `CASE _kind WHEN 'chat'/'stt'/'tts' ... ELSE NULL`
-- and then refuse the call when the limit is NULL, so every translate request
-- came back `allowed = false`. /api/grade-translation treats a refused quota as
-- "no AI opinion" and keeps the local verdict -- by design, so nothing errors
-- and nothing logs -- which means the curated wordings quietly became the
-- ENTIRE grading rule on the lesson path, while web review (which has no quota
-- check) went on asking the AI. Same answer, two verdicts, same account.
--
-- Adding the kind to src/lib/ai-quota.server.ts's DAILY_LIMITS was not enough
-- and never could be: that constant is documentation of what these functions
-- do. ai-quota.server.ts's own header says so ("the real cap is enforced
-- inside consume_ai_quota ... Keep these in sync"), and this is what happens
-- when only one side moves.
--
-- Limits match the existing kinds' shape: 60/day like chat and stt, 10/minute
-- like chat and stt. A translate call only happens when a learner writes
-- something the curated list did not anticipate, so this is generous in
-- practice.

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
    WHEN 'stt' THEN 60
    WHEN 'tts' THEN 80
    WHEN 'translate' THEN 60
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
