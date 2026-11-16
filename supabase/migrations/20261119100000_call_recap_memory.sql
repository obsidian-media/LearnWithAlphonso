-- Call recap and "What Alphonso remembers".
--
-- 1. practice_calls.recap_at: one recap per call. claim_call_recap sets it atomically (finished, own, not yet claimed),
--    so reopening a result or a second device cannot bill a second AI call.
-- 2. The 'recap' AI quota kind: 30 a day and 5 a minute, its own budget so a recap never spends the conversation turns
--    (chat) a learner practises with. CREATE OR REPLACE replaces the whole function, so both bodies are restated
--    verbatim from 20261117100100_support_quota_kind.sql with one added WHEN each. src/lib/ai-quota.server.ts
--    DAILY_LIMITS must agree (ai-quota.server.test.ts compares them).
-- 3. tutor_memory: what Alphonso remembers about a PRO learner. Written only by the server (the recap and "Review
--    these"), read and deleted by its owner. Mistake lines are one row per learner, course and topic with a count of
--    calls; phrase lines are the recap phrases the learner added to review. No call transcript is stored here.
-- 4. Three server-only functions: remember_call_recap, remember_recap_phrase, and the two delete paths
--    delete_tutor_memory_line / forget_tutor_memory. The delete paths also remove the matching weakness_events (which had
--    no delete path until now) and the matching review items, in one transaction. They never touch lessons, stars,
--    streak, XP or the learner's own saved words.
--
-- Depends on practice_calls (20261107032021), review_items (20261112140000), weakness_events (20260921000000), ai_usage
-- and ai_rate_limits. Version 20261119100000 is after ai_cost_log (20261118200000), the newest migration on main.
--
-- Rollback (one transaction): re-run both quota functions from 20261117100100_support_quota_kind.sql, then
--   DROP FUNCTION public.forget_tutor_memory(uuid), public.delete_tutor_memory_line(uuid, uuid),
--     public.remember_recap_phrase(uuid, text, uuid, text, text, text), public.remember_call_recap(uuid, text, uuid, text[], jsonb, boolean),
--     public.claim_call_recap(uuid, uuid);
--   DROP TABLE public.tutor_memory; ALTER TABLE public.practice_calls DROP COLUMN recap_at;

ALTER TABLE public.practice_calls ADD COLUMN recap_at timestamptz;

CREATE FUNCTION public.claim_call_recap(_user_id uuid, _call_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  n integer;
BEGIN
  UPDATE public.practice_calls
    SET recap_at = now()
    WHERE id = _call_id AND user_id = _user_id AND finished_at IS NOT NULL AND recap_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n = 1;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_call_recap(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_call_recap(uuid, uuid) TO service_role;

CREATE TABLE public.tutor_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course text NOT NULL CHECK (course IN ('en', 'fr', 'es')),
  kind text NOT NULL CHECK (kind IN ('mistake', 'phrase')),
  -- A mistake's topic slug, or a phrase's lower-cased text: one line per learner, course, kind and key.
  memory_key text NOT NULL CHECK (char_length(memory_key) BETWEEN 1 AND 80),
  text text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 140),
  -- A phrase's meaning; null for a mistake.
  detail text CHECK (detail IS NULL OR char_length(detail) <= 140),
  -- The review item a phrase was added as, so deleting the line removes it too.
  review_key text CHECK (review_key IS NULL OR char_length(review_key) <= 120),
  call_id uuid,
  seen_count integer NOT NULL DEFAULT 1 CHECK (seen_count >= 1),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, course, kind, memory_key)
);
CREATE INDEX tutor_memory_user_idx ON public.tutor_memory (user_id, last_seen_at DESC);
ALTER TABLE public.tutor_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY tutor_memory_select_own ON public.tutor_memory
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY tutor_memory_delete_own ON public.tutor_memory
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);
REVOKE ALL ON public.tutor_memory FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.tutor_memory TO authenticated;
GRANT ALL ON public.tutor_memory TO service_role;

