-- Requested live 2026-09-28: the account owner is actively debugging the
-- still-unsolved "Empty or missing audio" bug (see api/stt.ts's own
-- diagnostic comments), which needs several real Hector attempts in a
-- row to reproduce and confirm. The 60/day STT cap was hit mid-session
-- from repeated retries of a genuinely-failing feature, not real usage,
-- and blocked further testing outright.
--
-- Raises STT only (chat/tts/translate unchanged) from 60/day to 300/day.
-- Keep src/lib/ai-quota.server.ts's DAILY_LIMITS.stt in sync -- see that
-- file's own header, and 20260926020000_translate_quota_kind.sql's
-- comment for what happens when only one side moves.

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
