-- Solo weekly challenges -- V4 candidate #7 (deeper gamification,
-- docs/superpowers/specs/2026-09-22-deeper-gamification-design.md).
-- challenge_templates is DB-seeded content (title/description),
-- matching the existing achievements table's pattern rather than the
-- spec's original "hardcoded TS constants" framing -- locked down
-- during implementation planning as the closer, more consistent fit.
CREATE TABLE public.challenge_templates (
  id text PRIMARY KEY,
  title text NOT NULL,
  description text NOT NULL,
  type text NOT NULL CHECK (type IN ('lesson_count', 'perfect_score_count', 'study_every_day')),
  threshold integer NOT NULL
);
GRANT SELECT ON public.challenge_templates TO authenticated;
GRANT ALL ON public.challenge_templates TO service_role;
ALTER TABLE public.challenge_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "challenge_templates_select_all" ON public.challenge_templates FOR SELECT TO authenticated USING (true);

INSERT INTO public.challenge_templates (id, title, description, type, threshold) VALUES
  ('lessons_3', 'Getting started', 'Complete 3 lessons this week', 'lesson_count', 3),
  ('lessons_5', 'On a roll', 'Complete 5 lessons this week', 'lesson_count', 5),
  ('lessons_10', 'Deep focus', 'Complete 10 lessons this week', 'lesson_count', 10),
  ('perfect_2', 'Sharp shooter', 'Score perfectly on 2 lessons this week', 'perfect_score_count', 2),
  ('perfect_3', 'Precision', 'Score perfectly on 3 lessons this week', 'perfect_score_count', 3),
  ('every_day', 'Full attendance', 'Study every day this week', 'study_every_day', 7);

CREATE TABLE public.challenge_completions (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  template_id text NOT NULL REFERENCES public.challenge_templates(id),
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, week_start, template_id)
);
GRANT ALL ON public.challenge_completions TO service_role;
ALTER TABLE public.challenge_completions ENABLE ROW LEVEL SECURITY;
-- No client policy -- only get_weekly_challenges (SECURITY DEFINER)
-- writes here, same hardened-table pattern as team_weekly_rewards.

-- Selects 3 of the 6 templates deterministically by week, computes
-- each one's live progress + completed status, and grants the reward
-- (once, guarded by challenge_completions' primary key) the moment a
-- threshold is newly crossed -- all resolved as a side effect of this
-- one read call, same lazy-resolution shape as the rest of this
-- feature.
CREATE OR REPLACE FUNCTION public.get_weekly_challenges()
RETURNS TABLE(template_id text, title text, description text, type text, threshold integer, progress integer, completed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  wk date := (current_date - ((extract(isodow from current_date)::int) - 1));
  active_lang text;
  tpl RECORD;
  computed_progress integer;
  is_complete boolean;
BEGIN
  IF me IS NULL THEN
    RETURN;
  END IF;

  SELECT p.active_language INTO active_lang FROM public.profiles p WHERE p.id = me;

  FOR tpl IN
    SELECT ct.id, ct.title, ct.description, ct.type, ct.threshold
    FROM public.challenge_templates ct
    ORDER BY hashtext(ct.id || wk::text)
    LIMIT 3
  LOOP
    IF tpl.type = 'lesson_count' THEN
      SELECT count(*) INTO computed_progress FROM public.lesson_completions lc
        WHERE lc.user_id = me AND lc.completed_at >= wk;
    ELSIF tpl.type = 'perfect_score_count' THEN
      SELECT count(*) INTO computed_progress FROM public.lesson_completions lc
        WHERE lc.user_id = me AND lc.completed_at >= wk AND lc.correct = lc.total;
    ELSE -- study_every_day
      SELECT count(DISTINCT ad.day) INTO computed_progress FROM public.activity_days ad
        WHERE ad.user_id = me AND ad.day >= wk;
    END IF;

    is_complete := EXISTS (
      SELECT 1 FROM public.challenge_completions cc
      WHERE cc.user_id = me AND cc.week_start = wk AND cc.template_id = tpl.id
    );

    IF NOT is_complete AND computed_progress >= tpl.threshold THEN
      INSERT INTO public.challenge_completions (user_id, week_start, template_id)
      VALUES (me, wk, tpl.id)
      ON CONFLICT DO NOTHING;
      IF FOUND THEN
        UPDATE public.language_progress SET xp = xp + 100
        WHERE user_id = me AND language = active_lang;
        is_complete := true;
      END IF;
    END IF;

    RETURN QUERY SELECT tpl.id, tpl.title, tpl.description, tpl.type, tpl.threshold, computed_progress, is_complete;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.get_weekly_challenges() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_weekly_challenges() TO authenticated;
