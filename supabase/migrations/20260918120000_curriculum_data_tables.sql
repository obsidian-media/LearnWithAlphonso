-- =========== levels ===========
CREATE TABLE public.levels (
  id text PRIMARY KEY,              -- 'A1'..'C1'
  name text NOT NULL,
  blurb text NOT NULL,
  sort_order integer NOT NULL
);
GRANT SELECT ON public.levels TO authenticated, anon;
GRANT ALL ON public.levels TO service_role;
ALTER TABLE public.levels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "levels_read_all" ON public.levels FOR SELECT USING (true);

-- =========== units ===========
CREATE TABLE public.units (
  id text PRIMARY KEY,              -- 'u1', 'a1p1u1', 'fra1p1u1', ...
  course text NOT NULL,             -- 'en' | 'fr'
  level_id text NOT NULL REFERENCES public.levels(id),
  eyebrow text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  sort_order integer NOT NULL
);
CREATE INDEX ON public.units(course, level_id);
GRANT SELECT ON public.units TO authenticated, anon;
GRANT ALL ON public.units TO service_role;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
CREATE POLICY "units_read_all" ON public.units FOR SELECT USING (true);

-- =========== lessons ===========
CREATE TABLE public.lessons (
  id text PRIMARY KEY,              -- 'u1l1', ...  (globally unique already)
  unit_id text NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  title text NOT NULL,
  subtitle text NOT NULL,
  sort_order integer NOT NULL
);
CREATE INDEX ON public.lessons(unit_id);
GRANT SELECT ON public.lessons TO authenticated, anon;
GRANT ALL ON public.lessons TO service_role;
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lessons_read_all" ON public.lessons FOR SELECT USING (true);

-- =========== questions ===========
-- id ('q1'..) repeats across lessons, so the primary key is composite
-- (lesson_id, id), unlike every other table here where id alone is
-- globally unique.
CREATE TABLE public.questions (
  lesson_id text NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  id text NOT NULL,                 -- 'q1', 'q2', ... (unique within lesson only)
  type text NOT NULL CHECK (type IN ('mc', 'fill')),
  prompt text NOT NULL,
  choices jsonb,                    -- mc only: string[]
  bank jsonb,                       -- fill only: string[]
  answer_index integer,             -- mc only
  answer_text text,                 -- fill only
  explanation text NOT NULL,
  sort_order integer NOT NULL,
  PRIMARY KEY (lesson_id, id),
  CONSTRAINT question_shape_matches_type CHECK (
    (type = 'mc' AND choices IS NOT NULL AND answer_index IS NOT NULL
       AND bank IS NULL AND answer_text IS NULL)
    OR
    (type = 'fill' AND bank IS NOT NULL AND answer_text IS NOT NULL
       AND choices IS NULL AND answer_index IS NULL)
  )
);
GRANT SELECT ON public.questions TO authenticated, anon;
GRANT ALL ON public.questions TO service_role;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "questions_read_all" ON public.questions FOR SELECT USING (true);

-- =========== vocab_images ===========
-- term -> stock photo lookup (global, not course-scoped -- matches
-- VOCAB_IMAGES in src/data/vocab-images.ts, which is looked up by
-- lowercased term regardless of course)
CREATE TABLE public.vocab_images (
  term text PRIMARY KEY,            -- lowercased key
  url text NOT NULL,
  alt text NOT NULL,
  credit text NOT NULL
);
GRANT SELECT ON public.vocab_images TO authenticated, anon;
GRANT ALL ON public.vocab_images TO service_role;
ALTER TABLE public.vocab_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vocab_images_read_all" ON public.vocab_images FOR SELECT USING (true);

-- =========== placement_questions ===========
CREATE TABLE public.placement_questions (
  id text PRIMARY KEY,
  course text NOT NULL,
  level_id text NOT NULL REFERENCES public.levels(id),
  prompt text NOT NULL,
  choices jsonb NOT NULL,           -- string[]
  answer_index integer NOT NULL
);
CREATE INDEX ON public.placement_questions(course, level_id);
GRANT SELECT ON public.placement_questions TO authenticated, anon;
GRANT ALL ON public.placement_questions TO service_role;
ALTER TABLE public.placement_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "placement_questions_read_all" ON public.placement_questions FOR SELECT USING (true);

-- =========== scenarios ===========
-- AI roleplay personas (course-agnostic -- no French variant exists
-- today; src/data/scenarios.ts has no course field)
CREATE TABLE public.scenarios (
  id text PRIMARY KEY,
  title text NOT NULL,
  emoji text NOT NULL,
  blurb text NOT NULL,
  level text NOT NULL,              -- 'Beginner' | 'Intermediate' | 'Advanced' (own scale, not CEFR)
  system_prompt text NOT NULL,
  opener text NOT NULL
);
GRANT SELECT ON public.scenarios TO authenticated, anon;
GRANT ALL ON public.scenarios TO service_role;
ALTER TABLE public.scenarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scenarios_read_all" ON public.scenarios FOR SELECT USING (true);
