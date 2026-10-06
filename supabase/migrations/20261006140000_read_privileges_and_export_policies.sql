-- BACKLOG 0.0-ae follow-ups 2 and 3: remove read privileges nothing uses, and fix a silent GDPR-export gap.
--
-- 1. EXPORT GAP. exportMyData reads each table as the signed-in user. challenge_completions, duel_queue,
--    season_cohort_members and season_placements had RLS on and NO SELECT policy, so those reads returned no rows
--    and no error: the data-portability export silently omitted them (live: 2, 1, 2 and 0 rows at audit time).
--    Each gets an own-row SELECT policy (user_id = the caller). SELECT was already granted; only the policy was missing.
-- 2. `anon` (not signed in) held SELECT on 38 tables; all but nine returned nothing (their policies need a user).
--    It keeps SELECT only on the nine public content tables (achievements, lessons, levels, placement_questions,
--    questions, scenarios, units, vocab_images, weekly_quests). Every table read in the web, Edge Function, iOS and
--    Android code carries a user's JWT, so no signed-out client depends on the rest.
-- 3. `authenticated` loses SELECT on four tables with no policy and no client read path: friend_invite_codes,
--    season_cohorts, team_kicks, team_weekly_rewards (only SECURITY DEFINER functions and the service role touch them).
--
-- Not touched: content_reports (a WITH CHECK on insert may need the column privilege; the table stays write-only
-- by policy), teams (column-level SELECT), service_role, any write privilege.
--
-- ROLLBACK (re-adds exactly what is removed; the four policies can be dropped with DROP POLICY <t>_select_own ON public.<t>):
--   GRANT SELECT ON public.activity_days TO anon;
--   GRANT SELECT ON public.ai_rate_limits TO anon;
--   GRANT SELECT ON public.ai_usage TO anon;
--   GRANT SELECT ON public.challenge_completions TO anon;
--   GRANT SELECT ON public.challenge_templates TO anon;
--   GRANT SELECT ON public.duel_queue TO anon;
--   GRANT SELECT ON public.duels TO anon;
--   GRANT SELECT ON public.friend_invite_codes TO anon;
--   GRANT SELECT ON public.friendships TO anon;
--   GRANT SELECT ON public.language_progress TO anon;
--   GRANT SELECT ON public.lesson_completions TO anon;
--   GRANT SELECT ON public.podcast_episodes TO anon;
--   GRANT SELECT ON public.podcast_folders TO anon;
--   GRANT SELECT ON public.podcast_play_events TO anon;
--   GRANT SELECT ON public.podcast_playback TO anon;
--   GRANT SELECT ON public.podcast_transcripts TO anon;
--   GRANT SELECT ON public.profiles TO anon;
--   GRANT SELECT ON public.review_items TO anon;
--   GRANT SELECT ON public.season_cohort_members TO anon;
--   GRANT SELECT ON public.season_cohorts TO anon;
--   GRANT SELECT ON public.season_placements TO anon;
--   GRANT SELECT ON public.team_kicks TO anon;
--   GRANT SELECT ON public.team_members TO anon;
--   GRANT SELECT ON public.team_weekly_rewards TO anon;
--   GRANT SELECT ON public.teams TO anon;
--   GRANT SELECT ON public.user_achievements TO anon;
--   GRANT SELECT ON public.user_progress TO anon;
--   GRANT SELECT ON public.user_weekly_quest_claims TO anon;
--   GRANT SELECT ON public.weakness_events TO anon;
--   GRANT SELECT ON public.friend_invite_codes TO authenticated;
--   GRANT SELECT ON public.season_cohorts TO authenticated;
--   GRANT SELECT ON public.team_kicks TO authenticated;
--   GRANT SELECT ON public.team_weekly_rewards TO authenticated;

CREATE POLICY challenge_completions_select_own ON public.challenge_completions FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY duel_queue_select_own ON public.duel_queue FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY season_cohort_members_select_own ON public.season_cohort_members FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY season_placements_select_own ON public.season_placements FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

REVOKE SELECT ON public.activity_days FROM anon;
REVOKE SELECT ON public.ai_rate_limits FROM anon;
REVOKE SELECT ON public.ai_usage FROM anon;
REVOKE SELECT ON public.challenge_completions FROM anon;
REVOKE SELECT ON public.challenge_templates FROM anon;
REVOKE SELECT ON public.duel_queue FROM anon;
REVOKE SELECT ON public.duels FROM anon;
REVOKE SELECT ON public.friend_invite_codes FROM anon;
REVOKE SELECT ON public.friendships FROM anon;
REVOKE SELECT ON public.language_progress FROM anon;
REVOKE SELECT ON public.lesson_completions FROM anon;
REVOKE SELECT ON public.podcast_episodes FROM anon;
REVOKE SELECT ON public.podcast_folders FROM anon;
REVOKE SELECT ON public.podcast_play_events FROM anon;
REVOKE SELECT ON public.podcast_playback FROM anon;
REVOKE SELECT ON public.podcast_transcripts FROM anon;
REVOKE SELECT ON public.profiles FROM anon;
REVOKE SELECT ON public.review_items FROM anon;
REVOKE SELECT ON public.season_cohort_members FROM anon;
REVOKE SELECT ON public.season_cohorts FROM anon;
REVOKE SELECT ON public.season_placements FROM anon;
REVOKE SELECT ON public.team_kicks FROM anon;
REVOKE SELECT ON public.team_members FROM anon;
REVOKE SELECT ON public.team_weekly_rewards FROM anon;
REVOKE SELECT ON public.teams FROM anon;
REVOKE SELECT ON public.user_achievements FROM anon;
REVOKE SELECT ON public.user_progress FROM anon;
REVOKE SELECT ON public.user_weekly_quest_claims FROM anon;
REVOKE SELECT ON public.weakness_events FROM anon;

REVOKE SELECT ON public.friend_invite_codes FROM authenticated;
REVOKE SELECT ON public.season_cohorts FROM authenticated;
REVOKE SELECT ON public.team_kicks FROM authenticated;
REVOKE SELECT ON public.team_weekly_rewards FROM authenticated;
