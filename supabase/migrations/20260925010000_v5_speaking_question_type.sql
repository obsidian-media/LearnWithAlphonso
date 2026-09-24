-- V5 phase 2B: a "speak" question type alongside mc/fill/reorder/listening.
--
-- Its row shape is a FOURTH: answer_text alone, with choices, bank and
-- answer_index all null. A speaking question has no options to choose between
-- and no word bank -- only the phrase the learner is expected to say, which is
-- compared against a speech-to-text transcript.
--
-- grade-review's Deno function grades any non-'mc' row against answer_text, so
-- a speak row grades there without a new branch. It does need the SPOKEN
-- comparison rather than a bare trim/lowercase, though: a transcript
-- legitimately varies ("she is a doctor" for "She's a doctor."), and without
-- that the server would mark wrong what the player had already told the learner
-- was right, lapsing the item. That change ships in the same commit as this
-- migration, in both src/lib/srs.ts and the Deno mirror.
ALTER TABLE public.questions DROP CONSTRAINT questions_type_check;
ALTER TABLE public.questions ADD CONSTRAINT questions_type_check
  CHECK (type IN ('mc', 'fill', 'reorder', 'listening', 'speak'));

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
  OR
  (type = 'speak' AND answer_text IS NOT NULL
     AND choices IS NULL AND bank IS NULL AND answer_index IS NULL)
);
