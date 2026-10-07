-- Public bucket for self-hosted vocab-card images (App Store remediation W1,
-- audit items B1/B2). Objects live at <lang>/<slug>.jpg and are written ONLY by
-- the service-role pipeline (scripts/upload-vocab-images.ts), after visual
-- review. Clients read through the public object URL, which needs no
-- storage.objects policy. Deliberately there is NO policy on storage.objects
-- for this bucket, so anon and authenticated can neither list, insert, update
-- nor delete. (podcast-audio adds a SELECT policy because its clients list
-- objects; nothing lists vocab images.)
--
-- No table is created, so the client-grants marker rule
-- (docs/database-privileges.md) does not apply.
--
-- Idempotent: scripts/upload-vocab-images.ts may create the bucket with the
-- same settings before this migration deploys; this then only re-asserts them.
--
-- Rollback: Supabase blocks direct DELETE on storage tables. Empty and drop the
-- bucket through the Storage API as the service role:
--   storage.emptyBucket('vocab-images') then storage.deleteBucket('vocab-images').
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('vocab-images', 'vocab-images', true, 524288, ARRAY['image/jpeg'])
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;
