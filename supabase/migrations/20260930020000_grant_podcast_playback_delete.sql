-- docs/BACKLOG.md §0.8 "Deferred minors": a user has no way to clear their
-- own podcast listening history. Not missing UI or an RLS gap --
-- podcast_playback_own (20260926030000_podcast_library.sql) is already
-- `FOR ALL`, scoped to `auth.uid() = user_id`, which already covers DELETE.
-- The `GRANT` line alongside it only listed SELECT, INSERT, UPDATE, so
-- Postgres blocked DELETE at the privilege check before RLS ever got a say
-- -- a policy permitting an operation the grant doesn't allow is a no-op for
-- that operation, not a partial permission.

GRANT DELETE ON public.podcast_playback TO authenticated;
