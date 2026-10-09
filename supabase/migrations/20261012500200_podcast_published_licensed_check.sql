-- Only providers whose output the app holds distribution rights to may be
-- published. scripts/podcast-tool.ts and the admin publish action already
-- refuse anything else; this makes the database refuse it too, so no other
-- path (a SQL console, a future admin screen) can publish unlicensed audio.
--
-- NOT VALID: Postgres enforces the constraint on every new INSERT and on every
-- UPDATE of a row, but does not scan the rows that already exist, so the
-- currently published rows do not fail it now. One consequence to know about:
-- until those rows are unpublished (or re-voiced), an UPDATE of one of them
-- that leaves published = true (for example editing its title in the admin
-- app) is rejected. Unpublishing sets published = false, which passes, so
-- `podcast-tool.ts unpublish` is unaffected. A later migration runs
-- VALIDATE CONSTRAINT once no published row has a provider outside the list.
--
-- The provider list is pinned against src/lib/podcast-provenance.ts
-- (LICENSED_PROVIDERS) by src/lib/podcast-migrations.test.ts.
--
-- Depends on: 20261012500100 (adds voice_provider).
--
-- Rollback:
--   ALTER TABLE public.podcast_episodes DROP CONSTRAINT podcast_episodes_published_licensed;
ALTER TABLE public.podcast_episodes
  ADD CONSTRAINT podcast_episodes_published_licensed
  CHECK (NOT published OR voice_provider IN ('deepgram', 'human')) NOT VALID;
