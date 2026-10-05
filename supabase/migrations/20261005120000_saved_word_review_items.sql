-- Save-any-word, phase 1 (docs/superpowers/specs/2026-10-05-save-any-word-design.md).
--
-- 1. A third review_items source, 'saved_word': a self-contained row like the
--    'weakness' ones (own prompt/choices/answer/explanation) plus the saved word
--    and the sentence it came from.
-- 2. The 'define' AI quota kind. consume_ai_quota and consume_ai_rate_limit
--    REFUSE any kind they do not list (the silent failure 20260926020000
--    documents for 'translate'), so adding the kind to ai-quota.server.ts alone
--    would leave the feature dead. Both are replaced below.
--
-- CREATE OR REPLACE replaces the whole function, so every existing limit is
-- restated exactly as it is LIVE (verified against pg_proc on 2026-10-05):
-- consume_ai_quota is chat 60 / stt 300 / tts 80 / translate 60 (stt was raised
-- to 300 by 20260930050000_raise_stt_daily_limit.sql, NOT the 60 the translate
-- migration still shows); consume_ai_rate_limit is 10 / 10 / 15 / 10.

ALTER TABLE public.review_items DROP CONSTRAINT IF EXISTS weakness_shape_matches_source;
ALTER TABLE public.review_items DROP CONSTRAINT IF EXISTS review_items_source_check;

ALTER TABLE public.review_items
  ADD COLUMN saved_word text,
  ADD COLUMN saved_context text;

ALTER TABLE public.review_items
  ADD CONSTRAINT review_items_source_check
  CHECK (source IN ('lesson', 'weakness', 'saved_word'));

-- Name kept from the weakness migration so nothing referring to it breaks;
-- it now describes the shape of every non-lesson source.
ALTER TABLE public.review_items
  ADD CONSTRAINT weakness_shape_matches_source CHECK (
    (source = 'lesson') OR
    (source = 'weakness' AND weakness_label IS NOT NULL AND weakness_display IS NOT NULL
       AND prompt IS NOT NULL AND choices IS NOT NULL AND answer_index IS NOT NULL) OR
    (source = 'saved_word' AND saved_word IS NOT NULL AND saved_context IS NOT NULL
       AND prompt IS NOT NULL AND choices IS NOT NULL AND answer_index IS NOT NULL
       AND explanation IS NOT NULL)
  );

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
