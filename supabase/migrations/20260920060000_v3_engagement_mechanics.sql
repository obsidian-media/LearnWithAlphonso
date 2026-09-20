-- V3 package 2: Engagement Mechanics (weekly quests, friend duels,
-- expanded achievement catalog, streak-freeze economy expansion). See
-- CHANGELOG.md's V3 entry for the full package list/sequencing.

-- ---------- Expanded achievement catalog ----------
-- New tiers on existing categories only -- the evaluation loop in
-- completeLessonRemote (src/lib/sync.functions.ts) and its Deno port
-- (complete-lesson/index.ts) is already generic over whatever's in this
-- table / src/data/achievements.ts's ACHIEVEMENTS array (kept in sync by
-- hand, same established pattern as the curriculum tables). No new
-- category means no new `stats` derivation logic needed.
INSERT INTO public.achievements (id, title, description, icon, tier, category, threshold, sort_order) VALUES
  ('streak_365', 'Unbreakable', 'Reach a 365-day streak', 'flame', 'diamond', 'streak', 365, 40),
  ('xp_25000', 'Grandmaster', 'Earn 25,000 XP', 'bolt', 'diamond', 'xp', 25000, 41),
  ('perfect_100', 'Perfectionist', 'Finish 100 perfect lessons', 'star', 'diamond', 'perfect', 100, 42),
  ('lessons_250', 'Marathoner', 'Complete 250 lessons', 'check', 'diamond', 'lessons', 250, 43),
  ('freeze_earn_10', 'Deep freeze', 'Bank 10 streak freezes', 'snow', 'gold', 'freeze', 10, 44),
  ('league_promote_5', 'Champion', 'Advance to a new league 5 times', 'shield', 'diamond', 'league', 5, 45)
ON CONFLICT (id) DO NOTHING;

