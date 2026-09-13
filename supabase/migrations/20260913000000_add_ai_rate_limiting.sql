-- Per-minute rate limiting for the AI routes, on top of the existing daily
-- ai_usage quota. consume_ai_quota caps total daily spend but does nothing
-- to stop a burst of requests in a short window (real NVIDIA/Deepgram
-- cost per call, and no other throttle exists in front of these routes).
-- A DB-backed counter is used rather than an in-memory limiter because the
-- app runs on serverless functions with no shared process state across
-- invocations -- same reasoning as ai_usage/consume_ai_quota.

CREATE TABLE IF NOT EXISTS public.ai_rate_limits (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  minute_bucket timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind, minute_bucket)
);

GRANT SELECT ON public.ai_rate_limits TO authenticated;
GRANT ALL ON public.ai_rate_limits TO service_role;

ALTER TABLE public.ai_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_rate_limits_select_own" ON public.ai_rate_limits
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

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

CREATE TRIGGER touch_ai_rate_limits_updated
  BEFORE UPDATE ON public.ai_rate_limits
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
