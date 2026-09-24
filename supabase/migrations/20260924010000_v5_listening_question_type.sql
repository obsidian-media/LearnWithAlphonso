-- V5 phase 2A: a new "listening" question type alongside 'mc'/'fill'/'reorder'.
--
-- Its row shape is a THIRD shape, not a reuse of either existing one: it sets
-- `choices` (like 'mc', since the learner picks from options) together with
-- `answer_text` (like 'fill'/'reorder', since the variant stores the correct
-- choice's text rather than its index). The existing constraint allowed only
-- choices+answer_index or bank+answer_text, so without this widening every
-- listening row would be rejected outright.
--
-- Storing the answer as text rather than an index is deliberate and is what
-- makes grading uniform: grade-review's Deno function
-- (supabase/functions/grade-review/index.ts) already treats any non-'mc' row as
-- a trimmed-text comparison against `answer_text`, so listening grades
-- correctly there with no code change -- the same reasoning the 'reorder'
-- migration relied on.
--
-- Known gap, unchanged by this migration: there is still no audio_text column,
-- so a seeded listening row carries its choices but not the sentence to speak.
-- That predates this type (the older 'mc' questions carrying `audioText` lose
-- it too) and is harmless while both clients read the bundled course rather
-- than these tables. Adding the column is a separate change.
ALTER TABLE public.questions DROP CONSTRAINT questions_type_check;
ALTER TABLE public.questions ADD CONSTRAINT questions_type_check
  CHECK (type IN ('mc', 'fill', 'reorder', 'listening'));

ALTER TABLE public.questions DROP CONSTRAINT question_shape_matches_type;
ALTER TABLE public.questions ADD CONSTRAINT question_shape_matches_type CHECK (
  (type = 'mc' AND choices IS NOT NULL AND answer_index IS NOT NULL
     AND bank IS NULL AND answer_text IS NULL)
  OR
  (type IN ('fill', 'reorder') AND bank IS NOT NULL AND answer_text IS NOT NULL
     AND choices IS NULL AND answer_index IS NULL)
  OR
  (type = 'listening' AND choices IS NOT NULL AND answer_text IS NOT NULL
     AND bank IS NULL AND answer_index IS NULL)
);
