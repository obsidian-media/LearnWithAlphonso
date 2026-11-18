-- Narrow the write privileges the client roles hold on progress and profile tables.
--
-- Background: tables created before 20261006120000 received Supabase's platform default grants, which are in no
-- migration file; later migrations trimmed some of them. This one removes the write privileges that no client path
-- needs and that RLS alone ("own row") would otherwise leave open. src/lib/client-write-grants-guard.test.ts now
-- computes every table's final client write privileges from the migrations and fails on any not on its reviewed list.
--
-- 1. REMOVED (progress and reward tables; the rows are written only by service-role code and SECURITY DEFINER functions):
--    - DELETE on lesson_completions, language_progress, review_items, user_achievements. The only client user of
--      DELETE was deleteMyAccount's caller-side pre-delete; every one of these tables is ON DELETE CASCADE from
--      auth.users, so the account deletion removes them anyway (that pre-delete is dropped in the same PR). Review
--      retire goes through apply_review_grade (service role); the native apps only GET these tables.
--    - UPDATE and DELETE on podcast_play_events. Clients insert only through record_podcast_play_event (SECURITY
--      DEFINER); no client path updates or deletes a play event (retention sweeps run as the service role).
--
-- 2. profiles: table-level INSERT and UPDATE replaced by a column-level UPDATE.
--    - INSERT: the only writer is handle_new_user (SECURITY DEFINER signup trigger); no client inserts or upserts.
--    - UPDATE kept on avatar_seed, theme, country only: web updateProfile (theme, avatar_seed), web and /api
--      saveLearnerProfile (country), iOS and Android avatar-seed/theme PATCHes. display_name and name_confirmed_at
--      are NOT client-writable: the name goes through confirm_display_name (name filter + 2 to 40 chars + the
--      confirmation stamp). Before this a direct PATCH could set name_confirmed_at, or a name that skipped the
--      display_name_problem() rules. ai_consent_at is likewise written only by set_ai_consent (definer).
--
-- 3. KEPT on purpose (audited 2026-11-17; nothing that grants a reward reads these):
--    - podcast_playback (SELECT, INSERT, UPDATE, DELETE own rows): the resume position (web savePlaybackPosition,
--      Android PodcastClient, iOS PodcastClient upsert). submit_podcast_quiz and the complete-podcast-quiz function
--      award XP from podcast_quiz_awards and never read this table or completed_at; the only reader of
--      completed_at is admin_numbers_own (a staff dashboard count, no reward). No XP, quest, streak, achievement,
--      gems, league or mission SQL or TS reads it.
--    - listen_progress, video_watches, tutor_memory (SELECT, DELETE): "clear my history". They are written only by
--      definer functions or service-role code; the single other reader is the learning-path recommendation read,
--      which awards nothing. Deleting a row can only reset the learner's own history.
--    - friendships DELETE (unfriend), blocked_users INSERT/DELETE, device_tokens DELETE: unchanged here, each backed by a policy
--      and a real client path (and none feeds a reward).
--
-- ROLLBACK (restores the previous grants):
--   GRANT DELETE ON public.lesson_completions, public.language_progress, public.review_items,
--     public.user_achievements TO authenticated;
--   GRANT UPDATE, DELETE ON public.podcast_play_events TO authenticated;
--   REVOKE UPDATE (avatar_seed, theme, country) ON public.profiles FROM authenticated;
--   GRANT INSERT, UPDATE ON public.profiles TO authenticated;

REVOKE DELETE ON public.lesson_completions FROM authenticated, anon;
REVOKE DELETE ON public.language_progress FROM authenticated, anon;
REVOKE DELETE ON public.review_items FROM authenticated, anon;
REVOKE DELETE ON public.user_achievements FROM authenticated, anon;
REVOKE UPDATE, DELETE ON public.podcast_play_events FROM authenticated, anon;

REVOKE INSERT, UPDATE ON public.profiles FROM authenticated, anon;
GRANT UPDATE (avatar_seed, theme, country) ON public.profiles TO authenticated;
