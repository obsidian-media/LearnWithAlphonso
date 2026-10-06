-- Learning goal planner (docs/superpowers/specs/2026-10-05-learning-goal-planner-design.md).
-- One goal per user and course: "finish <target_level> by <target_date>". The plan itself
-- (lessons per week, status) is computed by /api/learning-goal, never stored.
-- Writes go through the route with the service role after validation, so clients get
-- SELECT only. VERSIONING: 20261006100000 sorts after the latest migration
-- (20261005120000_saved_word_review_items.sql).

CREATE TABLE public.learning_goals (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  language text NOT NULL CHECK (language IN ('en', 'fr', 'es')),
  target_level text NOT NULL CHECK (target_level IN ('A1', 'A2', 'B1', 'B2', 'C1')),
  target_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, language)
);

GRANT SELECT ON public.learning_goals TO authenticated;
GRANT ALL ON public.learning_goals TO service_role;
ALTER TABLE public.learning_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "learning_goals_select_own" ON public.learning_goals
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
