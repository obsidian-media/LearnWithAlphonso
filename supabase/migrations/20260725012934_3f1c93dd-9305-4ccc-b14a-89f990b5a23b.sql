
-- =========== profiles ===========
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  country text,
  avatar_seed text NOT NULL DEFAULT (substr(md5(random()::text), 1, 8)),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.profiles TO authenticated;
GRANT INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_read_all_auth" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- =========== user_progress ===========
CREATE TABLE public.user_progress (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  xp integer NOT NULL DEFAULT 0,
  streak integer NOT NULL DEFAULT 0,
  longest_streak integer NOT NULL DEFAULT 0,
  last_active_date date,
  hearts integer NOT NULL DEFAULT 5,
  hearts_refill_at timestamptz,
  streak_freezes integer NOT NULL DEFAULT 0,
  league_tier text NOT NULL DEFAULT 'bronze',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.user_progress TO authenticated;
GRANT ALL ON public.user_progress TO service_role;
ALTER TABLE public.user_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_progress_select_auth" ON public.user_progress FOR SELECT TO authenticated USING (true);
CREATE POLICY "user_progress_write_own" ON public.user_progress FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_progress_update_own" ON public.user_progress FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =========== lesson_completions ===========
CREATE TABLE public.lesson_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id text NOT NULL,
  correct integer NOT NULL,
  total integer NOT NULL,
  xp_earned integer NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, lesson_id)
);
CREATE INDEX ON public.lesson_completions(user_id);
GRANT SELECT, INSERT, UPDATE ON public.lesson_completions TO authenticated;
GRANT ALL ON public.lesson_completions TO service_role;
ALTER TABLE public.lesson_completions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lc_own" ON public.lesson_completions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =========== activity_days ===========
CREATE TABLE public.activity_days (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day date NOT NULL,
  xp_earned integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
CREATE INDEX ON public.activity_days(day);
GRANT SELECT, INSERT, UPDATE ON public.activity_days TO authenticated;
GRANT ALL ON public.activity_days TO service_role;
ALTER TABLE public.activity_days ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ad_select_auth" ON public.activity_days FOR SELECT TO authenticated USING (true);
CREATE POLICY "ad_write_own" ON public.activity_days FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ad_update_own" ON public.activity_days FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =========== achievements ===========
CREATE TABLE public.achievements (
  id text PRIMARY KEY,
  title text NOT NULL,
  description text NOT NULL,
  icon text NOT NULL,
  tier text NOT NULL,
  category text NOT NULL,
  threshold integer NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);
GRANT SELECT ON public.achievements TO authenticated, anon;
GRANT ALL ON public.achievements TO service_role;
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ach_read_all" ON public.achievements FOR SELECT USING (true);

INSERT INTO public.achievements (id, title, description, icon, tier, category, threshold, sort_order) VALUES
  ('streak_3', 'Warming up', 'Reach a 3-day streak', 'flame', 'bronze', 'streak', 3, 10),
  ('streak_7', 'One full week', 'Reach a 7-day streak', 'flame', 'silver', 'streak', 7, 11),
  ('streak_30', 'Iron habit', 'Reach a 30-day streak', 'flame', 'gold', 'streak', 30, 12),
  ('streak_100', 'Centurion', 'Reach a 100-day streak', 'flame', 'diamond', 'streak', 100, 13),
  ('xp_100', 'First strides', 'Earn 100 XP', 'bolt', 'bronze', 'xp', 100, 20),
  ('xp_500', 'Getting fluent', 'Earn 500 XP', 'bolt', 'silver', 'xp', 500, 21),
  ('xp_2000', 'Scholar', 'Earn 2,000 XP', 'bolt', 'gold', 'xp', 2000, 22),
  ('xp_10000', 'Polyglot', 'Earn 10,000 XP', 'bolt', 'diamond', 'xp', 10000, 23),
  ('perfect_1', 'Flawless', 'Finish 1 lesson with no mistakes', 'star', 'bronze', 'perfect', 1, 30),
  ('perfect_10', 'Sharp mind', 'Finish 10 perfect lessons', 'star', 'silver', 'perfect', 10, 31),
  ('perfect_50', 'Grammar sensei', 'Finish 50 perfect lessons', 'star', 'gold', 'perfect', 50, 32),
  ('lessons_5', 'Explorer', 'Complete 5 lessons', 'check', 'bronze', 'lessons', 5, 40),
  ('lessons_25', 'Committed', 'Complete 25 lessons', 'check', 'silver', 'lessons', 25, 41),
  ('lessons_100', 'Devoted', 'Complete 100 lessons', 'check', 'gold', 'lessons', 100, 42),
  ('league_promote_1', 'Rising star', 'Advance to a new league', 'shield', 'silver', 'league', 1, 50),
  ('league_promote_3', 'Ascendant', 'Advance to a league 3 times', 'shield', 'gold', 'league', 3, 51),
  ('freeze_earn_1', 'Ice reserve', 'Earn your first streak freeze', 'snow', 'bronze', 'freeze', 1, 60),
  ('freeze_earn_5', 'Cold storage', 'Bank 5 streak freezes', 'snow', 'silver', 'freeze', 5, 61);

-- =========== user_achievements ===========
CREATE TABLE public.user_achievements (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id text NOT NULL REFERENCES public.achievements(id) ON DELETE CASCADE,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  progress integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, achievement_id)
);
GRANT SELECT, INSERT, UPDATE ON public.user_achievements TO authenticated;
GRANT ALL ON public.user_achievements TO service_role;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ua_own_all" ON public.user_achievements FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =========== friendships ===========
CREATE TABLE public.friendships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  friend_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'accepted',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, friend_id)
);
CREATE INDEX ON public.friendships(user_id);
CREATE INDEX ON public.friendships(friend_id);
GRANT SELECT, INSERT, DELETE ON public.friendships TO authenticated;
GRANT ALL ON public.friendships TO service_role;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fr_view_own" ON public.friendships FOR SELECT TO authenticated USING (auth.uid() = user_id OR auth.uid() = friend_id);
CREATE POLICY "fr_insert_own" ON public.friendships FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "fr_delete_own" ON public.friendships FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- =========== auto-create profile + progress on signup ===========
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_seed)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1), 'Learner'),
    substr(md5(NEW.id::text), 1, 8)
  );
  INSERT INTO public.user_progress (user_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========== updated_at trigger ===========
CREATE OR REPLACE FUNCTION public.tg_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER touch_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
CREATE TRIGGER touch_progress_updated BEFORE UPDATE ON public.user_progress FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
