-- Videos that are not published are no longer fetchable by URL (docs/OPEN-ITEMS.md item 29a, the same fix as podcast
-- audio in 20261128120000).
--
-- Published videos keep their files (mp4, poster, captions) in the public `videos` bucket at the paths on the row, so
-- no client URL changes (web, iOS and Android all build the public URL from `videos`). The files of an unpublished
-- video live in this PRIVATE bucket at the same paths. There is no storage.objects policy for it at all: only the
-- service role (scripts/video-tool.ts) can read or write it. `add` uploads here; `publish` copies the three objects
-- into `videos` before the row flips; `unpublish` copies them back and removes the public copies
-- (src/lib/video-buckets.ts).
--
-- Existing data: checked read-only on 2026-11-26, the public bucket held only the 3 published videos' files and no
-- other object, so nothing needs to be moved. No table, so no grants are involved.
--
-- Same size and type limits as `videos`, so a wrong upload fails loudly in either bucket.
-- Depends on 20261115100000 (the videos bucket). Rollback: move any objects back, then
--   DELETE FROM storage.buckets WHERE id = 'video-drafts';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'video-drafts', 'video-drafts', false, 52428800,
  ARRAY['video/mp4', 'image/jpeg', 'image/png', 'image/webp', 'text/vtt']
)
ON CONFLICT (id) DO UPDATE SET public = false;
