-- Podcast quiz: after an episode, the learner can take a 6-7 question quiz about it and earn listening-practice XP.
-- Versioned after 20261104100100_lesson_completion_hits.sql, whose consume_lesson_completion_slot this calls, and after
-- the podcast library / transcripts migrations whose tables it references.
--
-- XP rules (owner decision 2026-11-04): 10 XP per correct answer, no pass mark, and a replay pays only the improvement
-- over the learner's stored best (the same replay semantics as lessons: computeLessonReplayXp). Perfect-score bonuses
-- do not apply here, so an episode is worth at most 70 XP.
--
-- Access: the quiz follows the episode's own rules exactly. A learner who cannot read the episode (it is not published)
-- cannot read its questions or submit answers for it.

-- The questions themselves. Authored in src/data/podcast-quizzes.ts and seeded by the next migration. Like the lesson
-- questions table, the answer key is readable by clients; grading still happens on the server from the stored key.
CREATE TABLE public.podcast_quiz_questions (
  episode_id uuid NOT NULL REFERENCES public.podcast_episodes(id) ON DELETE CASCADE,
  id text NOT NULL,
  prompt text NOT NULL CHECK (length(prompt) > 0),
  choices jsonb NOT NULL CHECK (jsonb_typeof(choices) = 'array' AND jsonb_array_length(choices) BETWEEN 2 AND 4),
  answer_index integer NOT NULL,
  sort_order integer NOT NULL,
  PRIMARY KEY (episode_id, id),
  CONSTRAINT podcast_quiz_answer_in_range CHECK (answer_index >= 0 AND answer_index < jsonb_array_length(choices))
);
GRANT SELECT ON public.podcast_quiz_questions TO authenticated;
GRANT ALL ON public.podcast_quiz_questions TO service_role;
ALTER TABLE public.podcast_quiz_questions ENABLE ROW LEVEL SECURITY;
-- EXISTS runs as the caller, so podcast_episodes' own published-only policy applies: an unpublished episode's quiz is
-- unreachable even by a client that guesses the id.
CREATE POLICY "podcast_quiz_questions_select_published" ON public.podcast_quiz_questions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.podcast_episodes pe
       WHERE pe.id = podcast_quiz_questions.episode_id
         AND pe.published = true
    )
  );

-- The best score each learner has banked per episode. A learner may READ their own rows (the app shows "best 5 of 7"
-- and the account export includes them); there is no write grant at all. Only submit_podcast_quiz (service role) writes.
CREATE TABLE public.podcast_quiz_awards (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  episode_id uuid NOT NULL REFERENCES public.podcast_episodes(id) ON DELETE CASCADE,
  best_correct integer NOT NULL CHECK (best_correct >= 0),
  best_xp integer NOT NULL CHECK (best_xp >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, episode_id)
);
GRANT SELECT ON public.podcast_quiz_awards TO authenticated;
GRANT ALL ON public.podcast_quiz_awards TO service_role;
ALTER TABLE public.podcast_quiz_awards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "podcast_quiz_awards_select_own" ON public.podcast_quiz_awards
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Grades a submission against the stored key and pays the improvement, all in one transaction.
--   _answers: [{"questionId": "q1", "choiceIndex": 2}, ...], exactly one entry per question.
-- Returns {status: 'not-found' | 'invalid' | 'rate-limited' | 'applied', ...}. 'applied' carries correct, total,
-- xpGain, bestCorrect, bestXp and missedQuestionIds. A refusal changes nothing.
--
-- The hourly ceiling is shared with lessons (consume_lesson_completion_slot) and is taken ONLY when the submission
-- improves the learner's best. Because the slot is taken inside this transaction, a failed save rolls it back with
-- everything else, so nothing needs to be released.
CREATE FUNCTION public.submit_podcast_quiz(
  _user_id uuid,
  _episode_id uuid,
  _answers jsonb,
  _at timestamptz,
  _today date,
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
BEGIN
  IF _user_id IS NULL OR _episode_id IS NULL OR _at IS NULL OR _today IS NULL
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

  IF _gain > 0 THEN
    IF NOT public.consume_lesson_completion_slot(_user_id, _at, _limit) THEN
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

    INSERT INTO public.activity_days (user_id, day, xp_earned)
    VALUES (_user_id, _today, _gain)
    ON CONFLICT (user_id, day) DO UPDATE SET xp_earned = public.activity_days.xp_earned + EXCLUDED.xp_earned;
  END IF;

  RETURN jsonb_build_object(
    'status', 'applied',
    'correct', _correct,
    'total', _total,
    'xpGain', _gain,
    'bestCorrect', _best_correct,
    'bestXp', _best_xp,
    'missedQuestionIds', _missed
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_podcast_quiz(uuid, uuid, jsonb, timestamptz, date, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_podcast_quiz(uuid, uuid, jsonb, timestamptz, date, integer) TO service_role;

-- Rollback: DROP FUNCTION public.submit_podcast_quiz(uuid, uuid, jsonb, timestamptz, date, integer);
--           DROP TABLE public.podcast_quiz_awards;
--           DROP TABLE public.podcast_quiz_questions;
