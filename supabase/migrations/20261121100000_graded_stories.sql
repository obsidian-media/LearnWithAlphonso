-- Graded stories: short leveled read-along texts, the reading analog of the Listen library
-- (docs/superpowers/specs/2026-11-17-graded-stories-design.md).
--
-- Mirrors the podcast content model: stories (like podcast_episodes) are hidden from clients until `published`, a
-- story's check questions (like podcast_quiz_questions) are readable only while its story is, and per-learner progress
-- (like listen_progress) is own-row SELECT with every write going through a function that takes the user from the
-- caller, never from the body.
--
-- Publishing is a data change: UPDATE public.stories SET published = true, published_at = now(), needs_review = false.
-- A story cannot be published while it still needs a content review (CHECK below), so a draft cannot go live by a
-- one-column slip.
--
-- Rollback (nothing else depends on it):
--   DROP FUNCTION public.submit_story_check(uuid, uuid, jsonb); DROP FUNCTION public.save_story_progress(uuid, integer);
--   DROP TABLE public.story_progress, public.story_quiz_questions, public.stories;

CREATE TABLE public.stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course text NOT NULL CHECK (course IN ('en', 'fr', 'es')),
  level_id text NOT NULL REFERENCES public.levels(id),
  slug text NOT NULL,
  title text NOT NULL,
  -- The text, one sentence or short paragraph per element: the unit of narration and of the read-along highlight.
  segments jsonb NOT NULL CHECK (
    jsonb_typeof(segments) = 'array' AND jsonb_array_length(segments) BETWEEN 1 AND 60
  ),
  -- Optional whole-story narration in the public podcast-audio bucket. v1 narrates per sentence through /api/tts.
  audio_path text,
  -- Drafted by an agent, not a native speaker: true until a human has reviewed the text.
  needs_review boolean NOT NULL DEFAULT true,
  published boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course, slug),
  CONSTRAINT stories_review_before_publish CHECK (NOT published OR NOT needs_review)
);
CREATE INDEX stories_published_course_level_idx ON public.stories (course, level_id, sort_order) WHERE published;
CREATE INDEX stories_level_id_idx ON public.stories (level_id);

ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stories FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.stories TO authenticated;
GRANT ALL ON public.stories TO service_role;
-- Drafts are invisible to clients. Like the podcast, this hides the ROW; audio_path (if any) points at a public bucket.
CREATE POLICY stories_select_published ON public.stories
  FOR SELECT TO authenticated USING (published = true);

CREATE TABLE public.story_quiz_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position BETWEEN 1 AND 10),
  prompt text NOT NULL,
  choices jsonb NOT NULL CHECK (
    jsonb_typeof(choices) = 'array' AND jsonb_array_length(choices) BETWEEN 2 AND 4
  ),
  answer_index integer NOT NULL CHECK (answer_index BETWEEN 0 AND 3),
  UNIQUE (story_id, position),
  CHECK (answer_index < jsonb_array_length(choices))
);

ALTER TABLE public.story_quiz_questions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.story_quiz_questions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.story_quiz_questions TO authenticated;
GRANT ALL ON public.story_quiz_questions TO service_role;
-- The EXISTS runs as the caller, so the stories policy above applies: a draft's questions are as hidden as the draft.
CREATE POLICY story_quiz_questions_select_published ON public.story_quiz_questions
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.stories s WHERE s.id = story_id AND s.published)
  );

-- Per-learner progress. Clients get SELECT only; save_story_progress and submit_story_check write.
CREATE TABLE public.story_progress (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  segment_index integer NOT NULL DEFAULT 0 CHECK (segment_index >= 0),
  -- The check: how many were right on the best attempt, and out of how many. NULL until it is first taken.
  best_correct integer CHECK (best_correct >= 0),
  check_total integer CHECK (check_total >= 0),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, story_id)
);
CREATE INDEX story_progress_user_updated_idx ON public.story_progress (user_id, updated_at DESC);
CREATE INDEX story_progress_story_id_idx ON public.story_progress (story_id);

