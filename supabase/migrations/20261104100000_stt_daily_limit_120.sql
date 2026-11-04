-- Voice (speech-to-text) daily allowance: 300 -> 120 (owner decision, 2026-11-04).
-- 300 was a temporary debugging allowance (20260930050000) for the "Empty or missing audio" hunt. The
-- per-minute limit (10) is unchanged. CREATE OR REPLACE replaces the whole function, so every other limit is
-- restated verbatim from 20261102120000_hector_quota_kind.sql. src/lib/ai-quota.server.ts DAILY_LIMITS.stt must agree
-- (src/lib/ai-quota.server.test.ts compares them).
--
-- Rollback: re-run 20261102120000's consume_ai_quota (WHEN 'stt' THEN 300).

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
    WHEN 'stt' THEN 120
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