-- Records one recap: a 'detected' weakness event per topic (what native already did through analyze-weaknesses) and,
-- when _save is true (Pro learners only: the server decides), one memory line per mistake topic. Returns the number of
-- memory lines written. At most 200 lines per learner: a new key beyond that is dropped, existing keys still update.
CREATE FUNCTION public.remember_call_recap(
  _user_id uuid,
  _course text,
  _call_id uuid,
  _topics text[],
  _mistakes jsonb,
  _save boolean
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  t text;
  m jsonb;
  saved integer := 0;
  total integer;
  existing boolean;
BEGIN
  IF _user_id IS NULL OR _course IS NULL OR _call_id IS NULL THEN
    RAISE EXCEPTION 'remember_call_recap: missing argument' USING ERRCODE = '22023';
  END IF;
  FOREACH t IN ARRAY COALESCE(_topics, ARRAY[]::text[]) LOOP
    INSERT INTO public.weakness_events (user_id, category, event_type) VALUES (_user_id, t, 'detected');
  END LOOP;
  IF NOT COALESCE(_save, false) THEN
    RETURN 0;
  END IF;
  FOR m IN SELECT * FROM jsonb_array_elements(COALESCE(_mistakes, '[]'::jsonb)) LOOP
    SELECT count(*) INTO total FROM public.tutor_memory WHERE user_id = _user_id;
    SELECT EXISTS (
      SELECT 1 FROM public.tutor_memory
      WHERE user_id = _user_id AND course = _course AND kind = 'mistake' AND memory_key = m->>'topic'
    ) INTO existing;
    IF total >= 200 AND NOT existing THEN
      CONTINUE;
    END IF;
    INSERT INTO public.tutor_memory AS tm (user_id, course, kind, memory_key, text, call_id)
    VALUES (_user_id, _course, 'mistake', m->>'topic', left(m->>'text', 140), _call_id)
    ON CONFLICT (user_id, course, kind, memory_key) DO UPDATE
      SET text = EXCLUDED.text,
          seen_count = CASE WHEN tm.call_id IS DISTINCT FROM EXCLUDED.call_id THEN tm.seen_count + 1 ELSE tm.seen_count END,
          call_id = EXCLUDED.call_id,
          last_seen_at = now();
    saved := saved + 1;
  END LOOP;
  RETURN saved;
END;
$$;
REVOKE ALL ON FUNCTION public.remember_call_recap(uuid, text, uuid, text[], jsonb, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.remember_call_recap(uuid, text, uuid, text[], jsonb, boolean) TO service_role;

-- A phrase the Pro learner added to review from a recap. Idempotent per learner, course and phrase.
CREATE FUNCTION public.remember_recap_phrase(
  _user_id uuid,
  _course text,
  _call_id uuid,
  _text text,
  _meaning text,
  _review_key text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  total integer;
BEGIN
  IF _user_id IS NULL OR _course IS NULL OR _text IS NULL OR char_length(btrim(_text)) = 0 THEN
    RAISE EXCEPTION 'remember_recap_phrase: missing argument' USING ERRCODE = '22023';
  END IF;
  SELECT count(*) INTO total FROM public.tutor_memory WHERE user_id = _user_id;
  IF total >= 200 THEN
    RETURN false;
  END IF;
  INSERT INTO public.tutor_memory (user_id, course, kind, memory_key, text, detail, review_key, call_id)
  VALUES (_user_id, _course, 'phrase', left(lower(btrim(_text)), 80), left(_text, 140), left(_meaning, 140), _review_key, _call_id)
  ON CONFLICT (user_id, course, kind, memory_key) DO NOTHING;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.remember_recap_phrase(uuid, text, uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.remember_recap_phrase(uuid, text, uuid, text, text, text) TO service_role;

-- Removes one memory line and what hangs off it. A mistake: its weakness_events and its open weakness review items. A
-- phrase: its review item. Returns {memory, events, review} counts; all zeros when the line is not this user's.
CREATE FUNCTION public.delete_tutor_memory_line(_user_id uuid, _id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r public.tutor_memory%ROWTYPE;
  ev integer := 0;
  rv integer := 0;
BEGIN
  SELECT * INTO r FROM public.tutor_memory WHERE id = _id AND user_id = _user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('memory', 0, 'events', 0, 'review', 0);
  END IF;
  IF r.kind = 'mistake' THEN
    DELETE FROM public.weakness_events WHERE user_id = _user_id AND category = r.memory_key;
    GET DIAGNOSTICS ev = ROW_COUNT;
    DELETE FROM public.review_items
      WHERE user_id = _user_id AND source = 'weakness' AND weakness_label = r.memory_key AND language = r.course;
    GET DIAGNOSTICS rv = ROW_COUNT;
  ELSIF r.review_key IS NOT NULL THEN
    DELETE FROM public.review_items
      WHERE user_id = _user_id AND source = 'saved_word' AND item_key = r.review_key AND language = r.course;
    GET DIAGNOSTICS rv = ROW_COUNT;
  END IF;
  DELETE FROM public.tutor_memory WHERE id = _id AND user_id = _user_id;
  RETURN jsonb_build_object('memory', 1, 'events', ev, 'review', rv);
END;
$$;
REVOKE ALL ON FUNCTION public.delete_tutor_memory_line(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_tutor_memory_line(uuid, uuid) TO service_role;

-- Forget everything, in one transaction: every memory line, every weakness event, every weakness review item and every
-- review item a recap added. Lessons, stars, streak, XP and the learner's own saved words stay.
CREATE FUNCTION public.forget_tutor_memory(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  mem integer;
  ev integer;
  rv integer;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'forget_tutor_memory: missing user' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.tutor_memory WHERE user_id = _user_id;
  GET DIAGNOSTICS mem = ROW_COUNT;
  DELETE FROM public.weakness_events WHERE user_id = _user_id;
  GET DIAGNOSTICS ev = ROW_COUNT;
  DELETE FROM public.review_items
    WHERE user_id = _user_id AND (source = 'weakness' OR (source = 'saved_word' AND item_key LIKE 'recap:%'));
  GET DIAGNOSTICS rv = ROW_COUNT;
  RETURN jsonb_build_object('memory', mem, 'events', ev, 'review', rv);
END;
$$;
REVOKE ALL ON FUNCTION public.forget_tutor_memory(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.forget_tutor_memory(uuid) TO service_role;

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
    WHEN 'support' THEN 30
    WHEN 'recap' THEN 30
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
    WHEN 'support' THEN 5
    WHEN 'recap' THEN 5
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
