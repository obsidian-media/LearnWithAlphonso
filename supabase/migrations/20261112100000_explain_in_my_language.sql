-- "Explain in my language" (BACKLOG 0.0-bc): a short WHY in the learner's own language, on tap.
--
-- 1. The 'explain' AI quota kind: its own 40 a day (and 10 a minute) so explanations never eat the conversation turns
--    a learner pays for. CREATE OR REPLACE replaces the whole function, so every other limit is restated verbatim from
--    20261104100000_stt_daily_limit_120.sql (daily) and 20261102120000_hector_quota_kind.sql (per minute).
--    src/lib/ai-quota.server.ts DAILY_LIMITS must agree (ai-quota.server.test.ts compares them).
-- 2. public.explanation_cache: one generated explanation per (kind, course, native language, item), so the second
--    learner to ask for the same item costs nothing. The key is a SHA-256 of the item, never the learner's text.
--    Server only: RLS on, no policy, no client grant; /api/explain reads and writes it with the service role.
--
-- Rollback: DROP TABLE public.explanation_cache; then re-run the two functions from the migrations named above.

-- client-grants: none public.explanation_cache
CREATE TABLE public.explanation_cache (
  cache_key text PRIMARY KEY CHECK (cache_key ~ '^[0-9a-f]{64}$'),
  kind text NOT NULL CHECK (kind IN ('wrong-answer', 'word', 'message')),
  course text NOT NULL CHECK (course IN ('en', 'fr', 'es')),
  native_language text NOT NULL CHECK (native_language ~ '^[a-z]{2,3}$'),
  explanation text NOT NULL CHECK (char_length(explanation) BETWEEN 1 AND 2800),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.explanation_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.explanation_cache FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.explanation_cache TO service_role;

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
    WHEN 'explain' THEN 40
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
    WHEN 'explain' THEN 10
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
