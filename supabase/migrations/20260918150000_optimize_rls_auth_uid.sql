-- Performance-only fix (2026-09-18 audit, finding M4): every RLS policy
-- below calls bare auth.uid() in its USING/WITH CHECK clause, which
-- Postgres re-evaluates once PER ROW scanned. Wrapping it as
-- (select auth.uid()) lets the planner treat it as a stable InitPlan,
-- evaluated once per query instead. No behavior change -- same predicate,
-- just evaluated more cheaply. (Audit tooling counted 31 "occurrences"
-- across USING+WITH CHECK clauses and a two-call OR condition; this
-- migration rewrites all 20 CREATE POLICY statements that reference bare
-- auth.uid() anywhere in their expression, which is full coverage
-- regardless of how the occurrences are counted.)

ALTER POLICY ad_select_own ON public.activity_days
  USING ((select auth.uid()) = user_id);

ALTER POLICY user_progress_select_own ON public.user_progress
  USING ((select auth.uid()) = user_id);

ALTER POLICY "ai_usage_select_own" ON public.ai_usage
  USING ((select auth.uid()) = user_id);

ALTER POLICY "ri_own_all" ON public.review_items
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY "ai_rate_limits_select_own" ON public.ai_rate_limits
  USING ((select auth.uid()) = user_id);

ALTER POLICY "profiles_update_own" ON public.profiles
  USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);

ALTER POLICY "profiles_insert_own" ON public.profiles
  WITH CHECK ((select auth.uid()) = id);

ALTER POLICY "user_progress_write_own" ON public.user_progress
  WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY "user_progress_update_own" ON public.user_progress
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY "lc_own" ON public.lesson_completions
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY "ad_write_own" ON public.activity_days
  WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY "ad_update_own" ON public.activity_days
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY "ua_own_all" ON public.user_achievements
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY "fr_view_own" ON public.friendships
  USING ((select auth.uid()) = user_id OR (select auth.uid()) = friend_id);

ALTER POLICY "fr_insert_own" ON public.friendships
  WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY "fr_delete_own" ON public.friendships
  USING ((select auth.uid()) = user_id);

ALTER POLICY "lp_select_own" ON public.language_progress
  USING ((select auth.uid()) = user_id);

ALTER POLICY "lp_insert_own" ON public.language_progress
  WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY "lp_update_own" ON public.language_progress
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY "lp_delete_own" ON public.language_progress
  USING ((select auth.uid()) = user_id);

-- Finding P9: missing covering index on this FK.
CREATE INDEX IF NOT EXISTS user_achievements_achievement_id_idx
  ON public.user_achievements (achievement_id);
