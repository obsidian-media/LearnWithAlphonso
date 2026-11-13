-- Streaks and days use the learner's LOCAL day (owner decision 2026-11-12).
--
-- Until now every day the server books was the UTC date: streaks (user_progress.last_active_date), activity_days,
-- learning_days, skill_days, speech_days, a podcast quiz's streak day. A learner's stored time zone
-- (learner_time_zones, #472) was "stored and exposed only". This makes that zone the day boundary, with UTC when none
-- is known (never sent, or not a zone the database knows).
--
--   learner_local_date(_user_id, _at)   the learner's calendar date for an instant; UTC without a valid zone.
--   user_progress.day_basis             'utc' (every existing streak) or 'local': what the stored last_active_date means.
--   apply_lesson_completion             also records day_basis; the callers (web server function, complete-lesson Edge
--                                       Function) work the local day out themselves and send it as _today.
--   add_learning_seconds, add_skill_results, add_speech_seconds, submit_podcast_quiz   book the local day.
--
-- THE TRANSITION (existing streaks must not drop on the switch day). A streak on the 'utc' basis stores a UTC date. For a
-- learner east of UTC the local "yesterday" can be TWO UTC dates back, so the first completion after the switch counts a
-- two-date gap as the next day without spending a freeze (the same rule is in progress-math.ts, both copies, as
-- bridgeUtcDay). A gap of three or more dates still resets, and that completion writes day_basis = 'local', so the
-- bridge happens once. West of UTC the local day can be one behind the stored UTC date: the existing guard (a day never
-- moves the marker backwards) treats it as the same day, so nothing drops there either; at worst one day is not added.
--
-- NOT changed, on purpose: the weekly league, weekly quests, seasons and team missions keep their shared UTC week (a
-- competition needs one boundary for everyone); review due dates stay UTC dates (a due day, not a streak day); the
-- Hector/AI daily quotas reset at UTC midnight (consume_ai_quota keys on current_date); play-event months stay UTC.
--
-- Depends on 20261112140000 (the submit_podcast_quiz it replaces), 20261107120000 (learner_time_zones and the two
-- functions below), 20261106100000 (add_speech_seconds), 20261014100300 (apply_lesson_completion).
--
-- Rollback: restore the five functions from the migrations named above (submit_podcast_quiz from 20261112140000);
--   DROP FUNCTION public.learner_local_date(uuid, timestamptz); ALTER TABLE public.user_progress DROP COLUMN day_basis.

ALTER TABLE public.user_progress
  ADD COLUMN day_basis text NOT NULL DEFAULT 'utc' CHECK (day_basis IN ('utc', 'local'));

-- The learner's calendar date for an instant. An unknown or invalid zone is UTC, so this never raises.
CREATE FUNCTION public.learner_local_date(_user_id uuid, _at timestamptz)
RETURNS date
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (_at AT TIME ZONE COALESCE(
    (SELECT t.time_zone FROM public.learner_time_zones t
       WHERE t.user_id = _user_id
         AND EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names n WHERE n.name = t.time_zone)),
    'UTC'))::date
