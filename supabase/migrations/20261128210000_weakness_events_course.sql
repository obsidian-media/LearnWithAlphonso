-- weakness_events carries the course it was detected in.
-- Until now an event had only a category, so a French or Spanish learner's weak-spot reads (the Hector greeting, the
-- Alphonso/Hector priming, Practice "Today's picks", the native Hector card) mixed in English grammar topics. Existing
-- rows are English: the detector was told "English lesson questions" for every course, so 'en' is the honest default.
-- New rows carry the course from the writers (lesson-miss detection and /api/analyze-weaknesses through the service
-- role, and remember_call_recap and apply_review_grade below).
--
-- Depends on 20260921000000 (weakness_events), 20261107120000 (apply_review_grade, replaced here with one added
-- column), 20261119100000 (remember_call_recap, same).
-- Rollback: restore both functions from those migrations, then DROP INDEX weakness_events_user_course_idx and
-- ALTER TABLE public.weakness_events DROP COLUMN course.
-- client-grants: none (no new table; the column inherits the table's SELECT-only client grant)
ALTER TABLE public.weakness_events
  ADD COLUMN course text NOT NULL DEFAULT 'en' CHECK (course IN ('en', 'fr', 'es'));
CREATE INDEX weakness_events_user_course_idx ON public.weakness_events (user_id, course, created_at);

CREATE OR REPLACE FUNCTION public.apply_review_grade(
  _user_id uuid,
  _item_key text,
  _language text,
  _attempt_id text,
  _expected_last_reviewed_at timestamptz,
  _expected_due_on date,
  _retired boolean,
  _correct boolean,
  _new_due_on date,
  _ease real,
  _interval_days integer,
  _repetitions integer,
  _lapses integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _row public.review_items%ROWTYPE;
  _previous jsonb;
  _previous_item_key text;
  _previous_language text;
  _result jsonb;
BEGIN
  PERFORM 1 FROM auth.users WHERE id = _user_id FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'review account no longer exists';
  END IF;

  IF _attempt_id IS NOT NULL THEN
    SELECT result, item_key, language INTO _previous, _previous_item_key, _previous_language
      FROM public.review_grade_attempts
      WHERE user_id = _user_id AND attempt_id = _attempt_id;
    IF FOUND THEN
      IF _previous_item_key <> _item_key OR _previous_language <> _language THEN
        RAISE EXCEPTION 'review attempt identity collision';
      END IF;
      RETURN _previous;
    END IF;
  END IF;

  SELECT * INTO _row FROM public.review_items
    WHERE user_id = _user_id AND item_key = _item_key AND language = _language
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'missing');
  END IF;
  IF _row.due_on > (now() AT TIME ZONE 'utc')::date THEN
    RETURN jsonb_build_object('status', 'not_due');
  END IF;
  IF _row.last_reviewed_at IS DISTINCT FROM _expected_last_reviewed_at
     OR _row.due_on IS DISTINCT FROM _expected_due_on THEN
    RETURN jsonb_build_object('status', 'conflict');
  END IF;

  IF _retired THEN
    -- Keep a mastered saved word counted: the review row goes, the marker stays.
    IF _row.source = 'saved_word' THEN
      INSERT INTO public.mastered_words (user_id, language, item_key)
        VALUES (_user_id, _row.language, _row.item_key)
        ON CONFLICT (user_id, language, item_key) DO NOTHING;
    END IF;
    DELETE FROM public.review_items WHERE id = _row.id;
    IF _row.source = 'weakness' AND _row.weakness_label IS NOT NULL THEN
      INSERT INTO public.weakness_events (user_id, category, event_type, course)
        VALUES (_user_id, _row.weakness_label, 'resolved', _row.language);
    END IF;
  ELSE
    UPDATE public.review_items SET
      ease = _ease,
      interval_days = _interval_days,
      repetitions = _repetitions,
      lapses = _lapses,
      due_on = _new_due_on,
      last_reviewed_at = now()
    WHERE id = _row.id;
  END IF;

  _result := jsonb_build_object(
    'status', 'applied', 'retired', _retired,
    'dueOn', _new_due_on, 'correct', _correct
  );
  IF _attempt_id IS NOT NULL THEN
    INSERT INTO public.review_grade_attempts
      (user_id, attempt_id, item_key, language, result)
      VALUES (_user_id, _attempt_id, _item_key, _language, _result);
  END IF;
  RETURN _result;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_review_grade(uuid,text,text,text,timestamptz,date,boolean,boolean,date,real,integer,integer,integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_review_grade(uuid,text,text,text,timestamptz,date,boolean,boolean,date,real,integer,integer,integer)
  TO service_role;

CREATE OR REPLACE FUNCTION public.remember_call_recap(
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
    INSERT INTO public.weakness_events (user_id, category, event_type, course) VALUES (_user_id, t, 'detected', _course);
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
