-- Narrow client writes to the columns clients use.
--
-- Purpose: keep the write privileges of the client roles (anon, authenticated) limited to what the web and native
-- apps actually do. Tables created before 20261006120000 received Supabase's platform default grants, which are in
-- no migration file; later migrations trimmed some of them. This one removes the ones no client path needs.
-- src/lib/client-write-grants-guard.test.ts computes every table's final client write privileges from the
-- migrations and fails on any that is not on its reviewed list.
--
-- 1. Progress and reward tables (rows are written only by service-role code and SECURITY DEFINER functions):
--    - DELETE removed on lesson_completions, language_progress, review_items, user_achievements. The only client
--      user of DELETE was the caller-side pre-delete in deleteMyAccount. Each of these tables is ON DELETE CASCADE
--      from auth.users, so deleting the account removes the rows anyway; that pre-delete is dropped in the same
--      change. Review retire goes through apply_review_grade (service role); the native apps only read these tables.
--    - UPDATE and DELETE removed on podcast_play_events. Clients insert only through record_podcast_play_event
--      (SECURITY DEFINER); no client path updates or deletes a play event (retention sweeps run as service role).
--
-- 2. profiles: the table-level INSERT and UPDATE grants become a column-level UPDATE.
--    - INSERT: the only writer is handle_new_user (SECURITY DEFINER signup trigger); no client inserts or upserts.
--    - UPDATE is kept on avatar_seed, theme and country, the columns the clients write: web updateProfile (theme,
--      avatar_seed), web and /api saveLearnerProfile (country), and the iOS and Android avatar-seed and theme
--      updates. display_name and name_confirmed_at are written through confirm_display_name, which validates the
--      name and stamps the confirmation; ai_consent_at is written through set_ai_consent (definer).
--
-- 3. Kept on purpose (audited 2026-11-17):
--    - podcast_playback (SELECT, INSERT, UPDATE, DELETE own rows): the resume position (web savePlaybackPosition,
--      Android PodcastClient, iOS PodcastClient upsert). Podcast quiz XP is awarded from podcast_quiz_awards and
--      does not read this table; its only reader of completed_at is admin_numbers_own (a staff dashboard count).
--    - listen_progress, video_watches, tutor_memory (SELECT, DELETE): "clear my history". Written by definer
--      functions or service-role code; the only other reader is the learning-path recommendation read.
--    - friendships DELETE (unfriend), blocked_users INSERT/DELETE, device_tokens DELETE: unchanged here, each backed
--      by a policy and a real client path.
--
-- Deploy order: the web change (deleteMyAccount no longer pre-deletes the four tables above) must ship with or before
-- this migration. Rolling the web app back to code from before this change while this migration stays applied makes
-- account deletion fail, because the old code's pre-delete would hit a missing DELETE grant: restore the DELETE grants
-- (see the ROLLBACK block) first. Rolling the migration back is safe for the current web code.
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
