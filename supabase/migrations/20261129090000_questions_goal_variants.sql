-- Goal-flavoured question variants (src/lib/goal-variants.ts). A question may be shown in a version written for the
-- learner's goal; the client names the goal of the version it showed with each answer (`variantGoal`), and grading
-- (complete-lesson, grade-review) accepts an answer that is right in the base question OR in that one variant, never
-- another goal's. The variants therefore have to be readable by those Edge Functions: this column holds them, seeded from src/data/goal-variants/*.json by
-- scripts/seed-curriculum-db.ts (CI's "Seed curriculum data" step runs it after migrations on every deploy).
--
-- Shape: a JSON array, one entry per goal, each holding its prompt and only the answer-bearing columns its type uses, in the row's
-- own shape, e.g. {"goal":"travel","choices":["at","on","in","to"],"answer_index":0} (mc),
-- {"goal":"work","bank":[...],"answer_text":"at"} (fill), {"goal":"school","answer_text":"..."} (speak/listening),
-- {"goal":"travel","bank":["wording one","wording two"]} (translate). NULL means the question has no variants, which
-- is every row today and every row an old seed writes, so the Edge Functions behave exactly as before.
--
-- No new grant is needed: the column rides the table's existing privileges (the questions table is public content).
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS goal_variants jsonb;

ALTER TABLE public.questions
  DROP CONSTRAINT IF EXISTS questions_goal_variants_is_array;
ALTER TABLE public.questions
  ADD CONSTRAINT questions_goal_variants_is_array
  CHECK (goal_variants IS NULL OR jsonb_typeof(goal_variants) = 'array');
