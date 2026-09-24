-- V5 phase 4: a "translate" question type alongside mc/fill/reorder/listening/
-- speak. The learner writes a phrase themselves and it is graded against a
-- curated list of acceptable wordings.
--
-- Its row shape is a FIFTH, and deliberately built from columns that already
-- exist: `bank` (already a jsonb string[] for fill/reorder) carries the
-- acceptable phrasings, and `answer_text` carries the canonical one. So it
-- joins fill/reorder in the existing branch of the shape check rather than
-- needing one of its own, and grade-review's generic non-mc comparison already
-- has something sane to compare against.
--
-- That generic comparison is NOT the real grading rule, though: a translation
-- is graded locally against the whole `bank` list first, and only what that
-- rejects is sent to an AI grader. Both halves run server-side in all three
-- places that grade -- /api/grade-translation for the lesson player,
-- gradeReview for web review, and grade-review for iOS review -- because a
-- verdict the player shows and the scheduler contradicts is the failure mode
-- this app has already been bitten by once, with the speaking type.
ALTER TABLE public.questions DROP CONSTRAINT questions_type_check;
ALTER TABLE public.questions ADD CONSTRAINT questions_type_check
  CHECK (type IN ('mc', 'fill', 'reorder', 'listening', 'speak', 'translate'));

ALTER TABLE public.questions DROP CONSTRAINT question_shape_matches_type;
ALTER TABLE public.questions ADD CONSTRAINT question_shape_matches_type CHECK (
  (type = 'mc' AND choices IS NOT NULL AND answer_index IS NOT NULL
     AND bank IS NULL AND answer_text IS NULL)
  OR
  (type IN ('fill', 'reorder', 'translate') AND bank IS NOT NULL
     AND answer_text IS NOT NULL AND choices IS NULL AND answer_index IS NULL)
  OR
  (type = 'listening' AND choices IS NOT NULL AND answer_text IS NOT NULL
     AND bank IS NULL AND answer_index IS NULL)
  OR
  (type = 'speak' AND answer_text IS NOT NULL
     AND choices IS NULL AND bank IS NULL AND answer_index IS NULL)
);