-- ---------- Streak-freeze economy expansion ----------
-- Mirrors buy_heart_with_xp (supabase/migrations/20260918141500_hearts_economy_rpcs.sql)
-- exactly -- same row-locked atomicity reasoning, same RPC-first pattern
-- established by 20260920050000_revoke_direct_gamification_writes.sql.
-- No cap on streak_freezes (user_progress_streak_freezes_nonneg only
-- requires >= 0) -- an intentional XP sink with no artificial ceiling,
-- unlike hearts (capped at 5 since they gate lesson attempts directly).
CREATE OR REPLACE FUNCTION public.buy_streak_freeze_with_xp(_course text, _cost integer DEFAULT 75)
RETURNS TABLE(ok boolean, reason text, streak_freezes integer, xp integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  me uuid := auth.uid();
  cur_freezes integer;
  cur_xp integer;
BEGIN
  IF me IS NULL THEN
    RETURN QUERY SELECT false, 'unauthenticated', NULL::integer, NULL::integer;
    RETURN;
  END IF;

  SELECT up.streak_freezes INTO cur_freezes
    FROM public.user_progress up WHERE up.user_id = me FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.user_progress (user_id) VALUES (me)
      ON CONFLICT (user_id) DO NOTHING;
    cur_freezes := 0;
  END IF;

  SELECT lp.xp INTO cur_xp FROM public.language_progress lp
    WHERE lp.user_id = me AND lp.language = _course FOR UPDATE;
  IF NOT FOUND OR cur_xp IS NULL THEN
    cur_xp := 0;
  END IF;

  IF cur_xp < _cost THEN
    RETURN QUERY SELECT false, 'insufficient-xp', cur_freezes, cur_xp;
    RETURN;
  END IF;

  UPDATE public.user_progress SET streak_freezes = cur_freezes + 1 WHERE user_id = me;
  UPDATE public.language_progress SET xp = cur_xp - _cost WHERE user_id = me AND language = _course;

  RETURN QUERY SELECT true, NULL::text, cur_freezes + 1, cur_xp - _cost;
END;
$$;

REVOKE ALL ON FUNCTION public.buy_streak_freeze_with_xp(text, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.buy_streak_freeze_with_xp(text, integer) TO authenticated, service_role;

-- ---------- Friend duels ----------
-- Head-to-head XP competition over a fixed window between two accepted
-- friends. Lazily resolved on read (get_duel_status computes the winner
-- from current language_progress.xp once ends_at has passed) rather than
-- needing a cron job or scheduled function -- this project has no
-- server-side scheduling infrastructure yet (see docs/v3-kickoffs/
-- 01-real-push-notifications.md's "Server-side trigger mechanism" section
-- for why that's a real open question, deliberately not solved here).
CREATE TABLE public.duels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenger_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  opponent_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course text NOT NULL DEFAULT 'en' CHECK (course IN ('en', 'fr')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'declined', 'completed')),
  challenger_xp_start integer,
  opponent_xp_start integer,
  winner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  CONSTRAINT duels_distinct_players CHECK (challenger_id <> opponent_id)
);

ALTER TABLE public.duels ENABLE ROW LEVEL SECURITY;

CREATE POLICY duels_select_own ON public.duels FOR SELECT
  USING (auth.uid() = challenger_id OR auth.uid() = opponent_id);
-- Clients should call get_my_duels() below, not this directly -- it's the
-- only path that lazily resolves an overdue duel and computes current XP.
-- Grant kept for RLS-policy correctness (a policy with no underlying
-- grant is silently inert), not as the intended read path.
GRANT SELECT ON public.duels TO authenticated;

-- No direct INSERT/UPDATE grant -- every write goes through the RPCs
-- below (SECURITY DEFINER), same pattern as every gamification write
-- since 20260920050000. A duel can only be created between accepted
-- friends (checked in create_duel), which a plain RLS policy on this
-- table alone couldn't express without a subquery repeated on every write.

CREATE OR REPLACE FUNCTION public.create_duel(_opponent_id uuid, _course text DEFAULT 'en')
RETURNS TABLE(ok boolean, reason text, duel_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  me uuid := auth.uid();
  new_id uuid;
BEGIN
  IF me IS NULL THEN
    RETURN QUERY SELECT false, 'unauthenticated', NULL::uuid;
    RETURN;
  END IF;
  IF _opponent_id = me THEN
    RETURN QUERY SELECT false, 'cannot-duel-yourself', NULL::uuid;
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.friendships
    WHERE user_id = me AND friend_id = _opponent_id AND status = 'accepted'
  ) THEN
    RETURN QUERY SELECT false, 'not-friends', NULL::uuid;
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.duels
    WHERE status IN ('pending', 'active')
      AND ((challenger_id = me AND opponent_id = _opponent_id) OR (challenger_id = _opponent_id AND opponent_id = me))
  ) THEN
    RETURN QUERY SELECT false, 'duel-already-open', NULL::uuid;
    RETURN;
  END IF;

  INSERT INTO public.duels (challenger_id, opponent_id, course)
  VALUES (me, _opponent_id, _course)
  RETURNING id INTO new_id;

  RETURN QUERY SELECT true, NULL::text, new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_duel(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_duel(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.respond_to_duel(_duel_id uuid, _accept boolean, _duration_days integer DEFAULT 3)
RETURNS TABLE(ok boolean, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  me uuid := auth.uid();
  d public.duels;
  my_xp integer;
  opp_xp integer;
BEGIN
  IF me IS NULL THEN
    RETURN QUERY SELECT false, 'unauthenticated';
    RETURN;
  END IF;

  SELECT * INTO d FROM public.duels WHERE id = _duel_id AND opponent_id = me AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'not-found';
    RETURN;
  END IF;

  IF NOT _accept THEN
    UPDATE public.duels SET status = 'declined' WHERE id = _duel_id;
    RETURN QUERY SELECT true, NULL::text;
    RETURN;
  END IF;

  SELECT xp INTO my_xp FROM public.language_progress WHERE user_id = d.opponent_id AND language = d.course;
  SELECT xp INTO opp_xp FROM public.language_progress WHERE user_id = d.challenger_id AND language = d.course;

  UPDATE public.duels SET
    status = 'active',
    opponent_xp_start = COALESCE(my_xp, 0),
    challenger_xp_start = COALESCE(opp_xp, 0),
    -- Clamped 1-14 days -- no reward is tied to duration (winner_id is
    -- bragging rights only, no XP/hearts payout), so this isn't a trust
    -- boundary, just basic product sanity against a degenerate value.
    ends_at = now() + make_interval(days => GREATEST(1, LEAST(_duration_days, 14)))
    WHERE id = _duel_id;

  RETURN QUERY SELECT true, NULL::text;
END;
$$;

REVOKE ALL ON FUNCTION public.respond_to_duel(uuid, boolean, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.respond_to_duel(uuid, boolean, integer) TO authenticated, service_role;

-- Read + lazy-resolve in one call: any active duel whose ends_at has
-- passed gets its winner computed and status flipped to 'completed' as a
-- side effect of this SELECT, so no caller needs to poll separately for
-- "is this duel actually over yet."
CREATE OR REPLACE FUNCTION public.get_my_duels()
RETURNS TABLE(
  duel_id uuid,
  challenger_id uuid,
  opponent_id uuid,
  course text,
  status text,
  challenger_xp_start integer,
  opponent_xp_start integer,
  challenger_xp_now integer,
  opponent_xp_now integer,
  winner_id uuid,
  ends_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN RETURN; END IF;

  -- Resolve any active duel of mine whose window has closed. Scalar
  -- subqueries (not a FROM-join) so a player who never touched
  -- language_progress for this course yet still resolves correctly
  -- (COALESCE to 0) instead of silently not matching an inner join.
  UPDATE public.duels d SET
    status = 'completed',
    winner_id = CASE
      WHEN (COALESCE((SELECT xp FROM public.language_progress WHERE user_id = d.challenger_id AND language = d.course), 0) - d.challenger_xp_start)
         > (COALESCE((SELECT xp FROM public.language_progress WHERE user_id = d.opponent_id AND language = d.course), 0) - d.opponent_xp_start)
        THEN d.challenger_id
      WHEN (COALESCE((SELECT xp FROM public.language_progress WHERE user_id = d.opponent_id AND language = d.course), 0) - d.opponent_xp_start)
         > (COALESCE((SELECT xp FROM public.language_progress WHERE user_id = d.challenger_id AND language = d.course), 0) - d.challenger_xp_start)
        THEN d.opponent_id
      ELSE NULL
    END
  WHERE d.status = 'active' AND d.ends_at <= now()
    AND (d.challenger_id = me OR d.opponent_id = me);

  RETURN QUERY
  SELECT
    d.id, d.challenger_id, d.opponent_id, d.course, d.status,
    d.challenger_xp_start, d.opponent_xp_start,
    COALESCE(lp_c.xp, 0), COALESCE(lp_o.xp, 0),
    d.winner_id, d.ends_at
  FROM public.duels d
  LEFT JOIN public.language_progress lp_c ON lp_c.user_id = d.challenger_id AND lp_c.language = d.course
  LEFT JOIN public.language_progress lp_o ON lp_o.user_id = d.opponent_id AND lp_o.language = d.course
  WHERE d.challenger_id = me OR d.opponent_id = me
  ORDER BY d.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_duels() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_my_duels() TO authenticated, service_role;

-- ---------- Weekly quests ----------
-- Progress is computed on the fly from already-durable data
-- (activity_days for XP, lesson_completions for lesson count) rather than
-- a separately-incremented counter -- no new write path needed for
-- tracking, only for claiming a reward once.
--
-- The catalog (metric/target/xp_reward) lives in this table, mirroring
-- src/data/quests.ts (kept in sync by hand, same established pattern as
-- achievements) -- NOT because a client ever needs the DB copy directly
-- (the web/iOS UI reads the static TS/Swift catalog, same as
-- achievements), but because claim_weekly_quest below must look a quest's
-- real target/reward up server-side by _quest_id rather than trust
-- caller-supplied values -- an earlier draft of this migration took
-- _metric/_target/_xp_reward as RPC parameters directly, which would have
-- let any caller invoke the RPC via raw PostgREST with _target=0,
-- _xp_reward=999999999 and pay itself out arbitrary XP. Same trust-
-- boundary class as 20260920050000's whole point.
CREATE TABLE public.weekly_quests (
  id text PRIMARY KEY,
  title text NOT NULL,
  description text NOT NULL,
  icon text NOT NULL,
  metric text NOT NULL CHECK (metric IN ('xp_earned', 'lessons_completed')),
  target integer NOT NULL CHECK (target > 0),
  xp_reward integer NOT NULL CHECK (xp_reward > 0),
  sort_order integer NOT NULL DEFAULT 0
);

ALTER TABLE public.weekly_quests ENABLE ROW LEVEL SECURITY;
CREATE POLICY weekly_quests_read_all ON public.weekly_quests FOR SELECT USING (true);
GRANT SELECT ON public.weekly_quests TO authenticated, anon;

INSERT INTO public.weekly_quests (id, title, description, icon, metric, target, xp_reward, sort_order) VALUES
  ('weekly_xp_150', 'Weekly Grinder', 'Earn 150 XP this week', 'bolt', 'xp_earned', 150, 30, 1),
  ('weekly_xp_500', 'XP Marathon', 'Earn 500 XP this week', 'bolt', 'xp_earned', 500, 100, 2),
  ('weekly_lessons_5', 'Lesson Streak', 'Complete 5 lessons this week', 'check', 'lessons_completed', 5, 40, 3)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE public.user_weekly_quest_claims (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quest_id text NOT NULL,
  week_start date NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, quest_id, week_start)
);

ALTER TABLE public.user_weekly_quest_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_weekly_quest_claims_select_own ON public.user_weekly_quest_claims FOR SELECT
  USING (auth.uid() = user_id);
-- Plain read grant is fine here (unlike the gamification-value tables) --
-- this is just a claim ledger (no XP/hearts/streak column to cheat by
-- reading), RLS already scopes it to the caller's own rows.
GRANT SELECT ON public.user_weekly_quest_claims TO authenticated;

-- No direct INSERT grant -- claim_weekly_quest re-verifies the quest was
-- actually completed server-side before recording a claim and paying out
-- its reward, the same derive-don't-trust pattern as every other reward
-- path in this codebase.
CREATE OR REPLACE FUNCTION public.claim_weekly_quest(_quest_id text, _course text, _week_start date)
RETURNS TABLE(ok boolean, reason text, xp integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  me uuid := auth.uid();
  q public.weekly_quests;
  progress integer;
  cur_xp integer;
BEGIN
  IF me IS NULL THEN
    RETURN QUERY SELECT false, 'unauthenticated', NULL::integer;
    RETURN;
  END IF;
  IF _week_start > CURRENT_DATE OR _week_start < CURRENT_DATE - INTERVAL '7 days' THEN
    RETURN QUERY SELECT false, 'invalid-week', NULL::integer;
    RETURN;
  END IF;

  SELECT * INTO q FROM public.weekly_quests WHERE id = _quest_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'unknown-quest', NULL::integer;
    RETURN;
  END IF;

  IF q.metric = 'xp_earned' THEN
    SELECT COALESCE(SUM(xp_earned), 0) INTO progress FROM public.activity_days
      WHERE user_id = me AND day >= _week_start AND day < _week_start + INTERVAL '7 days';
  ELSE -- 'lessons_completed', the only other CHECK-allowed value
    SELECT COUNT(*) INTO progress FROM public.lesson_completions
      WHERE user_id = me AND language = _course
        AND completed_at >= _week_start AND completed_at < _week_start + INTERVAL '7 days';
  END IF;

  IF progress < q.target THEN
    RETURN QUERY SELECT false, 'not-yet-completed', NULL::integer;
    RETURN;
  END IF;

  INSERT INTO public.user_weekly_quest_claims (user_id, quest_id, week_start)
    VALUES (me, _quest_id, _week_start)
    ON CONFLICT (user_id, quest_id, week_start) DO NOTHING;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'already-claimed', NULL::integer;
    RETURN;
  END IF;

  SELECT xp INTO cur_xp FROM public.language_progress lp WHERE lp.user_id = me AND lp.language = _course FOR UPDATE;
  IF NOT FOUND OR cur_xp IS NULL THEN cur_xp := 0; END IF;
  UPDATE public.language_progress SET xp = cur_xp + q.xp_reward WHERE user_id = me AND language = _course;

  RETURN QUERY SELECT true, NULL::text, cur_xp + q.xp_reward;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_weekly_quest(text, text, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.claim_weekly_quest(text, text, date) TO authenticated, service_role;
