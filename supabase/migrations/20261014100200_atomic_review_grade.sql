-- Additive, backwards-compatible review transition. Deploy this migration before
-- switching either the web server or Edge Function to the RPC. Old clients keep
-- using the existing grade-review endpoint; the endpoint owns the transition.
-- A single function call makes review retirement and its weakness resolution
-- event indivisible. A stable native queue identity is recorded with the result
-- so a lost HTTP response can be replayed without grading twice.

CREATE TABLE public.review_grade_attempts (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  attempt_id text NOT NULL CHECK (char_length(attempt_id) BETWEEN 1 AND 200),
  item_key text NOT NULL,
  language text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, attempt_id)
);

CREATE INDEX review_grade_attempts_created_idx
  ON public.review_grade_attempts (created_at);

ALTER TABLE public.review_grade_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY review_grade_attempts_select_own ON public.review_grade_attempts
  FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);
REVOKE ALL ON public.review_grade_attempts FROM PUBLIC, anon;
GRANT SELECT ON public.review_grade_attempts TO authenticated;
GRANT ALL ON public.review_grade_attempts TO service_role;

CREATE FUNCTION public.apply_review_grade(
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
  -- All attempts for one account are serialized, including a retry racing
  -- the first attempt's commit. auth.users exists for any live account.
  PERFORM 1 FROM auth.users WHERE id = _user_id FOR UPDATE;
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
  IF _row.due_on > current_date THEN
    RETURN jsonb_build_object('status', 'not_due');
  END IF;
  IF _row.last_reviewed_at IS DISTINCT FROM _expected_last_reviewed_at
     OR _row.due_on IS DISTINCT FROM _expected_due_on THEN
    RETURN jsonb_build_object('status', 'conflict');
  END IF;

  IF _retired THEN
    DELETE FROM public.review_items WHERE id = _row.id;
    IF _row.source = 'weakness' AND _row.weakness_label IS NOT NULL THEN
      INSERT INTO public.weakness_events (user_id, category, event_type)
        VALUES (_user_id, _row.weakness_label, 'resolved');
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

-- Rollback after reverting both callers: DROP FUNCTION public.apply_review_grade(...);
-- DROP TABLE public.review_grade_attempts; do not drop while any queued client
-- attempt may still be retried. No existing table or policy is changed here.
