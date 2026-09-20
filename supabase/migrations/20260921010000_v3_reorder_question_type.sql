-- V3 package 4a: a new "reorder" (sentence-reordering) question type,
-- alongside the existing 'mc'/'fill'. Row shape is identical to 'fill'
-- (bank + answer_text set, choices/answer_index null) -- a reorder
-- question's `bank` column holds the shuffled word-pool tokens and
-- `answer_text` holds the correctly-ordered sentence, same columns
-- 'fill' already uses for its own bank/answer split. grade-review's Deno
-- function (supabase/functions/grade-review/index.ts) already treats any
-- non-'mc' row as a plain trimmed-text comparison against `answer_text`,
-- so no code change is needed there for this to grade correctly.
ALTER TABLE public.questions DROP CONSTRAINT questions_type_check;
ALTER TABLE public.questions ADD CONSTRAINT questions_type_check
  CHECK (type IN ('mc', 'fill', 'reorder'));

ALTER TABLE public.questions DROP CONSTRAINT question_shape_matches_type;
ALTER TABLE public.questions ADD CONSTRAINT question_shape_matches_type CHECK (
  (type = 'mc' AND choices IS NOT NULL AND answer_index IS NOT NULL
     AND bank IS NULL AND answer_text IS NULL)
  OR
  (type IN ('fill', 'reorder') AND bank IS NOT NULL AND answer_text IS NOT NULL
     AND choices IS NULL AND answer_index IS NULL)
);
