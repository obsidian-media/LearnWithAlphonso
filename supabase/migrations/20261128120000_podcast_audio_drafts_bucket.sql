-- Podcast audio that is not published is no longer fetchable by URL (docs/OPEN-ITEMS.md item 29a; owner decision "make it private please").
--
-- Published episodes keep their audio in the public `podcast-audio` bucket at `audio_path`, so no client URL changes.
-- Audio of an unpublished episode lives in this PRIVATE bucket at the same path. There is no storage.objects policy
-- for it at all: only the service role (scripts/podcast-tool.ts and the admin console) can read or write it.
-- Publishing copies the object into `podcast-audio` before the row flips; unpublishing copies it back and removes the
-- public copy (src/lib/podcast-audio-buckets.ts).
--
-- Existing unpublished audio is moved by scripts/podcast-audio-privatise.ts, run once with the service role
-- (storage objects cannot be moved safely in SQL). No table, so no grants are involved.
--
-- Depends on 20260926030000 (the podcast-audio bucket). Rollback: move any objects back, then
--   DELETE FROM storage.buckets WHERE id = 'podcast-audio-drafts';

INSERT INTO storage.buckets (id, name, public)
VALUES ('podcast-audio-drafts', 'podcast-audio-drafts', false)
ON CONFLICT (id) DO UPDATE SET public = false;
