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

-- Open ("anyone") duel matchmaking -- extends the existing friend-only
-- duels (create_duel requires an accepted friendship) with a live
-- queue: join, and either get matched instantly with another waiting
-- entry, or become the new waiting entry yourself (the same table
-- serves both a live match and a "bulletin board" of waiting
-- challenges, per the design brainstorm).
--
-- Real bug found while implementing this (not part of the original
-- spec/plan): duels.course still has CHECK (course IN ('en', 'fr'))
-- -- never updated for the Spanish course launch (V4 #1). This
-- already silently breaks Spanish friend-duels today via
-- create_duel, and would identically break Spanish open-duel
-- matchmaking here. Fixed below by replacing that check constraint
-- (found via pg_constraint rather than assuming its auto-generated
-- name, since this repo has no local Postgres to verify against).
DO $$
DECLARE
  con record;
BEGIN
  FOR con IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.duels'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%course%'
  LOOP
    EXECUTE format('ALTER TABLE public.duels DROP CONSTRAINT %I', con.conname);
  END LOOP;
END $$;
ALTER TABLE public.duels ADD CONSTRAINT duels_course_check CHECK (course IN ('en', 'fr', 'es'));

CREATE TABLE public.duel_queue (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  course text NOT NULL,
  cefr_level text NOT NULL,
  match_by_level boolean NOT NULL DEFAULT true,
  queued_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.duel_queue TO service_role;
ALTER TABLE public.duel_queue ENABLE ROW LEVEL SECURITY;
-- No client policy -- only join_open_duel_queue/leave_duel_queue
-- (SECURITY DEFINER) touch this table.

CREATE OR REPLACE FUNCTION public.join_open_duel_queue(_course text, _match_by_level boolean DEFAULT true)
RETURNS TABLE(matched boolean, duel_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  my_level text;
  candidate_user uuid;
  levels text[] := ARRAY['A1', 'A2', 'B1', 'B2', 'C1'];
  new_duel_id uuid;
BEGIN
  IF me IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid;
    RETURN;
  END IF;

  SELECT lp.cefr_level INTO my_level FROM public.language_progress lp WHERE lp.user_id = me AND lp.language = _course;
  my_level := COALESCE(my_level, 'A1');

  -- Opportunistic cleanup of stale entries (>10 min), no cron needed.
  DELETE FROM public.duel_queue WHERE queued_at < now() - interval '10 minutes';

  -- FOR UPDATE SKIP LOCKED: the standard safe-concurrent-queue pattern
  -- -- if two callers run this at nearly the same instant, they can't
  -- both grab the same waiting row (self-critique finding from the
  -- design brainstorm).
  SELECT dq.user_id INTO candidate_user
  FROM public.duel_queue dq
  WHERE dq.course = _course
    AND dq.user_id != me
    AND (
      (_match_by_level AND dq.match_by_level AND
        abs(array_position(levels, dq.cefr_level) - array_position(levels, my_level)) <= 1)
      OR NOT _match_by_level
      OR NOT dq.match_by_level
    )
  ORDER BY dq.queued_at
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF candidate_user IS NOT NULL THEN
    DELETE FROM public.duel_queue WHERE user_id = candidate_user;
    DELETE FROM public.duel_queue WHERE user_id = me;
    INSERT INTO public.duels (challenger_id, opponent_id, course)
    VALUES (me, candidate_user, _course)
    RETURNING id INTO new_duel_id;
    RETURN QUERY SELECT true, new_duel_id;
    RETURN;
  END IF;

  INSERT INTO public.duel_queue (user_id, course, cefr_level, match_by_level)
  VALUES (me, _course, my_level, _match_by_level)
  ON CONFLICT (user_id) DO UPDATE SET course = _course, cefr_level = my_level, match_by_level = _match_by_level, queued_at = now();
  RETURN QUERY SELECT false, NULL::uuid;
END;
$$;

CREATE OR REPLACE FUNCTION public.leave_duel_queue()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.duel_queue WHERE user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.join_open_duel_queue(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_open_duel_queue(text, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.leave_duel_queue() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_duel_queue() TO authenticated;
