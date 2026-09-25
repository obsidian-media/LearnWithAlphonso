-- V5 phase 5: the placement exam assesses listening and translation as well as
-- multiple choice, so its mirror table has to be able to hold them.
--
-- `choices` and `answer_index` were both NOT NULL, which no listening row
-- (answers with text, not an index) and no translate row (has no choices at
-- all) can satisfy -- the seed would have failed outright rather than quietly
-- dropping them, which is the better of the two failures but still a failure.
--
-- Worth knowing before reading further: NOTHING reads this table at runtime.
-- The app resolves placement questions from bundled content (src/data/
-- placement.ts), and scripts/seed-curriculum-db.ts is its only writer. So this
-- migration keeps a mirror faithful; it does not fix a live read path. It is
-- still worth doing, because the mirror is what anyone querying the database
-- about course content will believe.
--
-- `speak` is deliberately absent from the allowed types. The exam does not ask
-- for microphone permission during onboarding -- see PlacementQuestion's doc
-- comment for the argument -- and a CHECK that allows a shape the content
-- layer cannot produce would invite someone to add it without the argument
-- being re-made.

ALTER TABLE public.placement_questions
  ADD COLUMN type text NOT NULL DEFAULT 'mc',
  ADD COLUMN answer_text text,
  ADD COLUMN bank jsonb,
  ADD COLUMN audio_text text;

ALTER TABLE public.placement_questions
  ALTER COLUMN choices DROP NOT NULL,
  ALTER COLUMN answer_index DROP NOT NULL;

ALTER TABLE public.placement_questions
  ADD CONSTRAINT placement_questions_type_check
  CHECK (type IN ('mc', 'listening', 'translate'));

-- Mirrors public.questions' shape check: each type carries exactly the columns
-- it can answer from, and none of the others.
ALTER TABLE public.placement_questions
  ADD CONSTRAINT placement_question_shape_matches_type CHECK (
    (type = 'mc' AND choices IS NOT NULL AND answer_index IS NOT NULL
       AND answer_text IS NULL AND bank IS NULL AND audio_text IS NULL)
    OR
    (type = 'listening' AND choices IS NOT NULL AND answer_text IS NOT NULL
       AND audio_text IS NOT NULL AND answer_index IS NULL AND bank IS NULL)
    OR
    (type = 'translate' AND bank IS NOT NULL AND answer_text IS NOT NULL
       AND choices IS NULL AND answer_index IS NULL AND audio_text IS NULL)
  );