ALTER TABLE public.story_progress ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.story_progress FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.story_progress TO authenticated;
GRANT ALL ON public.story_progress TO service_role;
CREATE POLICY story_progress_select_own ON public.story_progress
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

-- Where the learner has read up to. The user comes from auth.uid(); the story must be published; the index is clamped
-- into the story's segments. Never moves a completed story back to unread.
CREATE FUNCTION public.save_story_progress(p_story_id uuid, p_segment_index integer)
RETURNS TABLE (segment_index integer, completed_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_len integer;
  v_idx integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_story_id IS NULL OR p_segment_index IS NULL THEN
    RAISE EXCEPTION 'story and segment are required' USING ERRCODE = '22023';
  END IF;
  SELECT jsonb_array_length(s.segments) INTO v_len
    FROM public.stories s WHERE s.id = p_story_id AND s.published;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown story' USING ERRCODE = '22023';
  END IF;
  v_idx := GREATEST(0, LEAST(p_segment_index, v_len - 1));
  RETURN QUERY
  INSERT INTO public.story_progress AS sp (user_id, story_id, segment_index, updated_at)
  VALUES (v_uid, p_story_id, v_idx, now())
  ON CONFLICT (user_id, story_id) DO UPDATE
    SET segment_index = EXCLUDED.segment_index, updated_at = now()
  RETURNING sp.segment_index, sp.completed_at;
END;
$$;
REVOKE ALL ON FUNCTION public.save_story_progress(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_story_progress(uuid, integer) TO authenticated, service_role;

-- Grades a story's check from the stored key (the client never sends a score) and credits the `reading` skill.
-- _answers: [{"questionId": "q1", "choiceIndex": 2}, ...], exactly one per question; question ids are "q" plus the
-- question's position. The reading credit (skill_days, the profile skills chart) is given ONCE, for a learner's first
-- attempt at a story, so repeating a story cannot farm it; later attempts only raise best_correct.
-- Returns {status: 'not-found' | 'invalid' | 'applied', correct, total, bestCorrect, missedQuestionIds, credited}.
-- Service role only: the server function passes the verified user id, as for submit_podcast_quiz.
CREATE FUNCTION public.submit_story_check(_user_id uuid, _story_id uuid, _answers jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _total integer;
  _correct integer;
  _missed jsonb;
  _prev_best integer;
  _prev_total integer;
  _first boolean;
  _best integer;
BEGIN
  IF _user_id IS NULL OR _story_id IS NULL OR jsonb_typeof(_answers) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'invalid story check submission';
  END IF;

  PERFORM 1 FROM public.stories s WHERE s.id = _story_id AND s.published;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'not-found'); END IF;

  SELECT count(*)::integer INTO _total FROM public.story_quiz_questions WHERE story_id = _story_id;
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
         SELECT 1 FROM public.story_quiz_questions q
         WHERE q.story_id = _story_id AND 'q' || q.position::text = a->>'questionId'
       )
     ) THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  SELECT
    count(*) FILTER (WHERE (a->>'choiceIndex')::numeric = q.answer_index)::integer,
    coalesce(jsonb_agg('q' || q.position::text ORDER BY q.position)
      FILTER (WHERE (a->>'choiceIndex')::numeric <> q.answer_index), '[]'::jsonb)
  INTO _correct, _missed
  FROM jsonb_array_elements(_answers) a
  JOIN public.story_quiz_questions q
    ON q.story_id = _story_id AND 'q' || q.position::text = a->>'questionId';

  -- Serialise two submissions by one learner for one story, so the first-attempt credit is given once.
  PERFORM pg_advisory_xact_lock(hashtextextended(_user_id::text || _story_id::text, 0));

  SELECT best_correct, check_total INTO _prev_best, _prev_total FROM public.story_progress
    WHERE user_id = _user_id AND story_id = _story_id;
  _first := _prev_total IS NULL;
  _best := greatest(coalesce(_prev_best, 0), _correct);

  INSERT INTO public.story_progress AS sp (user_id, story_id, best_correct, check_total, completed_at, updated_at)
  VALUES (_user_id, _story_id, _best, _total, now(), now())
  ON CONFLICT (user_id, story_id) DO UPDATE
    SET best_correct = EXCLUDED.best_correct,
        check_total = EXCLUDED.check_total,
        completed_at = coalesce(sp.completed_at, EXCLUDED.completed_at),
        updated_at = now();

  IF _first THEN
    PERFORM public.add_skill_results(
      _user_id,
      jsonb_build_array(jsonb_build_object('skill', 'reading', 'right', _correct, 'total', _total))
    );
  END IF;

  RETURN jsonb_build_object(
    'status', 'applied', 'correct', _correct, 'total', _total,
    'bestCorrect', _best, 'missedQuestionIds', _missed, 'credited', _first
  );
