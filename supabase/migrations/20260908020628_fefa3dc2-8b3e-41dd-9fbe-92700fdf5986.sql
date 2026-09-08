ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS active_language text NOT NULL DEFAULT 'en';

ALTER TABLE public.lesson_completions ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'en';
ALTER TABLE public.review_items ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'en';

CREATE TABLE IF NOT EXISTS public.language_progress (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  language text NOT NULL,
  xp integer NOT NULL DEFAULT 0,
  cefr_level text NOT NULL DEFAULT 'A1',
  placement_level text,
  placement_score integer,
  placement_taken_at timestamptz,
  league_tier text NOT NULL DEFAULT 'bronze',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, language)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.language_progress TO authenticated;
GRANT ALL ON public.language_progress TO service_role;

ALTER TABLE public.language_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lp_select_own" ON public.language_progress FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "lp_insert_own" ON public.language_progress FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "lp_update_own" ON public.language_progress FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "lp_delete_own" ON public.language_progress FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER touch_language_progress_updated
BEFORE UPDATE ON public.language_progress
FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

INSERT INTO public.language_progress (user_id, language, xp, cefr_level, placement_level, placement_score, placement_taken_at, league_tier)
SELECT up.user_id, 'en', up.xp, up.cefr_level, up.placement_level, up.placement_score, up.placement_taken_at, up.league_tier
FROM public.user_progress up
ON CONFLICT (user_id, language) DO NOTHING;

CREATE INDEX IF NOT EXISTS review_items_user_lang_due_idx ON public.review_items (user_id, language, due_on);
CREATE INDEX IF NOT EXISTS lesson_completions_user_lang_idx ON public.lesson_completions (user_id, language);