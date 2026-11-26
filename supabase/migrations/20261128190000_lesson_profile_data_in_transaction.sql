-- Book a lesson's learning time and skill results INSIDE the completion's transaction.
--
-- learning_days and skill_days were written by two SEPARATE calls (add_learning_seconds, add_skill_results) made after
-- apply_lesson_completion, with every failure swallowed so a lesson would never fail. Prod audit 2026-11-26: 2 of 6
-- lesson-days had no learning_days or skill_days row.
--
-- apply_lesson_completion now reads an optional `profile` object from `_next`:
--     { "lesson_seconds": 0..3600, "skills": [ { "skill": "...", "right": n, "total": n }, ... ] }
-- and books both in the same transaction as the lesson. Same signature as 20261114100000 (so nothing that calls it, or
-- apply_lesson_completion_once, changes shape) and the body is that one plus the block at the end. The profile is
-- advisory and LENIENT, never a reason to fail a lesson: a malformed entry is skipped and seconds are clamped to the
-- same 0..3600 the standalone function refuses above. A caller that sends no `profile` (an older deploy) books nothing
-- here and keeps calling the two functions itself, so a deploy in between neither loses nor doubles a day. Replays
-- never reach this (apply_lesson_completion_once answers 'redeemed' before calling it), so a retry books once.
-- The day is the learner's local day the lesson counted for (`_today`).
--
-- BACKFILL (idempotent, ON CONFLICT DO NOTHING): a learning_days row for every learner-day that has a lesson completion
-- and none. The seconds are NOT recoverable (nothing recorded them), so those rows are 0: the day exists, the minutes
-- stay what they were. skill_days is not backfilled: lesson_completions holds one score per lesson, not per skill.
--
-- Depends on 20261114100000 (the apply_lesson_completion it replaces; learner_local_date), 20261107120000.
-- Rollback: re-apply apply_lesson_completion from 20261114100000_local_days.sql (callers then must book the profile
--   themselves again).

CREATE OR REPLACE FUNCTION public.apply_lesson_completion(
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
  _profile jsonb;
  _secs numeric;
  _skill jsonb;
  _skill_name text;
  _right numeric;
  _total numeric;
BEGIN
  -- IS DISTINCT FROM / IS NOT TRUE: a NULL argument must fail this guard, not slip past it as NULL.
  IF (_course IN ('en', 'fr', 'es')) IS NOT TRUE OR _lesson_id IS NULL OR _today IS NULL
     OR _expected IS NULL OR _next IS NULL
     OR jsonb_typeof(_missed_question_ids) IS DISTINCT FROM 'array'
     OR jsonb_typeof(_activity_events) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'invalid completion transition';
  END IF;

  -- A user's concurrent completions (even in different courses) cannot
  -- both calculate totals from the same stale state and then overwrite one
  -- another. Other account-progress writers are caught by row version checks.
  PERFORM 1 FROM auth.users WHERE id = _user_id FOR NO KEY UPDATE;
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
    (user_id, streak, longest_streak, last_active_date, hearts, hearts_refill_at, streak_freezes, day_basis)
  VALUES (
    _user_id,
    (_next->>'streak')::integer,
    (_next->>'longest_streak')::integer,
    (_next->>'last_active_date')::date,
    (_next->>'hearts')::integer,
    (_next->>'hearts_refill_at')::timestamptz,
    (_next->>'streak_freezes')::integer,
    -- A caller that does not say (an older deploy) leaves the basis as it is; a new learner starts on the local one.
    COALESCE(_next->>'day_basis', 'local')
  )
  ON CONFLICT (user_id) DO UPDATE SET
    streak = EXCLUDED.streak,
    longest_streak = EXCLUDED.longest_streak,
    last_active_date = EXCLUDED.last_active_date,
    hearts = EXCLUDED.hearts,
    hearts_refill_at = EXCLUDED.hearts_refill_at,
    streak_freezes = EXCLUDED.streak_freezes,
    day_basis = CASE WHEN _next ? 'day_basis' THEN _next->>'day_basis' ELSE public.user_progress.day_basis END;

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

  -- Profile data, in the same transaction. Lenient: never a reason to fail the lesson.
  _profile := _next->'profile';
  IF jsonb_typeof(_profile) = 'object' THEN
    IF jsonb_typeof(_profile->'lesson_seconds') = 'number' THEN
      _secs := LEAST(GREATEST(trunc((_profile->>'lesson_seconds')::numeric), 0), 3600);
      INSERT INTO public.learning_days AS l (user_id, day, lesson_seconds, practice_seconds)
      VALUES (_user_id, _today, _secs::integer, 0)
      ON CONFLICT (user_id, day) DO UPDATE
        SET lesson_seconds = l.lesson_seconds + EXCLUDED.lesson_seconds, updated_at = now();
    END IF;
    IF jsonb_typeof(_profile->'skills') = 'array' THEN
      FOR _skill IN SELECT value FROM jsonb_array_elements(_profile->'skills') LIMIT 5 LOOP
        _skill_name := _skill->>'skill';
        CONTINUE WHEN jsonb_typeof(_skill->'right') IS DISTINCT FROM 'number'
                   OR jsonb_typeof(_skill->'total') IS DISTINCT FROM 'number'
                   OR _skill_name IS NULL
                   OR _skill_name <> ALL (ARRAY['listening', 'speaking', 'vocabulary', 'grammar', 'reading']);
        _right := (_skill->>'right')::numeric;
        _total := (_skill->>'total')::numeric;
        CONTINUE WHEN _total <= 0 OR _total > 200 OR _right < 0 OR _right > _total
                   OR _right <> trunc(_right) OR _total <> trunc(_total);
        INSERT INTO public.skill_days AS d (user_id, day, skill, right_answers, total_answers)
        VALUES (_user_id, _today, _skill_name, _right::integer, _total::integer)
        ON CONFLICT (user_id, day, skill) DO UPDATE
          SET right_answers = d.right_answers + EXCLUDED.right_answers,
              total_answers = d.total_answers + EXCLUDED.total_answers,
              updated_at = now();
      END LOOP;
    END IF;
  END IF;

  RETURN jsonb_build_object('status', 'applied');
END;
$$;

REVOKE ALL ON FUNCTION public.apply_lesson_completion(uuid,text,text,text,date,jsonb,jsonb,jsonb,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_lesson_completion(uuid,text,text,text,date,jsonb,jsonb,jsonb,jsonb)
  TO service_role;

-- ---- backfill: the day exists for every learner-day that has a lesson (seconds were never recorded) ----
INSERT INTO public.learning_days (user_id, day, lesson_seconds, practice_seconds)
SELECT DISTINCT lc.user_id, public.learner_local_date(lc.user_id, lc.completed_at), 0, 0
  FROM public.lesson_completions lc
ON CONFLICT (user_id, day) DO NOTHING;