END;
$$;
REVOKE ALL ON FUNCTION public.submit_story_check(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_story_check(uuid, uuid, jsonb) TO service_role;

-- ---- Seed: six proof stories, UNPUBLISHED and flagged needs_review ----
-- Drafted by an agent (not a native speaker), two per course at A1 and A2. They do not reach learners until a human
-- reviews them and sets needs_review = false, published = true, published_at = now().
INSERT INTO public.stories (course, level_id, slug, title, segments, sort_order) VALUES
('en', 'A1', 'mias-morning', 'Mia''s Morning', $j$[
  "Mia wakes up at seven o'clock.",
  "She is tired, but she gets out of bed.",
  "She eats bread and drinks tea.",
  "Then she brushes her teeth.",
  "At eight o'clock, she goes to work by bus.",
  "The bus is full today, so Mia stands.",
  "She looks out of the window and smiles. It is a sunny day."
]$j$::jsonb, 1),
('en', 'A2', 'the-lost-umbrella', 'The Lost Umbrella', $j$[
  "On Monday morning, Tom left his house without an umbrella.",
  "At noon, it started to rain very hard.",
  "Tom was at the park, and he had no way to stay dry.",
  "A kind woman saw him and shared her umbrella.",
  "They walked together to the bus stop and talked about the weather.",
  "Her name was Anna, and she worked in a bookshop near the park.",
  "The next day, Tom bought a small umbrella and visited her shop to say thank you."
]$j$::jsonb, 2),
('fr', 'A1', 'ma-famille', 'Ma famille', $j$[
  "Je m'appelle Léa. J'ai dix ans.",
  "J'habite à Lyon avec ma famille.",
  "Mon père s'appelle Paul. Il est grand.",
  "Ma mère s'appelle Claire. Elle est professeure.",
  "J'ai un frère. Il s'appelle Hugo.",
  "Nous avons un chat. Il est noir et blanc.",
  "J'aime ma famille."
]$j$::jsonb, 1),
('fr', 'A2', 'un-weekend-a-la-plage', 'Un week-end à la plage', $j$[
  "Samedi dernier, Samir et ses amis sont allés à la plage.",
  "Ils ont pris le train à huit heures du matin.",
  "Il faisait très beau et la mer était calme.",
  "Samir a nagé pendant une heure, puis il a mangé un sandwich.",
  "Après le déjeuner, ses amis ont joué au volley.",
  "Le soir, ils ont regardé le coucher du soleil.",
  "Ils étaient fatigués, mais très contents de leur journée."
]$j$::jsonb, 2),
('es', 'A1', 'en-la-cafeteria', 'En la cafetería', $j$[
  "Me llamo Carlos y tengo veinte años.",
  "Hoy voy a una cafetería con mi amiga Ana.",
  "La cafetería es pequeña y bonita.",
  "Yo quiero un café con leche.",
  "Ana quiere un té y un pastel.",
  "El camarero es muy simpático.",
  "Pagamos diez euros. Después, vamos al parque."
]$j$::jsonb, 1),
('es', 'A2', 'el-fin-de-semana-de-lucia', 'El fin de semana de Lucía', $j$[
  "El sábado, Lucía se levantó temprano porque tenía mucho que hacer.",
  "Primero fue al mercado y compró frutas y verduras.",
  "Después limpió su casa y preparó la comida.",
  "Por la tarde, sus primos vinieron a visitarla.",
  "Comieron juntos y hablaron durante horas.",
  "Cuando se fueron, Lucía estaba cansada, pero feliz.",
  "El domingo decidió descansar y leer un libro en el jardín."
]$j$::jsonb, 2);

INSERT INTO public.story_quiz_questions (story_id, position, prompt, choices, answer_index)
SELECT s.id, q.position, q.prompt, q.choices::jsonb, q.answer_index
FROM (VALUES
  ('en', 'mias-morning', 1, 'What time does Mia wake up?', '["At six o''clock","At seven o''clock","At eight o''clock"]', 1),
  ('en', 'mias-morning', 2, 'What does Mia drink?', '["Coffee","Milk","Tea"]', 2),
  ('en', 'mias-morning', 3, 'How does Mia go to work?', '["By bus","By car","On foot"]', 0),
  ('en', 'the-lost-umbrella', 1, 'Why did Tom get wet?', '["He left his umbrella at home","He lost his hat","He took the wrong bus"]', 0),
  ('en', 'the-lost-umbrella', 2, 'Who helped Tom?', '["His brother","A kind woman","A bus driver"]', 1),
  ('en', 'the-lost-umbrella', 3, 'Where does Anna work?', '["In a bookshop","In a park","At a bus stop"]', 0),
  ('fr', 'ma-famille', 1, 'Où habite Léa ?', '["À Paris","À Lyon","À Nice"]', 1),
  ('fr', 'ma-famille', 2, 'Comment s''appelle le frère de Léa ?', '["Paul","Hugo","Louis"]', 1),
  ('fr', 'ma-famille', 3, 'De quelle couleur est le chat ?', '["Noir et blanc","Gris","Rouge"]', 0),
  ('fr', 'un-weekend-a-la-plage', 1, 'Comment les amis vont-ils à la plage ?', '["En train","En voiture","En bus"]', 0),
  ('fr', 'un-weekend-a-la-plage', 2, 'Qu''est-ce que Samir a mangé ?', '["Une pizza","Un sandwich","Une salade"]', 1),
  ('fr', 'un-weekend-a-la-plage', 3, 'Que font les amis le soir ?', '["Ils jouent au volley","Ils regardent le coucher du soleil","Ils rentrent à la maison"]', 1),
  ('es', 'en-la-cafeteria', 1, '¿Con quién va Carlos a la cafetería?', '["Con su madre","Con su amiga Ana","Con su hermano"]', 1),
  ('es', 'en-la-cafeteria', 2, '¿Qué quiere Carlos?', '["Un café con leche","Un té","Un pastel"]', 0),
  ('es', 'en-la-cafeteria', 3, '¿Cómo es el camarero?', '["Antipático","Simpático","Alto"]', 1),
  ('es', 'el-fin-de-semana-de-lucia', 1, '¿Qué compró Lucía en el mercado?', '["Pan y leche","Frutas y verduras","Pescado"]', 1),
  ('es', 'el-fin-de-semana-de-lucia', 2, '¿Quién visitó a Lucía por la tarde?', '["Sus vecinos","Sus primos","Sus padres"]', 1),
  ('es', 'el-fin-de-semana-de-lucia', 3, '¿Qué hizo Lucía el domingo?', '["Fue al mercado","Limpió la casa","Descansó y leyó"]', 2)
) AS q(course, slug, position, prompt, choices, answer_index)
JOIN public.stories s ON s.course = q.course AND s.slug = q.slug;
