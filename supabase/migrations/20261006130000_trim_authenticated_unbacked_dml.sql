-- BACKLOG 0.0-ae follow-up 1 / docs/database-privileges.md: remove the INSERT/UPDATE/DELETE privileges that
-- `authenticated` held with no RLS policy behind them.
--
-- A table privilege with no matching policy does nothing: RLS denies the INSERT/UPDATE or matches zero rows for
-- UPDATE/DELETE. These are leftovers of Supabase's "everything for everyone" default (see 20261006120000). The list
-- below was audited on 2026-10-06 against pg_policies on the live database, against every web, Edge Function, iOS
-- and Android write path (all use a policy-backed operation or the service role, after the one exception found, completeLessonRemote's friend_activity_events insert, was moved to the service role in the same PR), and against the public functions
-- (no SECURITY INVOKER function writes). The only caller that relied on one of them as a silent no-op was
-- deleteMyAccount's pre-delete loop, which no longer lists those tables (ON DELETE CASCADE removes the rows).
--
-- Deliberately NOT done: SELECT. A table with no SELECT policy returns no rows today; revoking would turn that
-- into a permission error for any client that still reads it. That is follow-up 2's territory.
-- Not touched: anon, service_role, column-level grants (teams keeps its column SELECT), policies.
--
-- ROLLBACK (re-adds exactly what this removed; harmless to RLS because the policies are unchanged):
--   GRANT DELETE, INSERT, UPDATE ON public.achievements TO authenticated;
--   GRANT DELETE ON public.activity_days TO authenticated;
--   GRANT DELETE, INSERT, UPDATE ON public.ai_rate_limits TO authenticated;
--   GRANT DELETE, INSERT, UPDATE ON public.ai_usage TO authenticated;
--   GRANT UPDATE ON public.blocked_users TO authenticated;
--   GRANT DELETE, INSERT, UPDATE ON public.challenge_completions TO authenticated;
--   GRANT DELETE, INSERT, UPDATE ON public.challenge_templates TO authenticated;
--   GRANT DELETE, UPDATE ON public.content_reports TO authenticated;
--   GRANT DELETE, INSERT, UPDATE ON public.duel_queue TO authenticated;
--   GRANT DELETE, INSERT, UPDATE ON public.duels TO authenticated;
--   GRANT DELETE, INSERT, UPDATE ON public.friend_activity_events TO authenticated;
--   GRANT DELETE, INSERT, UPDATE ON public.friend_invite_codes TO authenticated;
--   GRANT UPDATE ON public.friendships TO authenticated;
--   GRANT DELETE, INSERT, UPDATE ON public.lessons TO authenticated;
--   GRANT DELETE, INSERT, UPDATE ON public.levels TO authenticated;
--   GRANT DELETE ON public.nudges TO authenticated;
--   GRANT DELETE, INSERT, UPDATE ON public.placement_questions TO authenticated;
--   GRANT DELETE, INSERT, UPDATE ON public.podcast_transcripts TO authenticated;
--   GRANT DELETE ON public.profiles TO authenticated;
--   GRANT DELETE, INSERT, UPDATE ON public.questions TO authenticated;
--   GRANT DELETE, INSERT, UPDATE ON public.scenarios TO authenticated;
--   GRANT DELETE, INSERT, UPDATE ON public.season_cohort_members TO authenticated;
--   GRANT DELETE, INSERT, UPDATE ON public.season_cohorts TO authenticated;
--   GRANT DELETE, INSERT, UPDATE ON public.season_placements TO authenticated;
--   GRANT DELETE, INSERT, UPDATE ON public.team_kicks TO authenticated;
--   GRANT DELETE, INSERT, UPDATE ON public.team_members TO authenticated;
--   GRANT DELETE, INSERT, UPDATE ON public.team_weekly_rewards TO authenticated;
--   GRANT DELETE, INSERT, UPDATE ON public.teams TO authenticated;
--   GRANT DELETE, INSERT, UPDATE ON public.units TO authenticated;
--   GRANT DELETE ON public.user_progress TO authenticated;
--   GRANT DELETE, INSERT, UPDATE ON public.user_weekly_quest_claims TO authenticated;
--   GRANT DELETE, INSERT, UPDATE ON public.vocab_images TO authenticated;
--   GRANT DELETE, UPDATE ON public.weakness_events TO authenticated;
--   GRANT DELETE, INSERT, UPDATE ON public.weekly_quests TO authenticated;

REVOKE DELETE, INSERT, UPDATE ON public.achievements FROM authenticated;
REVOKE DELETE ON public.activity_days FROM authenticated;
REVOKE DELETE, INSERT, UPDATE ON public.ai_rate_limits FROM authenticated;
REVOKE DELETE, INSERT, UPDATE ON public.ai_usage FROM authenticated;
REVOKE UPDATE ON public.blocked_users FROM authenticated;
REVOKE DELETE, INSERT, UPDATE ON public.challenge_completions FROM authenticated;
REVOKE DELETE, INSERT, UPDATE ON public.challenge_templates FROM authenticated;
REVOKE DELETE, UPDATE ON public.content_reports FROM authenticated;
REVOKE DELETE, INSERT, UPDATE ON public.duel_queue FROM authenticated;
REVOKE DELETE, INSERT, UPDATE ON public.duels FROM authenticated;
REVOKE DELETE, INSERT, UPDATE ON public.friend_activity_events FROM authenticated;
REVOKE DELETE, INSERT, UPDATE ON public.friend_invite_codes FROM authenticated;
REVOKE UPDATE ON public.friendships FROM authenticated;
REVOKE DELETE, INSERT, UPDATE ON public.lessons FROM authenticated;
REVOKE DELETE, INSERT, UPDATE ON public.levels FROM authenticated;
REVOKE DELETE ON public.nudges FROM authenticated;
REVOKE DELETE, INSERT, UPDATE ON public.placement_questions FROM authenticated;
REVOKE DELETE, INSERT, UPDATE ON public.podcast_transcripts FROM authenticated;
REVOKE DELETE ON public.profiles FROM authenticated;
REVOKE DELETE, INSERT, UPDATE ON public.questions FROM authenticated;
REVOKE DELETE, INSERT, UPDATE ON public.scenarios FROM authenticated;
REVOKE DELETE, INSERT, UPDATE ON public.season_cohort_members FROM authenticated;
REVOKE DELETE, INSERT, UPDATE ON public.season_cohorts FROM authenticated;
REVOKE DELETE, INSERT, UPDATE ON public.season_placements FROM authenticated;
REVOKE DELETE, INSERT, UPDATE ON public.team_kicks FROM authenticated;
REVOKE DELETE, INSERT, UPDATE ON public.team_members FROM authenticated;
REVOKE DELETE, INSERT, UPDATE ON public.team_weekly_rewards FROM authenticated;
REVOKE DELETE, INSERT, UPDATE ON public.teams FROM authenticated;
REVOKE DELETE, INSERT, UPDATE ON public.units FROM authenticated;
REVOKE DELETE ON public.user_progress FROM authenticated;
REVOKE DELETE, INSERT, UPDATE ON public.user_weekly_quest_claims FROM authenticated;
REVOKE DELETE, INSERT, UPDATE ON public.vocab_images FROM authenticated;
REVOKE DELETE, UPDATE ON public.weakness_events FROM authenticated;
REVOKE DELETE, INSERT, UPDATE ON public.weekly_quests FROM authenticated;
