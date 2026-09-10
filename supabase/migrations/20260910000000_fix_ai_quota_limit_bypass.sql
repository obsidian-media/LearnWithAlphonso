-- Fixes a bypass: consume_ai_quota previously took a caller-supplied
-- `_limit`, and since it's GRANTed EXECUTE to `authenticated`, any
-- signed-in user could call it directly with an inflated limit and
-- evade the app's intended daily AI-usage caps. Limits are now hardcoded
-- server-side, keyed by `_kind`, and the function no longer accepts a
-- limit argument at all.

DROP FUNCTION IF EXISTS public.consume_ai_quota(text, integer);

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