$$;
REVOKE ALL ON FUNCTION public.learner_local_date(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.learner_local_date(uuid, timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.add_speech_seconds(_user_id uuid, _seconds integer)
RETURNS date
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  booked date;
BEGIN
  IF _user_id IS NULL OR _seconds IS NULL OR _seconds < 0 OR _seconds > 3600 THEN
    RAISE EXCEPTION 'add_speech_seconds: seconds must be from 0 to 3600' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.speech_days AS s (user_id, day, speech_seconds)
  VALUES (_user_id, public.learner_local_date(_user_id, now()), _seconds)
  ON CONFLICT (user_id, day) DO UPDATE
    SET speech_seconds = s.speech_seconds + EXCLUDED.speech_seconds, updated_at = now()
  RETURNING s.day INTO booked;
  RETURN booked;
END;
$$;
REVOKE ALL ON FUNCTION public.add_speech_seconds(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_speech_seconds(uuid, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.add_learning_seconds(_user_id uuid, _lesson_seconds integer, _practice_seconds integer)
RETURNS date
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  booked date;
BEGIN
  IF _user_id IS NULL OR _lesson_seconds IS NULL OR _practice_seconds IS NULL
     OR _lesson_seconds < 0 OR _lesson_seconds > 3600 OR _practice_seconds < 0 OR _practice_seconds > 3600 THEN
    RAISE EXCEPTION 'add_learning_seconds: each of lesson and practice seconds must be from 0 to 3600'
      USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.learning_days AS l (user_id, day, lesson_seconds, practice_seconds)
  VALUES (_user_id, public.learner_local_date(_user_id, now()), _lesson_seconds, _practice_seconds)
  ON CONFLICT (user_id, day) DO UPDATE
    SET lesson_seconds = l.lesson_seconds + EXCLUDED.lesson_seconds,
        practice_seconds = l.practice_seconds + EXCLUDED.practice_seconds,
        updated_at = now()
  RETURNING l.day INTO booked;
  RETURN booked;
END;
$$;
REVOKE ALL ON FUNCTION public.add_learning_seconds(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_learning_seconds(uuid, integer, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.add_skill_results(_user_id uuid, _results jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  entry jsonb;
  seen text[] := '{}';
  s text;
  r integer;
  t integer;
  n integer := 0;
BEGIN
  IF _user_id IS NULL OR _results IS NULL OR jsonb_typeof(_results) <> 'array'
     OR jsonb_array_length(_results) > 5 THEN
    RAISE EXCEPTION 'add_skill_results: results must be an array of at most 5 entries' USING ERRCODE = '22023';
  END IF;
  FOR entry IN SELECT * FROM jsonb_array_elements(_results) LOOP
    s := entry ->> 'skill';
    IF jsonb_typeof(entry -> 'right') IS DISTINCT FROM 'number'
       OR jsonb_typeof(entry -> 'total') IS DISTINCT FROM 'number'
       OR s IS NULL OR s <> ALL (ARRAY['listening', 'speaking', 'vocabulary', 'grammar', 'reading'])
       OR s = ANY (seen) THEN
      RAISE EXCEPTION 'add_skill_results: bad entry' USING ERRCODE = '22023';
    END IF;
    IF (entry ->> 'right')::numeric <> trunc((entry ->> 'right')::numeric)
       OR (entry ->> 'total')::numeric <> trunc((entry ->> 'total')::numeric)
       OR (entry ->> 'right')::numeric < 0 OR (entry ->> 'total')::numeric > 200
       OR (entry ->> 'right')::numeric > (entry ->> 'total')::numeric THEN
      RAISE EXCEPTION 'add_skill_results: right must be from 0 to total, total at most 200' USING ERRCODE = '22023';
    END IF;
    seen := seen || s;
  END LOOP;
  FOR entry IN SELECT * FROM jsonb_array_elements(_results) LOOP
    r := (entry ->> 'right')::numeric::integer;
    t := (entry ->> 'total')::numeric::integer;
    CONTINUE WHEN t = 0;
    INSERT INTO public.skill_days AS d (user_id, day, skill, right_answers, total_answers)
    VALUES (_user_id, public.learner_local_date(_user_id, now()), entry ->> 'skill', r, t)
    ON CONFLICT (user_id, day, skill) DO UPDATE
      SET right_answers = d.right_answers + EXCLUDED.right_answers,
          total_answers = d.total_answers + EXCLUDED.total_answers,
          updated_at = now();
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.add_skill_results(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_skill_results(uuid, jsonb) TO service_role;

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

  RETURN jsonb_build_object('status', 'applied');
END;
$$;

REVOKE ALL ON FUNCTION public.apply_lesson_completion(uuid,text,text,text,date,jsonb,jsonb,jsonb,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_lesson_completion(uuid,text,text,text,date,jsonb,jsonb,jsonb,jsonb)
  TO service_role;

CREATE OR REPLACE FUNCTION public.submit_podcast_quiz(
  _user_id uuid,
  _episode_id uuid,
  _answers jsonb,
  _at timestamptz,
  _completed_at timestamptz DEFAULT NULL,
  _limit integer DEFAULT 60
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _course text;
  _total integer;
  _correct integer;
  _missed jsonb;
  _prev_correct integer;
  _prev_xp integer;
  _best_correct integer;
  _best_xp integer;
  _gain integer;
  _claimed timestamptz;
  _today date;
  _p public.user_progress%ROWTYPE;
  _had_p boolean;
  _streak integer;
  _old_streak integer;
  _freezes integer;
  _diff integer;
BEGIN
  IF _user_id IS NULL OR _episode_id IS NULL OR _at IS NULL OR _limit IS NULL OR _limit < 1
     OR jsonb_typeof(_answers) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'invalid podcast quiz submission';
  END IF;

  -- The same per-user lock apply_lesson_completion takes, so a quiz and a lesson finishing together cannot both
  -- compute XP from the same stale total.
  PERFORM 1 FROM auth.users WHERE id = _user_id FOR NO KEY UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'podcast quiz account no longer exists'; END IF;

  SELECT coalesce(pe.course, 'en') INTO _course FROM public.podcast_episodes pe
    WHERE pe.id = _episode_id AND pe.published = true;
  IF _course IS NULL THEN RETURN jsonb_build_object('status', 'not-found'); END IF;

  SELECT count(*)::integer INTO _total FROM public.podcast_quiz_questions WHERE episode_id = _episode_id;
  IF _total = 0 THEN RETURN jsonb_build_object('status', 'not-found'); END IF;

  -- Exactly one well-formed answer per real question: no missing, duplicate, foreign or malformed entry.
  IF jsonb_array_length(_answers) <> _total
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(_answers) a
       WHERE jsonb_typeof(a) IS DISTINCT FROM 'object'
          OR jsonb_typeof(a->'questionId') IS DISTINCT FROM 'string'
          OR jsonb_typeof(a->'choiceIndex') IS DISTINCT FROM 'number'
     )
     OR (SELECT count(DISTINCT a->>'questionId') FROM jsonb_array_elements(_answers) a) <> _total
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(_answers) a
       WHERE NOT EXISTS (
         SELECT 1 FROM public.podcast_quiz_questions q
         WHERE q.episode_id = _episode_id AND q.id = a->>'questionId'
       )
     ) THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  SELECT
    count(*) FILTER (WHERE (a->>'choiceIndex')::numeric = q.answer_index)::integer,
    coalesce(jsonb_agg(q.id ORDER BY q.sort_order) FILTER (WHERE (a->>'choiceIndex')::numeric <> q.answer_index), '[]'::jsonb)
  INTO _correct, _missed
  FROM jsonb_array_elements(_answers) a
  JOIN public.podcast_quiz_questions q ON q.episode_id = _episode_id AND q.id = a->>'questionId';

  SELECT best_correct, best_xp INTO _prev_correct, _prev_xp FROM public.podcast_quiz_awards
    WHERE user_id = _user_id AND episode_id = _episode_id FOR UPDATE;

  _best_correct := greatest(coalesce(_prev_correct, 0), _correct);
  _best_xp := _best_correct * 10;
  _gain := greatest(0, _best_xp - coalesce(_prev_xp, 0));

  -- The activity instant, clamped like a lesson's completedAt, and its UTC day.
  _claimed := least(greatest(coalesce(_completed_at, _at), _at - interval '3 hours'), _at);

  IF _gain > 0 THEN
    IF NOT public.consume_lesson_completion_slot(_user_id, _claimed, _limit) THEN
      RETURN jsonb_build_object('status', 'rate-limited');
    END IF;

    INSERT INTO public.podcast_quiz_awards (user_id, episode_id, best_correct, best_xp)
    VALUES (_user_id, _episode_id, _best_correct, _best_xp)
    ON CONFLICT (user_id, episode_id) DO UPDATE SET
      best_correct = EXCLUDED.best_correct, best_xp = EXCLUDED.best_xp, updated_at = now();

    -- XP goes to the episode's own course, like lesson XP. League promotion is recomputed from the new total by the
    -- next lesson completion (complete-lesson derives the tier from xp), so it is not duplicated here.
    INSERT INTO public.language_progress (user_id, language, xp)
    VALUES (_user_id, _course, _gain)
    ON CONFLICT (user_id, language) DO UPDATE SET xp = public.language_progress.xp + EXCLUDED.xp;
  END IF;

  -- Every missed question becomes a review item the learner meets in Review (web, iOS and Android all read the
  -- same rows). It runs only here, after every refusal above has returned, so a refused or invalid submission adds
  -- nothing, and in the same transaction as the score, so a learner never sees "missed 2" without the 2 items.
  -- The row carries its own question (like 'weakness' and 'saved_word' rows), so grading needs no bundled lesson, and
  -- an explanation (the right answer, stated) because the native review players need one on every such row:
  -- the key is letters and digits around one colon, as the review grader requires. A question missed again keeps its
  -- row and its schedule (the due date only ever moves earlier); one the learner retired (its row deleted) comes back.
  INSERT INTO public.review_items (user_id, item_key, lesson_id, language, source, prompt, choices, answer_index, explanation, due_on)
  SELECT _user_id,
         'podcast:' || replace(_episode_id::text, '-', '') || regexp_replace(lower(q.id), '[^a-z0-9]', '', 'g'),
         'podcast', _course, 'podcast_quiz', q.prompt, q.choices, q.answer_index,
         'Correct answer: ' || (q.choices ->> q.answer_index),
         (_at AT TIME ZONE 'UTC')::date
    FROM public.podcast_quiz_questions q
    JOIN jsonb_array_elements_text(_missed) m(id) ON m.id = q.id
   WHERE q.episode_id = _episode_id
  ON CONFLICT (user_id, item_key, language) DO UPDATE SET
    prompt = EXCLUDED.prompt,
    choices = EXCLUDED.choices,
    answer_index = EXCLUDED.answer_index,
    explanation = EXCLUDED.explanation,
    due_on = least(public.review_items.due_on, EXCLUDED.due_on);

  -- Streak and day, for a replay that pays nothing as much as for one that does (lessons do the same).
  SELECT * INTO _p FROM public.user_progress WHERE user_id = _user_id FOR UPDATE;
  _had_p := FOUND;
  _today := public.learner_local_date(_user_id, _claimed);
  IF _had_p AND _p.last_active_date IS NOT NULL AND _p.last_active_date > _today THEN
    _today := _p.last_active_date; -- a late-arriving or skewed time never moves the marker backwards
  END IF;

  -- Mirrors computeStreakUpdate (progress-math.ts).
  _old_streak := CASE WHEN _had_p THEN _p.streak ELSE 0 END;
  _streak := _old_streak;
  _freezes := CASE WHEN _had_p THEN _p.streak_freezes ELSE 0 END;
  IF NOT _had_p OR _p.last_active_date IS NULL THEN
    _streak := 1;
  ELSIF _p.last_active_date = _today THEN
    NULL; -- same day, no change
  ELSE
    _diff := _today - _p.last_active_date;
    IF _diff = 1 THEN
      _streak := _p.streak + 1;
    ELSIF _diff = 2 AND _p.day_basis = 'utc' THEN
      -- The one-time bridge from UTC days to local days: a streak written under the old rule stores a UTC date, and a
      -- learner east of UTC has a local "yesterday" that is two UTC dates back. It counts as the next day, no freeze.
      _streak := _p.streak + 1;
    ELSIF _diff = 2 AND _freezes > 0 THEN
      _streak := _p.streak + 1;
      _freezes := _freezes - 1;
    ELSE
      _streak := 1;
    END IF;
  END IF;
  IF _streak > _old_streak AND _streak % 10 = 0 THEN
    _freezes := _freezes + 1;
  END IF;

  INSERT INTO public.user_progress (user_id, streak, longest_streak, last_active_date, streak_freezes, day_basis)
  VALUES (_user_id, _streak, _streak, _today, _freezes, 'local')
  ON CONFLICT (user_id) DO UPDATE SET
    day_basis = 'local',
    streak = EXCLUDED.streak,
    longest_streak = greatest(public.user_progress.longest_streak, EXCLUDED.streak),
    last_active_date = EXCLUDED.last_active_date,
    streak_freezes = EXCLUDED.streak_freezes;
  -- A new 7-day streak milestone refills the hearts, as it does for a lesson.
  IF _streak > _old_streak AND _streak % 7 = 0 THEN
    UPDATE public.user_progress SET hearts = 5, hearts_refill_at = NULL WHERE user_id = _user_id;
  END IF;

  INSERT INTO public.activity_days (user_id, day, xp_earned)
  VALUES (_user_id, _today, _gain)
  ON CONFLICT (user_id, day) DO UPDATE SET xp_earned = public.activity_days.xp_earned + EXCLUDED.xp_earned;

  RETURN jsonb_build_object(
    'status', 'applied',
    'correct', _correct,
    'total', _total,
    'xpGain', _gain,
    'streak', _streak,
    'bestCorrect', _best_correct,
    'bestXp', _best_xp,
    'missedQuestionIds', _missed
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_podcast_quiz(uuid, uuid, jsonb, timestamptz, timestamptz, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_podcast_quiz(uuid, uuid, jsonb, timestamptz, timestamptz, integer) TO service_role;
