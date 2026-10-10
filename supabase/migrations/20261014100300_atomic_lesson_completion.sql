-- Additive core-completion transaction. Deploy before switching web/Edge
-- callers. All callers remain responsible for validating lesson identity,
-- session token, real questions, correctness, and derived game math; only the
-- service role can execute this function. It serializes a user's completions
-- and rejects a stale read snapshot so the caller can reread/recompute/retry.
-- Companion migration: 20261014100200_atomic_review_grade.sql.

CREATE FUNCTION public.apply_lesson_completion(
  _user_id uuid,
  _course text,
  _lesson_id text,
  _level text,
  _today date,
  _expected jsonb,
  _next jsonb,
  _missed_question_ids jsonb,
  _activity_events jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _p_updated timestamptz;
  _lp_updated timestamptz;
  _comp_xp integer;
  _comp_language text;
  _day_xp integer;
  _question_id text;
  _event jsonb;
BEGIN
  IF _course NOT IN ('en', 'fr', 'es') OR _lesson_id IS NULL OR _today IS NULL
     OR jsonb_typeof(_missed_question_ids) <> 'array'
     OR jsonb_typeof(_activity_events) <> 'array' THEN
    RAISE EXCEPTION 'invalid completion transition';
  END IF;

  -- A user's concurrent completions (even in different courses) cannot
  -- both calculate totals from the same stale state and then overwrite one
  -- another. Other account-progress writers are caught by row version checks.
  PERFORM 1 FROM auth.users WHERE id = _user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'completion account no longer exists'; END IF;

  SELECT updated_at INTO _p_updated FROM public.user_progress
    WHERE user_id = _user_id FOR UPDATE;
  SELECT updated_at INTO _lp_updated FROM public.language_progress
    WHERE user_id = _user_id AND language = _course FOR UPDATE;
  SELECT xp_earned, language INTO _comp_xp, _comp_language FROM public.lesson_completions
    WHERE user_id = _user_id AND lesson_id = _lesson_id FOR UPDATE;
  SELECT xp_earned INTO _day_xp FROM public.activity_days
    WHERE user_id = _user_id AND day = _today FOR UPDATE;

  IF _comp_language IS NOT NULL AND _comp_language <> _course THEN
    RAISE EXCEPTION 'lesson id belongs to a different course';
  END IF;
  IF _p_updated IS DISTINCT FROM (_expected->>'p_updated_at')::timestamptz
     OR _lp_updated IS DISTINCT FROM (_expected->>'lp_updated_at')::timestamptz
     OR _comp_xp IS DISTINCT FROM (_expected->>'completion_xp')::integer
     OR _day_xp IS DISTINCT FROM (_expected->>'day_xp')::integer THEN
    RETURN jsonb_build_object('status', 'conflict');
  END IF;

  INSERT INTO public.user_progress
    (user_id, streak, longest_streak, last_active_date, hearts, hearts_refill_at, streak_freezes)
  VALUES (
    _user_id,
    (_next->>'streak')::integer,
    (_next->>'longest_streak')::integer,
    (_next->>'last_active_date')::date,
    (_next->>'hearts')::integer,
    (_next->>'hearts_refill_at')::timestamptz,
    (_next->>'streak_freezes')::integer
  )
  ON CONFLICT (user_id) DO UPDATE SET
    streak = EXCLUDED.streak,
    longest_streak = EXCLUDED.longest_streak,
    last_active_date = EXCLUDED.last_active_date,
    hearts = EXCLUDED.hearts,
    hearts_refill_at = EXCLUDED.hearts_refill_at,
    streak_freezes = EXCLUDED.streak_freezes;

  INSERT INTO public.language_progress (user_id, language, xp, league_tier)
  VALUES (_user_id, _course, (_next->>'xp')::integer, _next->>'league_tier')
  ON CONFLICT (user_id, language) DO UPDATE SET
    xp = EXCLUDED.xp, league_tier = EXCLUDED.league_tier;

  INSERT INTO public.lesson_completions
    (user_id, lesson_id, language, correct, total, xp_earned)
  VALUES (
    _user_id, _lesson_id, _course,
    (_next->>'best_correct')::integer,
    (_next->>'total')::integer,
    (_next->>'best_xp')::integer
  )
  ON CONFLICT (user_id, lesson_id) DO UPDATE SET
    language = EXCLUDED.language,
    correct = EXCLUDED.correct,
    total = EXCLUDED.total,
    xp_earned = EXCLUDED.xp_earned;

  INSERT INTO public.activity_days (user_id, day, xp_earned)
  VALUES (_user_id, _today, (_next->>'day_xp')::integer)
  ON CONFLICT (user_id, day) DO UPDATE SET xp_earned = EXCLUDED.xp_earned;

  FOR _question_id IN SELECT jsonb_array_elements_text(_missed_question_ids) LOOP
    INSERT INTO public.review_items
      (user_id, item_key, lesson_id, level, language, ease,
       interval_days, repetitions, due_on)
    VALUES (_user_id, _lesson_id || ':' || _question_id, _lesson_id,
            _level, _course, 2.3, 0, 0, _today)
    ON CONFLICT (user_id, item_key, language) DO UPDATE SET
      lesson_id = EXCLUDED.lesson_id, level = EXCLUDED.level,
      ease = EXCLUDED.ease, interval_days = EXCLUDED.interval_days,
      repetitions = EXCLUDED.repetitions, due_on = EXCLUDED.due_on;
  END LOOP;

  FOR _event IN SELECT value FROM jsonb_array_elements(_activity_events) LOOP
    INSERT INTO public.friend_activity_events (user_id, event_type, payload)
    VALUES (_user_id, _event->>'event_type', _event->'payload');
  END LOOP;

  RETURN jsonb_build_object('status', 'applied');
END;
$$;

REVOKE ALL ON FUNCTION public.apply_lesson_completion(uuid,text,text,text,date,jsonb,jsonb,jsonb,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_lesson_completion(uuid,text,text,text,date,jsonb,jsonb,jsonb,jsonb)
  TO service_role;

-- Rollback after reverting both callers: DROP FUNCTION public.apply_lesson_completion
-- (uuid,text,text,text,date,jsonb,jsonb,jsonb,jsonb). No existing schema is
-- modified, so old callers continue to work during a staged rollout.
