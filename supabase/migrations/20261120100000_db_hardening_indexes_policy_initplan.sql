-- Database hardening (advisor-driven): covering indexes for unindexed foreign
-- keys, and initplan-safe auth calls in four RLS policies. No behaviour change,
-- no grant changes, no column changes. Idempotent: IF NOT EXISTS indexes, and
-- ALTER POLICY re-applies the same expression.
-- Owner action (dashboard, not SQL): enable leaked-password protection in
-- Supabase Auth settings.

create index if not exists idx_admin_users_added_by on public.admin_users (added_by);
create index if not exists idx_buddy_members_pair_id on public.buddy_members (pair_id);
create index if not exists idx_buddy_requests_from_user on public.buddy_requests (from_user);
create index if not exists idx_challenge_completions_template_id on public.challenge_completions (template_id);
create index if not exists idx_duels_challenger_id on public.duels (challenger_id);
create index if not exists idx_duels_opponent_id on public.duels (opponent_id);
create index if not exists idx_duels_winner_id on public.duels (winner_id);
create index if not exists idx_listen_progress_episode_id on public.listen_progress (episode_id);
create index if not exists idx_placement_questions_level_id on public.placement_questions (level_id);
create index if not exists idx_podcast_episodes_level_id on public.podcast_episodes (level_id);
create index if not exists idx_podcast_folders_level_id on public.podcast_folders (level_id);
create index if not exists idx_podcast_playback_episode_id on public.podcast_playback (episode_id);
create index if not exists idx_podcast_quiz_awards_episode_id on public.podcast_quiz_awards (episode_id);
create index if not exists idx_season_cohort_members_user_id on public.season_cohort_members (user_id);
create index if not exists idx_support_notify_queue_message_id on public.support_notify_queue (message_id);
create index if not exists idx_team_kicks_team_id on public.team_kicks (team_id);
create index if not exists idx_team_mission_rewards_user_id on public.team_mission_rewards (user_id);
create index if not exists idx_teams_created_by on public.teams (created_by);
create index if not exists idx_units_level_id on public.units (level_id);
create index if not exists idx_video_watches_video_id on public.video_watches (video_id);
create index if not exists idx_videos_level_id on public.videos (level_id);

alter policy user_weekly_quest_claims_select_own on public.user_weekly_quest_claims
  using ((select auth.uid()) = user_id);
alter policy weakness_events_select_own on public.weakness_events
  using ((select auth.uid()) = user_id);
alter policy duels_select_own on public.duels
  using (((select auth.uid()) = challenger_id) or ((select auth.uid()) = opponent_id));
alter policy podcast_quiz_awards_select_own on public.podcast_quiz_awards
  using (user_id = (select auth.uid()));
