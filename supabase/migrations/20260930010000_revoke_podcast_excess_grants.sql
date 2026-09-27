-- docs/BACKLOG.md §0.8 "Carried risks": podcast_episodes and podcast_folders
-- were only ever explicitly GRANTed SELECT (20260926030000_podcast_library.sql),
-- but a freshly created public-schema table gets Supabase's own default
-- INSERT/UPDATE/DELETE grants to `anon`/`authenticated` unless something
-- revokes them -- the same gap 20260920050000_revoke_direct_gamification_writes.sql
-- closed for the gamification tables. `anon` also still holds INSERT on
-- podcast_play_events; `authenticated`'s INSERT there was already revoked by
-- 20260926223031_podcast_play_event_rpc.sql when record_podcast_play_event
-- became the only writer.
--
-- Not a live vulnerability: RLS is enabled on all three tables with
-- SELECT-only policies (podcast_folders_select_all,
-- podcast_episodes_select_published), and podcast_play_events has no INSERT
-- policy for anon either, so "no policy" already means deny. This closes
-- the grant as unnecessary surface, the same reasoning the gamification
-- migration used, not as an incident response.
--
-- Content writes stay exclusively through scripts/podcast-tool.ts with the
-- service_role key, which bypasses RLS/grants entirely and is unaffected.

REVOKE INSERT, UPDATE, DELETE ON public.podcast_episodes FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.podcast_folders FROM authenticated, anon;
REVOKE INSERT ON public.podcast_play_events FROM anon;
