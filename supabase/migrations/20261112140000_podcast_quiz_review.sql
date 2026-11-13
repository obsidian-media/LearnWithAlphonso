-- Podcast quiz mistakes go to spaced review.
--
-- submit_podcast_quiz already returned missedQuestionIds, but nothing wrote them anywhere: the quiz screen listed
-- "To review" and that was the end of it. This adds a fourth review_items source, 'podcast_quiz', and makes the quiz
-- RPC itself write one self-contained row per missed question, so the web server function and the
-- complete-podcast-quiz Edge Function (which both call the RPC) feed web, iOS and Android Review with no client
-- write path. review_items still has no client INSERT beyond the old direct grants; this adds none.
--
-- 1. 'podcast_quiz' joins the allowed sources. Its shape is the question itself (prompt, choices, answer_index); there is
--    no explanation, weakness label or saved word. The constraint keeps the name weakness_shape_matches_source, as
--    20261005120000 did, and restates the three existing shapes exactly.
-- 2. CREATE OR REPLACE of submit_podcast_quiz(uuid, uuid, jsonb, timestamptz, timestamptz, integer): the body is the one
--    from 20261104100200_podcast_quiz.sql, unchanged except for the review upsert marked below. The signature is the
--    same, so callers and grants carry over (restated anyway).
--
-- VERSIONING: after 20261104100200 (the function it replaces) and after 20261005120000 (the constraint it extends).
--
-- Rollback: restore the function body from 20261104100200_podcast_quiz.sql, then
--   DELETE FROM public.review_items WHERE source = 'podcast_quiz';
--   ALTER TABLE public.review_items DROP CONSTRAINT weakness_shape_matches_source, DROP CONSTRAINT review_items_source_check;
--   and re-add both as 20261005120000 defines them.

ALTER TABLE public.review_items DROP CONSTRAINT IF EXISTS weakness_shape_matches_source;
ALTER TABLE public.review_items DROP CONSTRAINT IF EXISTS review_items_source_check;

ALTER TABLE public.review_items
  ADD CONSTRAINT review_items_source_check
  CHECK (source IN ('lesson', 'weakness', 'saved_word', 'podcast_quiz'));

ALTER TABLE public.review_items
  ADD CONSTRAINT weakness_shape_matches_source CHECK (
    (source = 'lesson') OR
    (source = 'weakness' AND weakness_label IS NOT NULL AND weakness_display IS NOT NULL
       AND prompt IS NOT NULL AND choices IS NOT NULL AND answer_index IS NOT NULL) OR
    (source = 'saved_word' AND saved_word IS NOT NULL AND saved_context IS NOT NULL
       AND prompt IS NOT NULL AND choices IS NOT NULL AND answer_index IS NOT NULL
       AND explanation IS NOT NULL) OR
    (source = 'podcast_quiz' AND prompt IS NOT NULL AND choices IS NOT NULL AND answer_index IS NOT NULL)
  );

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
  _today := (_claimed AT TIME ZONE 'UTC')::date;
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

  INSERT INTO public.user_progress (user_id, streak, longest_streak, last_active_date, streak_freezes)
  VALUES (_user_id, _streak, _streak, _today, _freezes)
  ON CONFLICT (user_id) DO UPDATE SET
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
